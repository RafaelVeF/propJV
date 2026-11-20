import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import {
    MessageType,
    PlayerRole,
    type Player,
    type NetworkMessage,
    type PlayerMovePayload,
    type TransformPropPayload,
    type PropLockPayload,
    type PropWhistlePayload,
    type HunterEmotePayload,
    DEFAULT_HUNTER_EMOTES,
    type HunterShootPayload,
    type HunterZapAimPayload,
    type CreateRoomPayload,
    type JoinRoomPayload,
    type ShotFiredPayload,
    type GrenadeExplodedPayload,
    type MineExplodedPayload,
    type ZapStatePayload,
    type PlayerDiedPayload,
    type PlayerHitPayload,
    type SpectatorPlayer,
    type KickPlayerPayload,
    Rectangle,
    DEFAULT_PROPS,
    GAMEPLAY_CONFIG,
    GamePhase,
    WeaponType,
    WEAPONS,
    isAlive
} from '@prop-hunt/shared';
import { GameLoop } from './GameLoop.js';
import { handleChatMessage } from './systems/chat.js';
import { updatePlayerPosition } from './systems/movement.js';
import { parseTiledCollisions } from './utils/mapLoader.js';
import { resolvePlayerName } from './utils/playerIdentity.js';
import { fetchAuthenticatedPlayerIdentity } from './services/playerIdentityService.js';
import { GAME_CONFIG } from './config/game.js';
import { RoundManager } from './RoundManager.js';
import {
    HunterArsenal,
    resolvePistolShot,
    resolveMeleeHit,
    resolveZapBeam,
    computeGrenadeLanding,
    computeMineLanding,
    shouldMineDetonate,
    resolveExplosion
} from './systems/combat.js';
import {
    MatchTelemetryTracker,
    type TelemetryInitPlayer,
    type WinningTeam
} from './systems/telemetryTracker.js';
import {
    sendServerHeartbeat,
    sendServerLog,
    sendMatchReport
} from './services/internalApiClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

if (!process.env.JWT_SECRET?.trim()) {
    console.warn('[GameServer] ATTENTION : JWT_SECRET manquant dans .env — les joueurs connectés seront traités comme invités !');
}
if (!process.env.INTERNAL_API_SECRET?.trim()) {
    console.warn('[GameServer] ATTENTION : INTERNAL_API_SECRET manquant dans .env — les rapports de fin de partie ne seront pas envoyés à api-master !');
}

const SERVER_PORT = Number(process.env.PORT) || 8080;
const SERVER_ID = process.env.SERVER_ID?.trim() || 'srv-local-01';
const SERVER_NAME = process.env.SERVER_NAME?.trim() || 'Serveur Local #1 - FR';
const SERVER_HOST = process.env.SERVER_HOST?.trim() || 'localhost';
const CURRENT_MAP = 'map_01_32p';
const MAX_PLAYERS = 32;

const wss = new WebSocketServer({ port: SERVER_PORT });
console.log(`[GameServer] Serveur WebSocket (${SERVER_ID}) démarré sur le port ${SERVER_PORT}`);

// Suivi des clients connectés (ID attribué dès la connexion, mais sans salon par défaut)
const clients = new Map<WebSocket, string>();            // ws -> playerId
const clientRooms = new Map<WebSocket, string>();        // ws -> roomKey (uniquement si dans un salon)
const clientNames = new Map<string, string>();           // playerId -> name
const clientUserIds = new Map<string, number | null>();  // playerId -> userId SQL (null si invité)
const lastSpeedAnomalyLog = new Map<string, number>();   // playerId -> timestamp dernier log WARN

function verifyJwtToken(token?: string | null): { userId: number | null; username?: string } {
    const cleanToken = token?.trim();
    if (!cleanToken) {
        return { userId: null };
    }
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
        console.warn('[GameServer] Impossible de vérifier le JWT : JWT_SECRET non configuré.');
        return { userId: null };
    }
    try {
        const decoded = jwt.verify(cleanToken, secret) as { userId?: unknown; username?: unknown };
        const parsedId = Number(decoded?.userId);
        const userId = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
        const username = typeof decoded?.username === 'string' && decoded.username.trim()
            ? decoded.username.trim()
            : undefined;
        return { userId, username };
    } catch (error) {
        console.warn(
            '[GameServer] Échec vérification JWT :',
            error instanceof Error ? error.message : String(error)
        );
        return { userId: null };
    }
}

async function resolvePlayerAuth(token?: string | null): Promise<{ userId: number | null; username?: string }> {
    const signedIdentity = verifyJwtToken(token);
    if (!token?.trim()) return signedIdentity;

    const apiOrigin = process.env.API_ORIGIN?.trim()
        || process.env.API_MASTER_URL?.trim()
        || 'http://localhost:3000';
    const databaseIdentity = await fetchAuthenticatedPlayerIdentity(token, apiOrigin);
    if (databaseIdentity) return databaseIdentity;

    // Keep valid local JWT support when api-master is temporarily unavailable.
    return signedIdentity;
}

async function refreshClientIdentity(playerId: string, token?: string | null): Promise<void> {
    const auth = await resolvePlayerAuth(token);
    clientUserIds.set(playerId, auth.userId);
    clientNames.set(playerId, auth.username || `Player_${playerId.substring(0, 4)}`);
}

function getNearestSeekerDistance(room: GameRoom, origin: { x: number; y: number }): number | null {
    let minDist: number | null = null;
    room.players.forEach((p) => {
        if (p.role === PlayerRole.HUNTER && isAlive(p)) {
            const d = Math.hypot(p.x - origin.x, p.y - origin.y);
            if (minDist === null || d < minDist) {
                minDist = d;
            }
        }
    });
    return minDist !== null ? Math.round(minDist) : null;
}

interface GameRoom {
    key: string;
    roundManager: RoundManager;
    telemetryTracker: MatchTelemetryTracker;
    players: Map<string, Player>;
    playerInputs: Map<string, { vx: number; vy: number }>;
    playerRegenTimers: Map<string, number>;
    /** Joueurs en mode God (0 dégât, traverse les obstacles) */
    godPlayers: Set<string>;
    /** Multiplicateurs de vitesse personnalisés (/speed) */
    playerSpeeds: Map<string, number>;
    /** Armes de chaque chasseur (munitions, délais), recréées à chaque manche */
    arsenals: Map<string, HunterArsenal>;
    /** Grenades lancées qui n'ont pas encore explosé */
    pendingGrenades: PendingGrenade[];
    /** Faisceaux Zap continus actuellement actifs par chasseur */
    activeZaps: Map<string, ActiveZap>;
    /** Mines posées sur la carte */
    activeMines: ActiveMine[];
}

interface PendingGrenade {
    id: string;
    hunterId: string;
    x: number;
    y: number;
    explodeAt: number;
}

interface ActiveZap {
    hunterId: string;
    aimX: number;
    aimY: number;
    endsAt: number;
    damageAcc: number;
    lastHitId: string | null;
}

interface ActiveMine {
    id: string;
    hunterId: string;
    x: number;
    y: number;
    armedAt: number;
}

const rooms = new Map<string, GameRoom>();

// Coordonnées de spawn autoritaires
const SPAWN_HUNTER = { x: 250, y: 250 };
const SPAWN_PROP = { x: 600, y: 600 };

function broadcastToRoom(roomKey: string, message: NetworkMessage, excludeWs?: WebSocket) {
    const dataString = JSON.stringify(message);
    clients.forEach((_, clientWs) => {
        if (
            clientWs !== excludeWs &&
            clientRooms.get(clientWs) === roomKey &&
            clientWs.readyState === WebSocket.OPEN
        ) {
            clientWs.send(dataString);
        }
    });
}

/** Envoie un message à un seul joueur d'un salon */
function sendToPlayer(roomKey: string, playerId: string, message: NetworkMessage) {
    const dataString = JSON.stringify(message);
    clients.forEach((clientPlayerId, clientWs) => {
        if (
            clientPlayerId === playerId &&
            clientRooms.get(clientWs) === roomKey &&
            clientWs.readyState === WebSocket.OPEN
        ) {
            clientWs.send(dataString);
        }
    });
}

/**
 * Recrée l'état "en jeu" d'un joueur pour une nouvelle manche (ou le retour au salon).
 * Indispensable car un joueur mort a été remplacé par un SpectatorPlayer sans prop.
 */
function buildRoundPlayer(previous: Player, role: PlayerRole.HUNTER | PlayerRole.PROP, spawn: { x: number; y: number }): Player {
    const base = {
        id: previous.id,
        name: previous.name,
        x: spawn.x,
        y: spawn.y,
        lastHitTimestamp: 0
    };
    if (role === PlayerRole.HUNTER) {
        return {
            ...base,
            role: PlayerRole.HUNTER,
            health: 100,
            maxHealth: 100,
            ammo: WEAPONS[WeaponType.PISTOL].magazineSize
        };
    }
    // Les props commencent chaque manche sous forme humaine
    const humanProp = DEFAULT_PROPS[0];
    return {
        ...base,
        role: PlayerRole.PROP,
        health: humanProp.health,
        maxHealth: humanProp.health,
        isLocked: false,
        currentProp: humanProp,
        variantIndex: 0,
        currentSpriteKey: humanProp.internalName
    };
}

function stopHunterZap(room: GameRoom, hunterId: string) {
    if (!room.activeZaps.delete(hunterId)) return;
    broadcastToRoom(room.key, {
        type: MessageType.ZAP_STATE,
        payload: {
            hunterId,
            active: false,
            originX: 0,
            originY: 0,
            impactX: 0,
            impactY: 0
        } satisfies ZapStatePayload
    });
}

function clearRoomCombatEntities(room: GameRoom) {
    room.pendingGrenades = [];
    room.activeMines = [];
    Array.from(room.activeZaps.keys()).forEach(id => stopHunterZap(room, id));
}

function removeHunterMines(room: GameRoom, hunterId: string) {
    room.activeMines = room.activeMines.filter(m => m.hunterId !== hunterId);
}

function countHunterMines(room: GameRoom, hunterId: string): number {
    return room.activeMines.reduce((acc, m) => acc + (m.hunterId === hunterId ? 1 : 0), 0);
}

function sendWeaponState(room: GameRoom, hunterId: string, now: number = Date.now()) {
    const arsenal = room.arsenals.get(hunterId);
    if (!arsenal) return;
    arsenal.setDeployedMines(countHunterMines(room, hunterId));
    sendToPlayer(room.key, hunterId, {
        type: MessageType.WEAPON_STATE,
        payload: arsenal.getState(now)
    });
}

/**
 * Applique des dégâts de façon autoritaire, prévient tout le salon,
 * et gère la mort (passage en spectateur + vérification de fin de manche).
 */
function applyDamage(room: GameRoom, targetId: string, damage: number, attackerId?: string, weapon?: WeaponType) {
    if (room.godPlayers.has(targetId)) return;
    const target = room.players.get(targetId);
    if (!target || !isAlive(target) || damage <= 0) return;

    target.health = Math.max(0, target.health - damage);
    target.lastHitTimestamp = Date.now();
    room.playerRegenTimers.delete(targetId);
    const isKilled = target.health <= 0;

    // Télémétrie : enregistrement de l'impact et des dégâts
    const attacker = attackerId ? room.players.get(attackerId) : undefined;
    const hitDist = attacker ? Math.round(Math.hypot(attacker.x - target.x, attacker.y - target.y)) : null;
    const isPropHit = target.role === PlayerRole.PROP && isKilled;
    room.telemetryTracker.recordHit(attackerId, targetId, damage, isPropHit, hitDist);

    console.log(`[GameServer][${room.key}] ${target.name} a subi ${damage} dégâts${weapon ? ` (${WEAPONS[weapon].displayName})` : ''} (HP: ${target.health}/${target.maxHealth || 100})`);

    broadcastToRoom(room.key, {
        type: MessageType.PLAYER_HIT,
        payload: {
            targetPlayerId: targetId,
            damage,
            isKilled,
            attackerId,
            weapon,
            health: target.health,
            maxHealth: target.maxHealth,
            lastHitTimestamp: target.lastHitTimestamp
        } satisfies PlayerHitPayload
    });

    if (isKilled) {
        killPlayer(room, targetId, attackerId, weapon);
    }
}

/** Passe un joueur mort en mode spectateur jusqu'à la fin de la manche */
function killPlayer(room: GameRoom, victimId: string, killerId?: string, weapon?: WeaponType) {
    const victim = room.players.get(victimId);
    if (!victim || victim.role === PlayerRole.SPECTATOR) return;

    const propDisplayName = 'currentProp' in victim ? victim.currentProp?.displayName : undefined;
    const killer = killerId && killerId !== victimId ? room.players.get(killerId) : undefined;
    const elimDist = killer ? Math.round(Math.hypot(killer.x - victim.x, killer.y - victim.y)) : null;

    // Télémétrie : enregistrement de l'élimination et du temps de survie figé
    room.telemetryTracker.recordElimination(killer?.id, victimId, elimDist);

    const spectator: SpectatorPlayer = {
        id: victim.id,
        name: victim.name,
        x: victim.x,
        y: victim.y,
        health: 0,
        maxHealth: victim.maxHealth,
        lastHitTimestamp: victim.lastHitTimestamp,
        role: PlayerRole.SPECTATOR
    };
    room.players.set(victimId, spectator);
    room.playerInputs.set(victimId, { vx: 0, vy: 0 });
    room.playerRegenTimers.delete(victimId);
    room.arsenals.delete(victimId);
    stopHunterZap(room, victimId);

    console.log(`[GameServer][${room.key}] ${victim.name} est mort${killer ? ` (tué par ${killer.name})` : ''} -> spectateur`);

    broadcastToRoom(room.key, {
        type: MessageType.PLAYER_DIED,
        payload: {
            playerId: victimId,
            playerName: victim.name,
            killerId: killer?.id,
            killerName: killer?.name,
            weapon,
            x: victim.x,
            y: victim.y,
            propDisplayName
        } satisfies PlayerDiedPayload
    });

    // Le RoundManager compte les kills/score et termine la manche s'il ne reste plus de prop
    room.roundManager.handlePlayerDeath(victimId, killer?.id);
}

/** Traite une attaque de chasseur (pistolet, pied de biche ou grenade) */
function handleHunterAttack(room: GameRoom, hunterId: string, payload: HunterShootPayload) {
    const hunter = room.players.get(hunterId);
    if (!hunter || !isAlive(hunter) || hunter.role !== PlayerRole.HUNTER) return;
    if (!room.roundManager.canPlayerShoot(hunterId)) return;

    const weapon = payload.weapon;
    if (!weapon || !(weapon in WEAPONS)) return;
    if (!Number.isFinite(payload.targetX) || !Number.isFinite(payload.targetY)) return;

    const arsenal = room.arsenals.get(hunterId);
    if (!arsenal) return;

    const now = Date.now();
    arsenal.setDeployedMines(countHunterMines(room, hunterId));
    const refusal = arsenal.checkUse(weapon, now);
    if (refusal) {
        // On renvoie l'état officiel pour que le HUD du client se recale
        sendWeaponState(room, hunterId, now);
        return;
    }
    arsenal.consume(weapon, now);
    room.telemetryTracker.recordShot(hunterId);

    const aim = { x: payload.targetX, y: payload.targetY };
    const players = room.players.values();

    if (weapon === WeaponType.GRENADE) {
        const { origin, landing } = computeGrenadeLanding(hunter, aim, staticObstacles);
        const fuseMs = WEAPONS[WeaponType.GRENADE].fuseMs ?? 1000;
        const grenadeId = `${hunterId}-${now}`;
        room.pendingGrenades.push({ id: grenadeId, hunterId, x: landing.x, y: landing.y, explodeAt: now + fuseMs });

        broadcastToRoom(room.key, {
            type: MessageType.HUNTER_SHOOT,
            payload: {
                hunterId, weapon,
                originX: origin.x, originY: origin.y,
                impactX: landing.x, impactY: landing.y,
                hitPlayerIds: [],
                fuseMs, grenadeId
            } satisfies ShotFiredPayload
        });
    } else if (weapon === WeaponType.MINE) {
        const { origin, landing } = computeMineLanding(hunter, aim, staticObstacles);
        const armDelay = WEAPONS[WeaponType.MINE].fuseMs ?? 350;
        const mineId = `mine-${hunterId}-${now}-${room.activeMines.length}`;
        room.activeMines.push({ id: mineId, hunterId, x: landing.x, y: landing.y, armedAt: now + armDelay });

        broadcastToRoom(room.key, {
            type: MessageType.HUNTER_SHOOT,
            payload: {
                hunterId, weapon,
                originX: origin.x, originY: origin.y,
                impactX: landing.x, impactY: landing.y,
                hitPlayerIds: [],
                fuseMs: armDelay, mineId
            } satisfies ShotFiredPayload
        });
    } else if (weapon === WeaponType.ZAP) {
        const duration = WEAPONS[WeaponType.ZAP].durationMs ?? 3000;
        const beam = resolveZapBeam(hunter, aim, players, staticObstacles);
        room.activeZaps.set(hunterId, {
            hunterId,
            aimX: aim.x,
            aimY: aim.y,
            endsAt: now + duration,
            damageAcc: 0,
            lastHitId: beam.hitPlayerId
        });

        broadcastToRoom(room.key, {
            type: MessageType.HUNTER_SHOOT,
            payload: {
                hunterId, weapon,
                originX: beam.origin.x, originY: beam.origin.y,
                impactX: beam.impact.x, impactY: beam.impact.y,
                hitPlayerIds: beam.hitPlayerId ? [beam.hitPlayerId] : []
            } satisfies ShotFiredPayload
        });

        broadcastToRoom(room.key, {
            type: MessageType.ZAP_STATE,
            payload: {
                hunterId,
                active: true,
                originX: beam.origin.x,
                originY: beam.origin.y,
                impactX: beam.impact.x,
                impactY: beam.impact.y,
                hitPlayerId: beam.hitPlayerId ?? undefined
            } satisfies ZapStatePayload
        });
    } else {
        const result = weapon === WeaponType.PISTOL
            ? resolvePistolShot(hunter, aim, players, staticObstacles)
            : resolveMeleeHit(hunter, aim, players, staticObstacles);

        broadcastToRoom(room.key, {
            type: MessageType.HUNTER_SHOOT,
            payload: {
                hunterId, weapon,
                originX: result.origin.x, originY: result.origin.y,
                impactX: result.impact.x, impactY: result.impact.y,
                hitPlayerIds: result.hits.map(h => h.playerId)
            } satisfies ShotFiredPayload
        });

        result.hits.forEach(hit => applyDamage(room, hit.playerId, hit.damage, hunterId, weapon));
    }

    sendWeaponState(room, hunterId, now);
}

/** Met à jour les faisceaux Zap continus (suivi de visée + 30 DPS) */
function updateZaps(room: GameRoom, now: number, deltaTime: number) {
    if (room.activeZaps.size === 0) return;

    if (room.roundManager.getPhase() !== GamePhase.HUNTING) {
        Array.from(room.activeZaps.keys()).forEach(id => stopHunterZap(room, id));
        return;
    }

    const dps = WEAPONS[WeaponType.ZAP].damage;

    room.activeZaps.forEach((zap, hunterId) => {
        const hunter = room.players.get(hunterId);
        if (!hunter || !isAlive(hunter) || hunter.role !== PlayerRole.HUNTER || now >= zap.endsAt) {
            stopHunterZap(room, hunterId);
            sendWeaponState(room, hunterId, now);
            return;
        }

        const beam = resolveZapBeam(hunter, { x: zap.aimX, y: zap.aimY }, room.players.values(), staticObstacles);
        broadcastToRoom(room.key, {
            type: MessageType.ZAP_STATE,
            payload: {
                hunterId,
                active: true,
                originX: beam.origin.x,
                originY: beam.origin.y,
                impactX: beam.impact.x,
                impactY: beam.impact.y,
                hitPlayerId: beam.hitPlayerId ?? undefined
            } satisfies ZapStatePayload
        });

        if (beam.hitPlayerId) {
            if (zap.lastHitId !== beam.hitPlayerId) {
                zap.damageAcc = 0;
                zap.lastHitId = beam.hitPlayerId;
            }
            zap.damageAcc += dps * deltaTime;
            const wholeDamage = Math.floor(zap.damageAcc);
            if (wholeDamage >= 1) {
                zap.damageAcc -= wholeDamage;
                applyDamage(room, beam.hitPlayerId, wholeDamage, hunterId, WeaponType.ZAP);
            }
        } else {
            zap.lastHitId = null;
            zap.damageAcc = 0;
        }
    });
}

/** Détecte les props qui passent sur les mines posées et déclenche l'explosion */
function updateMines(room: GameRoom, now: number) {
    if (room.activeMines.length === 0) return;
    if (room.roundManager.getPhase() !== GamePhase.HUNTING) return;

    const triggered: ActiveMine[] = [];
    const remaining: ActiveMine[] = [];
    const triggerRadius = WEAPONS[WeaponType.MINE].triggerRadius ?? 22;

    for (const mine of room.activeMines) {
        if (now >= mine.armedAt && shouldMineDetonate(mine, mine.hunterId, room.players.values(), staticObstacles, triggerRadius)) {
            triggered.push(mine);
        } else {
            remaining.push(mine);
        }
    }

    if (triggered.length === 0) return;
    room.activeMines = remaining;

    const blastRadius = WEAPONS[WeaponType.MINE].blastRadius ?? 65;
    const affectedHunters = new Set<string>();

    for (const mine of triggered) {
        affectedHunters.add(mine.hunterId);
        const hits = resolveExplosion(mine, mine.hunterId, room.players.values(), staticObstacles, WeaponType.MINE);
        broadcastToRoom(room.key, {
            type: MessageType.MINE_EXPLODED,
            payload: {
                mineId: mine.id,
                hunterId: mine.hunterId,
                x: mine.x,
                y: mine.y,
                radius: blastRadius,
                hitPlayerIds: hits.map(h => h.playerId)
            } satisfies MineExplodedPayload
        });
        hits.forEach(hit => applyDamage(room, hit.playerId, hit.damage, mine.hunterId, WeaponType.MINE));
    }

    affectedHunters.forEach(hunterId => sendWeaponState(room, hunterId, now));
}

/** Fait exploser les grenades dont le délai est écoulé */
function updateGrenades(room: GameRoom, now: number) {
    if (room.pendingGrenades.length === 0) return;
    const ready = room.pendingGrenades.filter(g => now >= g.explodeAt);
    if (ready.length === 0) return;
    room.pendingGrenades = room.pendingGrenades.filter(g => now < g.explodeAt);

    for (const grenade of ready) {
        // Si la manche est finie entre temps, la grenade fait long feu
        if (room.roundManager.getPhase() !== GamePhase.HUNTING) continue;

        const hits = resolveExplosion(grenade, grenade.hunterId, room.players.values(), staticObstacles);
        broadcastToRoom(room.key, {
            type: MessageType.GRENADE_EXPLODED,
            payload: {
                grenadeId: grenade.id,
                hunterId: grenade.hunterId,
                x: grenade.x,
                y: grenade.y,
                radius: WEAPONS[WeaponType.GRENADE].blastRadius ?? 80,
                hitPlayerIds: hits.map(h => h.playerId)
            } satisfies GrenadeExplodedPayload
        });
        hits.forEach(hit => applyDamage(room, hit.playerId, hit.damage, grenade.hunterId, WeaponType.GRENADE));
    }
}

function generateRoomKey(prefix: string = 'LOCAL'): string {
    let key = '';
    do {
        const code = randomBytes(2).toString('hex').toUpperCase();
        key = `${prefix}-${code}`;
    } while (rooms.has(key));
    return key;
}

function createRoom(isFreeplay: boolean = false): GameRoom {
    const roomKey = generateRoomKey(isFreeplay ? 'FREEPLAY' : 'LOCAL');
    const roomPlayers = new Map<string, Player>();
    const roomInputs = new Map<string, { vx: number; vy: number }>();
    const roomRegenTimers = new Map<string, number>();
    const roomArsenals = new Map<string, HunterArsenal>();
    const telemetryTracker = new MatchTelemetryTracker();

    const roundManager = new RoundManager({
        onLobbyStateChanged: (lobbyState) => {
            broadcastToRoom(roomKey, {
                type: MessageType.LOBBY_STATE,
                payload: { ...lobbyState, roomKey }
            });
        },
        onCountdownStarted: (seconds) => {
            broadcastToRoom(roomKey, {
                type: MessageType.START_COUNTDOWN,
                payload: { countdownSeconds: seconds }
            });
        },
        onCountdownCancelled: () => {
            broadcastToRoom(roomKey, {
                type: MessageType.LOBBY_STATE,
                payload: { ...roundManager.getLobbyState(), roomKey }
            });
        },
        onRoundStarted: (assignments) => {
            console.log(`[GameServer][${roomKey}] Démarrage de la manche #${roundManager.getRoundNumber()} !`);
            roomArsenals.clear();
            clearRoomCombatEntities(room);
            const trackedInitPlayers: TelemetryInitPlayer[] = [];

            assignments.forEach((role, assignedPlayerId) => {
                const previous = roomPlayers.get(assignedPlayerId);
                if (previous && (role === PlayerRole.HUNTER || role === PlayerRole.PROP)) {
                    // On reconstruit le joueur : il a pu mourir (spectateur) à la manche précédente
                    const p = buildRoundPlayer(previous, role, role === PlayerRole.HUNTER ? SPAWN_HUNTER : SPAWN_PROP);
                    roomPlayers.set(assignedPlayerId, p);
                    roomInputs.set(assignedPlayerId, { vx: 0, vy: 0 });
                    roomRegenTimers.delete(assignedPlayerId);
                    if (role === PlayerRole.HUNTER) {
                        roomArsenals.set(assignedPlayerId, new HunterArsenal());
                    }
                    trackedInitPlayers.push({
                        playerId: assignedPlayerId,
                        userId: clientUserIds.get(assignedPlayerId) ?? null,
                        username: p.name,
                        role: role === PlayerRole.HUNTER ? 'SEEKER' : 'HIDER',
                        initialProp: role === PlayerRole.PROP && 'currentProp' in p ? p.currentProp?.internalName ?? null : null,
                        seekerClass: role === PlayerRole.HUNTER ? 'seeker_recruit' : null,
                    });
                    console.log(`  - ${p.name} (userId=${clientUserIds.get(assignedPlayerId) ?? 'guest'}) : ${role} (Spawn: ${p.x}, ${p.y})`);
                }

                clients.forEach((clientPlayerId, clientWs) => {
                    if (
                        clientPlayerId === assignedPlayerId &&
                        clientRooms.get(clientWs) === roomKey &&
                        clientWs.readyState === WebSocket.OPEN
                    ) {
                        clientWs.send(JSON.stringify({
                            type: MessageType.ROUND_START,
                            payload: {
                                roundNumber: roundManager.getRoundNumber(),
                                role: role,
                                hidingDuration: roundManager.config.hidingDuration,
                                roundDuration: roundManager.config.huntingDuration + roundManager.config.hidingDuration,
                                mapId: CURRENT_MAP
                            }
                        } satisfies NetworkMessage));
                    }
                });

                if (role === PlayerRole.HUNTER) {
                    sendWeaponState(room, assignedPlayerId);
                }
            });

            telemetryTracker.startMatch(CURRENT_MAP, trackedInitPlayers);
        },
        onTimerTick: (phase, timeRemaining) => {
            broadcastToRoom(roomKey, {
                type: MessageType.ROUND_TIMER_TICK,
                payload: { phase, timeRemaining }
            });
        },
        onPhaseChanged: (phase, timeRemaining) => {
            if (phase === GamePhase.ROUND_END) {
                clearRoomCombatEntities(room);
            }
            if (phase === GamePhase.LOBBY) {
                // Retour au salon : tout le monde ressuscite sous forme humaine
                roomArsenals.clear();
                clearRoomCombatEntities(room);
                telemetryTracker.reset();
                room.godPlayers.clear();
                room.playerSpeeds.clear();
                roomPlayers.forEach((p, id) => {
                    roomPlayers.set(id, buildRoundPlayer(p, PlayerRole.PROP, { x: p.x, y: p.y }));
                    roomInputs.set(id, { vx: 0, vy: 0 });
                });
            }
            broadcastToRoom(roomKey, {
                type: MessageType.ROUND_TIMER_TICK,
                payload: { phase, timeRemaining }
            });
        },
        onRoundEnded: (results) => {
            console.log(`[GameServer][${roomKey}] Fin de manche ! Vainqueur : ${results.winner} (Raison: ${results.reason})`);
            broadcastToRoom(roomKey, {
                type: MessageType.ROUND_END,
                payload: results
            });

            const winningTeam: WinningTeam =
                results.winner === PlayerRole.HUNTER
                    ? 'SEEKER'
                    : results.winner === PlayerRole.PROP
                    ? 'HIDER'
                    : 'DRAW';

            const report = telemetryTracker.finalizeMatch(winningTeam, SERVER_ID);
            if (report) {
                console.log(
                    `[Telemetry Check][${roomKey}] Payload prêt à l'envoi :\n${JSON.stringify(report, null, 2)}`
                );
                void sendMatchReport(report);
            }
        }
    }, {
        minPlayers: 2,
        countdownDuration: 5,
        hidingDuration: 30,
        huntingDuration: 210,
        roundEndDuration: 10
    });

    const room: GameRoom = {
        key: roomKey,
        roundManager,
        telemetryTracker,
        players: roomPlayers,
        playerInputs: roomInputs,
        playerRegenTimers: roomRegenTimers,
        godPlayers: new Set<string>(),
        playerSpeeds: new Map<string, number>(),
        arsenals: roomArsenals,
        pendingGrenades: [],
        activeZaps: new Map<string, ActiveZap>(),
        activeMines: []
    };
    rooms.set(roomKey, room);
    console.log(`[GameServer] Salon créé : ${roomKey}`);
    return room;
}

function leaveCurrentRoom(ws: WebSocket, playerId: string): void {
    const roomKey = clientRooms.get(ws);
    if (!roomKey) return;

    clientRooms.delete(ws);
    const room = rooms.get(roomKey);
    if (!room) return;

    room.roundManager.removePlayer(playerId);
    room.players.delete(playerId);
    room.playerInputs.delete(playerId);
    room.playerRegenTimers.delete(playerId);
    room.godPlayers.delete(playerId);
    room.playerSpeeds.delete(playerId);
    stopHunterZap(room, playerId);
    removeHunterMines(room, playerId);

    broadcastToRoom(roomKey, {
        type: MessageType.PLAYER_LEFT,
        payload: { playerId }
    });

    if (room.players.size === 0) {
        room.roundManager.destroy();
        rooms.delete(roomKey);
        console.log(`[GameServer] Salon vide supprimé : ${roomKey}`);
    }
}

function kickPlayerFromRoom(room: GameRoom, targetId: string, reason: string): boolean {
    let targetWs: WebSocket | null = null;
    clients.forEach((cPlayerId, cWs) => {
        if (cPlayerId === targetId && clientRooms.get(cWs) === room.key) {
            targetWs = cWs;
        }
    });
    if (!targetWs) return false;

    leaveCurrentRoom(targetWs, targetId);
    if ((targetWs as WebSocket).readyState === WebSocket.OPEN) {
        (targetWs as WebSocket).send(JSON.stringify({
            type: MessageType.KICKED,
            payload: { reason }
        } satisfies NetworkMessage));
    }
    return true;
}

function swapPlayerRole(room: GameRoom, targetId: string): PlayerRole.HUNTER | PlayerRole.PROP | null {
    const current = room.players.get(targetId);
    if (!current) return null;

    const newRole = current.role === PlayerRole.HUNTER ? PlayerRole.PROP : PlayerRole.HUNTER;
    const updated = buildRoundPlayer(current, newRole, { x: current.x, y: current.y });
    room.players.set(targetId, updated);

    const session = room.roundManager.players.get(targetId);
    if (session) {
        session.role = newRole;
        session.health = updated.health;
        session.maxHealth = updated.maxHealth ?? 100;
    }

    if (newRole === PlayerRole.HUNTER) {
        room.arsenals.set(targetId, new HunterArsenal());
        sendWeaponState(room, targetId);
    } else {
        room.arsenals.delete(targetId);
        stopHunterZap(room, targetId);
        removeHunterMines(room, targetId);
    }
    return newRole;
}

function endRoomMatch(room: GameRoom): boolean {
    const phase = room.roundManager.getPhase();
    if (phase === GamePhase.HIDING || phase === GamePhase.HUNTING) {
        room.roundManager.endRound(PlayerRole.PROP, 'TIME_EXPIRED');
        return true;
    }
    if (phase === GamePhase.COUNTDOWN) {
        room.roundManager.resetToLobby();
        return true;
    }
    return false;
}

function joinRoom(ws: WebSocket, playerId: string, room: GameRoom, customName?: string): void {
    leaveCurrentRoom(ws, playerId);

    const playerName = resolvePlayerName({
        userId: clientUserIds.get(playerId),
        authenticatedName: clientNames.get(playerId),
        customName,
        playerId
    });
    clientNames.set(playerId, playerName);

    const defaultProp = DEFAULT_PROPS[0];
    const roomPlayer: Player = {
        id: playerId,
        name: playerName,
        x: 250,
        y: 250,
        health: defaultProp.health,
        maxHealth: defaultProp.health,
        role: PlayerRole.PROP,
        isLocked: false,
        currentProp: defaultProp,
        variantIndex: 0,
        currentSpriteKey: defaultProp.internalName
    };

    clientRooms.set(ws, room.key);
    room.players.set(playerId, roomPlayer);
    room.playerInputs.set(playerId, { vx: 0, vy: 0 });

    // Notifie les autres joueurs du salon
    broadcastToRoom(room.key, {
        type: MessageType.PLAYER_JOINED,
        payload: { player: roomPlayer }
    }, ws);

    // Ajoute au RoundManager (ce qui déclenche onLobbyStateChanged vers tout le salon)
    room.roundManager.addPlayer(playerId, playerName);
    console.log(`[GameServer][${room.key}] ${playerName} a rejoint le salon (${room.players.size} joueur(s))`);
}

let staticObstacles: Rectangle[] = [];
try {
    const mapPath = path.resolve(process.cwd(), '../client/public/assets/maps/map_01_32p.tmj');
    if (fs.existsSync(mapPath)) {
        const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        staticObstacles = parseTiledCollisions(mapData);
        if (mapData.width && mapData.tilewidth) {
            GAME_CONFIG.MAP_WIDTH = mapData.width * mapData.tilewidth;
        }
        if (mapData.height && mapData.tileheight) {
            GAME_CONFIG.MAP_HEIGHT = mapData.height * mapData.tileheight;
        }
        console.log(`[GameServer] Carte map_01_32p.tmj chargée : ${GAME_CONFIG.MAP_WIDTH}x${GAME_CONFIG.MAP_HEIGHT} px (${staticObstacles.length} obstacles)`);
    } else {
        console.warn(`[GameServer] Carte introuvable au chemin : ${mapPath}`);
    }
} catch (err) {
    console.error('[GameServer] Erreur lors du chargement des collisions statiques :', err);
}

wss.on('connection', (ws, req: IncomingMessage) => {
    const playerId = randomUUID();
    let initialToken: string | null = null;
    if (req.url) {
        try {
            const parsedUrl = new URL(req.url, 'http://localhost');
            initialToken = parsedUrl.searchParams.get('token');
        } catch {
            initialToken = null;
        }
    }

    const authInfo = verifyJwtToken(initialToken);
    const defaultName = authInfo.username || `Player_${playerId.substring(0, 4)}`;
    console.log(
        `[GameServer] Nouveau client connecté (ID: ${playerId}, userId: ${authInfo.userId ?? 'invité'}, en attente de salon)`
    );

    clients.set(ws, playerId);
    clientNames.set(playerId, defaultName);
    clientUserIds.set(playerId, authInfo.userId);

    const defaultProp = DEFAULT_PROPS[0];
    const welcomePlayer: Player = {
        id: playerId,
        name: defaultName,
        x: 250,
        y: 250,
        health: defaultProp.health,
        maxHealth: defaultProp.health,
        role: PlayerRole.PROP,
        isLocked: false,
        currentProp: defaultProp,
        variantIndex: 0,
        currentSpriteKey: defaultProp.internalName
    };

    // Envoi immédiat de l'ID au client, SANS l'inscrire dans aucun salon
    ws.send(JSON.stringify({
        type: MessageType.WELCOME,
        payload: { player: welcomePlayer }
    } satisfies NetworkMessage));

    ws.on('message', async (data) => {
        try {
            const message: NetworkMessage = JSON.parse(data.toString());

            // --- GESTION DES SALONS (Hors partie) ---
            if (message.type === MessageType.CREATE_ROOM) {
                const payload = (message.payload || {}) as CreateRoomPayload & { token?: string | null };
                await refreshClientIdentity(playerId, payload.token);
                const room = createRoom(Boolean(payload.isFreeplay));
                joinRoom(ws, playerId, room, payload.playerName);
                return;
            }

            if (message.type === MessageType.JOIN_ROOM) {
                const payload = (message.payload || {}) as JoinRoomPayload & { token?: string | null };
                await refreshClientIdentity(playerId, payload.token);
                const requestedKey = (payload.roomKey || '').trim().toUpperCase();
                const targetRoom = rooms.get(requestedKey);
                if (!targetRoom) {
                    ws.send(JSON.stringify({
                        type: MessageType.ROOM_ERROR,
                        payload: { message: `Salon "${requestedKey || '?'}" introuvable. Vérifiez la clé.` }
                    } satisfies NetworkMessage));
                    return;
                }
                joinRoom(ws, playerId, targetRoom, payload.playerName);
                return;
            }

            if (message.type === MessageType.LEAVE_ROOM) {
                leaveCurrentRoom(ws, playerId);
                return;
            }

            // --- ACTIONS DANS UN SALON / EN PARTIE ---
            const roomKey = clientRooms.get(ws);
            const room = roomKey ? rooms.get(roomKey) : undefined;
            if (!room) return;

            switch (message.type) {
                case MessageType.PLAYER_TOGGLE_READY: {
                    room.roundManager.toggleReady(playerId);
                    break;
                }

                case MessageType.KICK_PLAYER: {
                    const payload = message.payload as KickPlayerPayload;
                    const senderSession = room.roundManager.players.get(playerId);
                    if (!senderSession?.isHost || !payload.targetPlayerId || payload.targetPlayerId === playerId) {
                        break;
                    }
                    if (kickPlayerFromRoom(room, payload.targetPlayerId, "Vous avez été expulsé du salon par l'hôte.")) {
                        console.log(`[GameServer][${room.key}] Hôte ${senderSession.name} expulse ${payload.targetPlayerId}`);
                    }
                    break;
                }

                case MessageType.PLAYER_MOVE: {
                    const mover = room.players.get(playerId);
                    if (!mover || !isAlive(mover) || !room.roundManager.canPlayerMove(playerId)) {
                        room.playerInputs.set(playerId, { vx: 0, vy: 0 });
                        break;
                    }

                    const payload = message.payload as PlayerMovePayload;
                    room.playerInputs.set(playerId, { vx: payload.vx, vy: payload.vy });
                    if (payload.vx !== 0 || payload.vy !== 0) {
                        room.telemetryTracker.recordActivity(playerId);
                    }
                    break;
                }

                case MessageType.TRANSFORM_PROP: {
                    const payload = message.payload as TransformPropPayload;
                    const playerToTransform = room.players.get(playerId);
                    if (playerToTransform && playerToTransform.role === PlayerRole.PROP) {
                        const targetProp = DEFAULT_PROPS.find(p =>
                            (payload.propId !== undefined && p.id === payload.propId) ||
                            (payload.spriteKey && p.internalName === payload.spriteKey)
                        ) || playerToTransform.currentProp;

                        if (targetProp) {
                            playerToTransform.currentProp = targetProp;
                            playerToTransform.currentSpriteKey = targetProp.internalName;
                            if (payload.variantIndex !== undefined) {
                                playerToTransform.variantIndex = payload.variantIndex;
                            }
                            playerToTransform.maxHealth = targetProp.health;
                            if (playerToTransform.health > targetProp.health) {
                                playerToTransform.health = targetProp.health;
                            }
                            room.players.set(playerId, playerToTransform);

                            const nearestSeekerDist = getNearestSeekerDistance(room, playerToTransform);
                            room.telemetryTracker.recordTransform(
                                playerId,
                                targetProp.internalName,
                                nearestSeekerDist
                            );

                            console.log(`[GameServer][${room.key}] ${playerToTransform.name} transformé en ${targetProp.displayName}`);

                            broadcastToRoom(room.key, {
                                type: MessageType.TRANSFORM_PROP,
                                payload: {
                                    playerId,
                                    propId: targetProp.id,
                                    variantIndex: playerToTransform.variantIndex ?? 0,
                                    spriteKey: targetProp.internalName,
                                    currentProp: targetProp
                                }
                            });
                        }
                    }
                    break;
                }

                case MessageType.PROP_LOCK: {
                    const payload = message.payload as PropLockPayload;
                    const playerToLock = room.players.get(playerId);
                    if (playerToLock && playerToLock.role === PlayerRole.PROP) {
                        playerToLock.isLocked = payload.isLocked;
                        broadcastToRoom(room.key, {
                            type: MessageType.PROP_LOCK,
                            payload: { playerId, isLocked: payload.isLocked }
                        });
                    }
                    break;
                }

                case MessageType.PROP_WHISTLE: {
                    const payload = message.payload as PropWhistlePayload;
                    const whistler = room.players.get(playerId);
                    if (!whistler || !isAlive(whistler)) break; // Les morts ne sifflent pas
                    const nearestSeekerDist = getNearestSeekerDistance(room, whistler);
                    room.telemetryTracker.recordTaunt(
                        playerId,
                        payload.soundKey || 'taunt_whistle',
                        nearestSeekerDist
                    );
                    broadcastToRoom(room.key, {
                        type: MessageType.PROP_WHISTLE,
                        payload: { playerId, soundKey: payload.soundKey }
                    });
                    break;
                }

                case MessageType.HUNTER_EMOTE: {
                    const payload = message.payload as Partial<HunterEmotePayload>;
                    const performer = room.players.get(playerId);
                    if (!performer || !isAlive(performer) || performer.role !== PlayerRole.HUNTER) break;
                    if (!payload?.emoteId || !DEFAULT_HUNTER_EMOTES.some(e => e.id === payload.emoteId)) break;
                    broadcastToRoom(room.key, {
                        type: MessageType.HUNTER_EMOTE,
                        payload: { playerId, emoteId: payload.emoteId } satisfies HunterEmotePayload
                    });
                    break;
                }

                case MessageType.HUNTER_SHOOT: {
                    // Le client n'envoie que son intention : tout est vérifié et calculé côté serveur
                    handleHunterAttack(room, playerId, message.payload as HunterShootPayload);
                    break;
                }

                case MessageType.HUNTER_ZAP_AIM: {
                    const hunter = room.players.get(playerId);
                    const zap = room.activeZaps.get(playerId);
                    const payload = message.payload as HunterZapAimPayload;
                    if (
                        hunter &&
                        isAlive(hunter) &&
                        hunter.role === PlayerRole.HUNTER &&
                        room.roundManager.canPlayerShoot(playerId) &&
                        zap &&
                        Number.isFinite(payload?.targetX) &&
                        Number.isFinite(payload?.targetY)
                    ) {
                        zap.aimX = payload.targetX;
                        zap.aimY = payload.targetY;
                    }
                    break;
                }

                case MessageType.HUNTER_RELOAD: {
                    const hunter = room.players.get(playerId);
                    const arsenal = room.arsenals.get(playerId);
                    if (hunter && isAlive(hunter) && arsenal && arsenal.startReload(Date.now())) {
                        sendWeaponState(room, playerId);
                    }
                    break;
                }

                case MessageType.PLAYER_HIT: {
                    // Les clients ne peuvent plus infliger de dégâts aux autres : seul le serveur le fait.
                    // Exception de debug (touche K) : un joueur peut s'infliger des dégâts à lui-même.
                    if (!GAME_CONFIG.DEBUG_SELF_DAMAGE) break;
                    const payload = message.payload as { targetPlayerId?: string; damage?: number };
                    if (payload.targetPlayerId !== playerId) break;
                    const damage = Math.max(0, Math.min(100, Number(payload.damage) || 0));
                    applyDamage(room, playerId, damage);
                    break;
                }

                case MessageType.CHAT_MESSAGE: {
                    const senderSession = room.roundManager.players.get(playerId);
                    handleChatMessage(message.payload, {
                        ws,
                        playerId,
                        roomKey: room.key,
                        isHost: senderSession?.isHost ?? false,
                        players: room.players,
                        broadcastToRoom,
                        killTarget: (targetId) => killPlayer(room, targetId),
                        damageTarget: (targetId, dmg) => applyDamage(room, targetId, dmg),
                        isGod: (targetId) => room.godPlayers.has(targetId),
                        toggleGod: (targetId) => {
                            if (room.godPlayers.has(targetId)) {
                                room.godPlayers.delete(targetId);
                                return false;
                            }
                            room.godPlayers.add(targetId);
                            return true;
                        },
                        setSpeed: (targetId, multiplier) => {
                            room.playerSpeeds.set(targetId, multiplier);
                        },
                        swapRole: (targetId) => swapPlayerRole(room, targetId),
                        kickTarget: (targetId, kickerName) =>
                            kickPlayerFromRoom(room, targetId, `Vous avez été expulsé par ${kickerName}.`),
                        adjustTime: (deltaSeconds) => room.roundManager.adjustTime(deltaSeconds),
                        endMatch: () => endRoomMatch(room)
                    });
                    break;
                }
            }
        } catch (error) {
            console.error('Erreur lors du traitement du message WebSocket :', error);
        }
    });

    ws.on('close', () => {
        console.log('[GameServer] Client déconnecté', playerId);
        leaveCurrentRoom(ws, playerId);
        clients.delete(ws);
        clientNames.delete(playerId);
        clientUserIds.delete(playerId);
        lastSpeedAnomalyLog.delete(playerId);
    });
});

// Boucle de jeu principale (indépendante pour chaque salon actif)
const gameLoop = new GameLoop((deltaTime: number) => {
    const now = Date.now();

    rooms.forEach((room) => {
        updateGrenades(room, now);
        updateZaps(room, now, deltaTime);
        updateMines(room, now);

        // Fin de rechargement du pistolet : on prévient le chasseur concerné
        room.arsenals.forEach((arsenal, hunterId) => {
            if (arsenal.update(now)) sendWeaponState(room, hunterId, now);
        });

        room.players.forEach((player, id) => {
            if (!isAlive(player) || !room.roundManager.canPlayerMove(id)) {
                return;
            }

            const input = room.playerInputs.get(id);
            if (input) {
                if (player.role === PlayerRole.PROP && player.isLocked) {
                    // Prop verrouillé : immobile
                } else {
                    const speedMult = room.playerSpeeds.get(id) ?? 1;
                    const ignoreObstacles = room.godPlayers.has(id);
                    updatePlayerPosition(
                        player,
                        input.vx,
                        input.vy,
                        deltaTime,
                        staticObstacles,
                        speedMult,
                        ignoreObstacles,
                        (anomaly) => {
                            const lastLogged = lastSpeedAnomalyLog.get(id) ?? 0;
                            if (now - lastLogged >= 10_000) {
                                lastSpeedAnomalyLog.set(id, now);
                                console.warn(
                                    `[GameServer][${room.key}] SPEED_ANOMALY détectée pour ${player.name} (${anomaly.measured} > ${anomaly.expectedMax})`
                                );
                                void sendServerLog({
                                    serverId: SERVER_ID,
                                    level: 'WARN',
                                    event: 'SPEED_ANOMALY',
                                    userId: clientUserIds.get(id) ?? null,
                                    details: {
                                        roomKey: room.key,
                                        expectedMax: anomaly.expectedMax,
                                        measured: anomaly.measured,
                                        action: anomaly.action,
                                    },
                                });
                            }
                        }
                    );
                }
            }

            // Régénération passive autoritaire
            const maxHealth = player.maxHealth || 100;
            if (player.health < maxHealth && player.health > 0) {
                const lastHit = player.lastHitTimestamp || 0;
                if (now - lastHit >= GAMEPLAY_CONFIG.regeneration_cooldown) {
                    const lastRegen = room.playerRegenTimers.get(id) || 0;
                    if (now - lastRegen >= GAMEPLAY_CONFIG.regeneration_interval) {
                        player.health = Math.min(maxHealth, player.health + GAMEPLAY_CONFIG.regeneration_amount);
                        room.playerRegenTimers.set(id, now);
                    }
                }
            }
        });

        const playersList = Array.from(room.players.values());
        if (playersList.length > 0) {
            broadcastToRoom(room.key, {
                type: MessageType.GAME_STATE_UPDATE,
                payload: { players: playersList }
            });
        }
    });
});

gameLoop.start();

// Collecte continue : Heartbeat toutes les 8 secondes + log de démarrage
function emitHeartbeat(): void {
    let anyInGame = false;
    rooms.forEach((room) => {
        const phase = room.roundManager.getPhase();
        if (phase === GamePhase.HIDING || phase === GamePhase.HUNTING) {
            anyInGame = true;
        }
    });

    const playersCount = clients.size;
    const status =
        playersCount >= MAX_PLAYERS ? 'FULL' : anyInGame ? 'IN_GAME' : 'WAITING';

    void sendServerHeartbeat({
        serverId: SERVER_ID,
        name: SERVER_NAME,
        host: SERVER_HOST,
        port: SERVER_PORT,
        map: CURRENT_MAP,
        status,
        playersCount,
        maxPlayers: MAX_PLAYERS,
    });
}

void sendServerLog({
    serverId: SERVER_ID,
    level: 'INFO',
    event: 'SERVER_STARTED',
    details: {
        port: SERVER_PORT,
        tickRate: 20,
        map: CURRENT_MAP,
    },
});
emitHeartbeat();
setInterval(emitHeartbeat, 8000);
