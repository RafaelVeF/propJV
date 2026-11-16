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
    Rectangle,
    DEFAULT_PROPS,
    type PropDefinition,
    GAMEPLAY_CONFIG
} from '@prop-hunt/shared';
import { GameLoop } from './GameLoop.js';
import { updatePlayerPosition } from './systems/movement.js';
import { parseTiledCollisions } from './utils/mapLoader.js';
import { GAME_CONFIG } from './config/game.js';
import { RoundManager } from './RoundManager.js';

const wss = new WebSocketServer({ port: 8080 }); // Serveur WebSocket sur le port 8080
console.log('[GameServer] Serveur WebSocket démarré sur le port 8080');

const players = new Map<string, Player>(); // Map pour stocker les états des joueurs
const clients = new Map<WebSocket, string>();    // Set pour stocker les sockets actifs

// Coordonnées de spawn autoritaires
const SPAWN_HUNTER = { x: 250, y: 250 };
const SPAWN_PROP = { x: 600, y: 600 };

// Stockage temporaire des dernières entrées (vélocité) reçues pour chaque joueur
const playerInputs = new Map<string, { vx: number; vy: number }>();
// Horodatage du dernier tick de régénération pour chaque joueur
const playerRegenTimers = new Map<string, number>();

// Fonction utilitaire pour diffuser un message à tous les clients connectés (avec option d'exclusion)
function broadcast(message: NetworkMessage, excludeWs?: WebSocket) {
    const dataString = JSON.stringify(message);
    clients.forEach((_, clientWs) => {
        if (clientWs !== excludeWs && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(dataString);
        }
    });
}

// Initialisation du gestionnaire de round autoritaire
const roundManager = new RoundManager({
    onLobbyStateChanged: (lobbyState) => {
        broadcast({
            type: MessageType.LOBBY_STATE,
            payload: lobbyState
        });
    },
    onCountdownStarted: (seconds) => {
        broadcast({
            type: MessageType.START_COUNTDOWN,
            payload: { countdownSeconds: seconds }
        });
    },
    onCountdownCancelled: () => {
        broadcast({
            type: MessageType.LOBBY_STATE,
            payload: roundManager.getLobbyState()
        });
    },
    onRoundStarted: (assignments) => {
        console.log(`[GameServer] Démarrage de la manche #${roundManager.getRoundNumber()} ! Affectation des rôles :`);
        assignments.forEach((role, assignedPlayerId) => {
            const p = players.get(assignedPlayerId);
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

            // Notification individuelle du rôle et des paramètres du round
            clients.forEach((clientPlayerId, clientWs) => {
                if (clientPlayerId === assignedPlayerId && clientWs.readyState === WebSocket.OPEN) {
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
        broadcast({
            type: MessageType.ROUND_TIMER_TICK,
            payload: { phase, timeRemaining }
        });
    },
    onPhaseChanged: (phase, timeRemaining) => {
        broadcast({
            type: MessageType.ROUND_TIMER_TICK,
            payload: { phase, timeRemaining }
        });
    },
    onRoundEnded: (results) => {
        console.log(`[GameServer] Fin de manche ! Vainqueur : ${results.winner} (Raison: ${results.reason})`);
        broadcast({
            type: MessageType.ROUND_END,
            payload: results
        });
    }
}, {
    minPlayers: 2,
    countdownDuration: 5,
    hidingDuration: 30,
    huntingDuration: 210, // 3min30 de traque (total 4min avec les 30s de cachette)
    roundEndDuration: 10
});

let staticObstacles: Rectangle[] = [];
try {
    // Chargement de la carte depuis le dossier client
    const mapPath = path.resolve(process.cwd(), '../client/public/assets/maps/map_01_32p.tmj');
    if (fs.existsSync(mapPath)) {
        const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
        staticObstacles = parseTiledCollisions(mapData);
        // Mise à jour modulaire des dimensions de la carte selon le fichier Tiled
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
    console.log('[GameServer] Nouveau client connecté');
    const playerId = Math.random().toString(36).substring(2, 15); // ID aléatoire assigné au joueur

    // Initialisation d'un nouveau joueur (par défaut en tant que Prop humain)
    const defaultProp = DEFAULT_PROPS[0];
    const newPlayer: Player = {
        id: playerId,
        name: `Player_${playerId.substring(0, 4)}`,
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

    players.set(playerId, newPlayer);
    clients.set(ws, playerId);
    playerInputs.set(playerId, { vx: 0, vy: 0 });

    // Enregistrement auprès du RoundManager
    roundManager.addPlayer(playerId, newPlayer.name);

    // Envoi du message de bienvenue au joueur
    ws.send(JSON.stringify({
        type: MessageType.WELCOME,
        payload: { player: newPlayer }
    } satisfies NetworkMessage));

    // Envoi de l'état actuel du salon au joueur
    ws.send(JSON.stringify({
        type: MessageType.LOBBY_STATE,
        payload: roundManager.getLobbyState()
    } satisfies NetworkMessage));

    // Notifie les autres joueurs qu'un nouveau joueur a rejoint
    broadcast({
        type: MessageType.PLAYER_JOINED,
        payload: { player: newPlayer }
    }, ws);

    ws.on('message', (data) => {
        try {
            const message: NetworkMessage = JSON.parse(data.toString());

            switch (message.type) {
                case MessageType.PLAYER_TOGGLE_READY: {
                    // Basculer l'état prêt dans le RoundManager autoritaire
                    roundManager.toggleReady(playerId);
                    break;
                }

                case MessageType.PLAYER_MOVE: {
                    // Vérification autoritaire : le joueur a-t-il le droit de bouger ?
                    // (Ex: Les Hunters sont strictement bloqués pendant la phase HIDING de 30s)
                    if (!roundManager.canPlayerMove(playerId)) {
                        playerInputs.set(playerId, { vx: 0, vy: 0 });
                        break;
                    }

                    const payload = message.payload as PlayerMovePayload;
                    playerInputs.set(playerId, { vx: payload.vx, vy: payload.vy });
                    break;
                }

                case MessageType.TRANSFORM_PROP: {
                    const payload = message.payload as TransformPropPayload;

                    // Met à jour le prop et sa hitbox physique dans le serveur
                    const playerToTransform = players.get(playerId);
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
                            players.set(playerId, playerToTransform);

                            console.log(`[GameServer] ${playerToTransform.name} transformé en ${targetProp.displayName}`);

                            broadcast({
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

                    const playerToLock = players.get(playerId);
                    if (playerToLock && playerToLock.role === PlayerRole.PROP) {
                        playerToLock.isLocked = payload.isLocked;

                        broadcast({
                            type: MessageType.PROP_LOCK,
                            payload: { playerId, isLocked: payload.isLocked }
                        });
                    }
                    break;
                }

                case MessageType.PROP_WHISTLE: {
                    const payload = message.payload as PropWhistlePayload;

                    broadcast({
                        type: MessageType.PROP_WHISTLE,
                        payload: { playerId, soundKey: payload.soundKey }
                    });
                    break;
                }

                case MessageType.HUNTER_SHOOT: {
                    // Vérification autoritaire : tir permis uniquement aux Hunters en phase HUNTING
                    if (!roundManager.canPlayerShoot(playerId)) {
                        break;
                    }

                    const payload = message.payload as HunterShootPayload;
                    broadcast({
                        type: MessageType.HUNTER_SHOOT,
                        payload
                    });
                    break;
                }

                case MessageType.PLAYER_HIT: {
                    const payload = message.payload as { targetPlayerId?: string; playerId?: string; damage: number };
                    const targetId = payload.targetPlayerId || payload.playerId;
                    if (targetId && players.has(targetId)) {
                        const targetPlayer = players.get(targetId)!;
                        const damage = payload.damage ?? 10;
                        targetPlayer.health = Math.max(0, targetPlayer.health - damage);
                        targetPlayer.lastHitTimestamp = Date.now();
                        playerRegenTimers.delete(targetId); // Réinitialise le délai de régénération
                        players.set(targetId, targetPlayer);

                        const isKilled = targetPlayer.health <= 0;
                        if (isKilled) {
                            // Vérifie si cette élimination termine la manche (victoire des chasseurs)
                            roundManager.handlePlayerDeath(targetId, playerId);
                        }

                        console.log(`[GameServer] ${targetPlayer.name} a subi ${damage} dégâts (HP: ${targetPlayer.health}/${targetPlayer.maxHealth || 100})`);

                        broadcast({
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
        roundManager.removePlayer(playerId);
        players.delete(playerId);
        clients.delete(ws);
        playerInputs.delete(playerId);
        playerRegenTimers.delete(playerId);

        broadcast({
            type: MessageType.PLAYER_LEFT,
            payload: { playerId }
        });
    });
});

// Boucle de jeu principale
const gameLoop = new GameLoop((deltaTime: number) => {
    const now = Date.now();

    // Mise à jour de la physique et des mécaniques de survie de tous les joueurs
    players.forEach((player, id) => {
        // Bloquer la mise à jour physique si le RoundManager l'interdit
        if (!roundManager.canPlayerMove(id)) {
            return;
        }

        const input = playerInputs.get(id);
        if (input) {
            if (player.role === PlayerRole.PROP && player.isLocked) {
                // Si le joueur Prop est verrouillé, on ne met pas à jour sa position
            } else {
                // Le serveur calcule et impose la position validée via movement.ts
                updatePlayerPosition(player, input.vx, input.vy, deltaTime, staticObstacles);
            }
        }

        // Régénération passive autoritaire : 1 PV par demi-seconde (500ms) après 10s sans dégât
        const maxHealth = player.maxHealth || 100;
        if (player.health < maxHealth && player.health > 0) {
            const lastHit = player.lastHitTimestamp || 0;
            if (now - lastHit >= GAMEPLAY_CONFIG.regeneration_cooldown) {
                const lastRegen = playerRegenTimers.get(id) || 0;
                if (now - lastRegen >= GAMEPLAY_CONFIG.regeneration_interval) {
                    player.health = Math.min(maxHealth, player.health + GAMEPLAY_CONFIG.regeneration_amount);
                    playerRegenTimers.set(id, now);
                }
            }
        }
    });

    // Diffusion de l'état officiel mis à jour du monde à tous les clients à chaque tick
    const playersList = Array.from(players.values());
    if (playersList.length > 0) {
        broadcast({
            type: MessageType.GAME_STATE_UPDATE,
            payload: { players: playersList }
        });
    }
});

// Démarrage de la boucle de jeu
gameLoop.start();
