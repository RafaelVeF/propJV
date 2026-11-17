import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import {
    MessageType,
    PlayerRole,
    type Player,
    type NetworkMessage,
    type PlayerMovePayload,
    type TransformPropPayload,
    type PropLockPayload,
    type PropWhistlePayload,
    type HunterShootPayload,
    type CreateRoomPayload,
    type JoinRoomPayload,
    type KickPlayerPayload,
    Rectangle,
    DEFAULT_PROPS,
    GAMEPLAY_CONFIG
} from '@prop-hunt/shared';
import { GameLoop } from './GameLoop.js';
import { updatePlayerPosition } from './systems/movement.js';
import { parseTiledCollisions } from './utils/mapLoader.js';
import { GAME_CONFIG } from './config/game.js';
import { RoundManager } from './RoundManager.js';

const wss = new WebSocketServer({ port: 8080 }); // Serveur WebSocket sur le port 8080
console.log('[GameServer] Serveur WebSocket démarré sur le port 8080');

// Suivi des clients connectés (ID attribué dès la connexion, mais sans salon par défaut)
const clients = new Map<WebSocket, string>();      // ws -> playerId
const clientRooms = new Map<WebSocket, string>();  // ws -> roomKey (uniquement si dans un salon)
const clientNames = new Map<string, string>();     // playerId -> name

interface GameRoom {
    key: string;
    roundManager: RoundManager;
    players: Map<string, Player>;
    playerInputs: Map<string, { vx: number; vy: number }>;
    playerRegenTimers: Map<string, number>;
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

function generateRoomKey(prefix: string = 'LOCAL'): string {
    let key = '';
    do {
        key = `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    } while (rooms.has(key));
    return key;
}

function createRoom(isFreeplay: boolean = false): GameRoom {
    const roomKey = generateRoomKey(isFreeplay ? 'FREEPLAY' : 'LOCAL');
    const roomPlayers = new Map<string, Player>();
    const roomInputs = new Map<string, { vx: number; vy: number }>();
    const roomRegenTimers = new Map<string, number>();

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
            assignments.forEach((role, assignedPlayerId) => {
                const p = roomPlayers.get(assignedPlayerId);
                if (p) {
                    p.role = role;
                    p.health = 100;
                    p.maxHealth = 100;
                    if (role === PlayerRole.HUNTER) {
                        p.x = SPAWN_HUNTER.x;
                        p.y = SPAWN_HUNTER.y;
                    } else {
                        p.x = SPAWN_PROP.x;
                        p.y = SPAWN_PROP.y;
                        if ('currentProp' in p && p.currentProp) {
                            p.health = p.currentProp.health;
                            p.maxHealth = p.currentProp.health;
                        }
                    }
                    console.log(`  - ${p.name} : ${role} (Spawn: ${p.x}, ${p.y})`);
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
                                mapId: 'map_01_32p'
                            }
                        } satisfies NetworkMessage));
                    }
                });
            });
        },
        onTimerTick: (phase, timeRemaining) => {
            broadcastToRoom(roomKey, {
                type: MessageType.ROUND_TIMER_TICK,
                payload: { phase, timeRemaining }
            });
        },
        onPhaseChanged: (phase, timeRemaining) => {
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
        players: roomPlayers,
        playerInputs: roomInputs,
        playerRegenTimers: roomRegenTimers
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

function joinRoom(ws: WebSocket, playerId: string, room: GameRoom, customName?: string): void {
    leaveCurrentRoom(ws, playerId);

    const playerName = customName?.trim() || clientNames.get(playerId) || `Player_${playerId.substring(0, 4)}`;
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

wss.on('connection', (ws) => {
    const playerId = Math.random().toString(36).substring(2, 15);
    const defaultName = `Player_${playerId.substring(0, 4)}`;
    console.log(`[GameServer] Nouveau client connecté (ID: ${playerId}, en attente de salon)`);

    clients.set(ws, playerId);
    clientNames.set(playerId, defaultName);

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

    ws.on('message', (data) => {
        try {
            const message: NetworkMessage = JSON.parse(data.toString());

            // --- GESTION DES SALONS (Hors partie) ---
            if (message.type === MessageType.CREATE_ROOM) {
                const payload = (message.payload || {}) as CreateRoomPayload;
                const room = createRoom(Boolean(payload.isFreeplay));
                joinRoom(ws, playerId, room, payload.playerName);
                return;
            }

            if (message.type === MessageType.JOIN_ROOM) {
                const payload = (message.payload || {}) as JoinRoomPayload;
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

                    let targetWs: WebSocket | null = null;
                    clients.forEach((cPlayerId, cWs) => {
                        if (cPlayerId === payload.targetPlayerId && clientRooms.get(cWs) === room.key) {
                            targetWs = cWs;
                        }
                    });

                    if (targetWs) {
                        console.log(`[GameServer][${room.key}] Hôte ${senderSession.name} expulse ${payload.targetPlayerId}`);
                        leaveCurrentRoom(targetWs, payload.targetPlayerId);
                        if ((targetWs as WebSocket).readyState === WebSocket.OPEN) {
                            (targetWs as WebSocket).send(JSON.stringify({
                                type: MessageType.KICKED,
                                payload: { reason: "Vous avez été expulsé du salon par l'hôte." }
                            } satisfies NetworkMessage));
                        }
                    }
                    break;
                }

                case MessageType.PLAYER_MOVE: {
                    if (!room.roundManager.canPlayerMove(playerId)) {
                        room.playerInputs.set(playerId, { vx: 0, vy: 0 });
                        break;
                    }

                    const payload = message.payload as PlayerMovePayload;
                    room.playerInputs.set(playerId, { vx: payload.vx, vy: payload.vy });
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
                    broadcastToRoom(room.key, {
                        type: MessageType.PROP_WHISTLE,
                        payload: { playerId, soundKey: payload.soundKey }
                    });
                    break;
                }

                case MessageType.HUNTER_SHOOT: {
                    if (!room.roundManager.canPlayerShoot(playerId)) {
                        break;
                    }
                    const payload = message.payload as HunterShootPayload;
                    broadcastToRoom(room.key, {
                        type: MessageType.HUNTER_SHOOT,
                        payload
                    });
                    break;
                }

                case MessageType.PLAYER_HIT: {
                    const payload = message.payload as { targetPlayerId?: string; playerId?: string; damage: number };
                    const targetId = payload.targetPlayerId || payload.playerId;
                    if (targetId && room.players.has(targetId)) {
                        const targetPlayer = room.players.get(targetId)!;
                        const damage = payload.damage ?? 10;
                        targetPlayer.health = Math.max(0, targetPlayer.health - damage);
                        targetPlayer.lastHitTimestamp = Date.now();
                        room.playerRegenTimers.delete(targetId);
                        room.players.set(targetId, targetPlayer);

                        const isKilled = targetPlayer.health <= 0;
                        if (isKilled) {
                            room.roundManager.handlePlayerDeath(targetId, playerId);
                        }

                        console.log(`[GameServer][${room.key}] ${targetPlayer.name} a subi ${damage} dégâts (HP: ${targetPlayer.health}/${targetPlayer.maxHealth || 100})`);

                        broadcastToRoom(room.key, {
                            type: MessageType.PLAYER_HIT,
                            payload: {
                                targetPlayerId: targetId,
                                playerId: targetId,
                                damage: damage,
                                health: targetPlayer.health,
                                maxHealth: targetPlayer.maxHealth,
                                lastHitTimestamp: targetPlayer.lastHitTimestamp,
                                isKilled
                            }
                        });
                    }
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
    });
});

// Boucle de jeu principale (indépendante pour chaque salon actif)
const gameLoop = new GameLoop((deltaTime: number) => {
    const now = Date.now();

    rooms.forEach((room) => {
        room.players.forEach((player, id) => {
            if (!room.roundManager.canPlayerMove(id)) {
                return;
            }

            const input = room.playerInputs.get(id);
            if (input) {
                if (player.role === PlayerRole.PROP && player.isLocked) {
                    // Prop verrouillé : immobile
                } else {
                    updatePlayerPosition(player, input.vx, input.vy, deltaTime, staticObstacles);
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
