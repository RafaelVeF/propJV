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
import { handleChatMessage } from './systems/chat.js';
import { parseTiledCollisions } from './utils/mapLoader.js';
import { GAME_CONFIG } from './config/game.js';

// =========================================================================
// TODO FUTUR : Chargement dynamique de la carte via son ID (stockée en BDD)
// Lorsque l'hôte sélectionne une carte dans le lobby, l'ID de la map est transmis
// au serveur (par exemple via les arguments de démarrage ou une requête initiale).
//
// 1. Récupérer l'ID de la map (ex: const mapId = process.argv.find(...))
// 2. Faire un fetch vers l'API Maître pour récupérer le JSON Tiled brut :
//    const response = await fetch(`http://localhost:3000/api/maps/${mapId}`);
//    const mapData = await response.json();
// 3. Parser les collisions dynamiquement pour remplacer le tableau vide :
//    const staticObstacles: Rectangle[] = parseTiledCollisions(mapData);
// =========================================================================

const wss = new WebSocketServer({ port: 8080 }); // Serveur WebSocket sur le port 8080
console.log('[GameServer] Serveur WebSocket démarré sur le port 8080');

const players = new Map<string, Player>(); // Map pour stocker les états des joueurs
const clients = new Map<WebSocket, string>();    // Set pour stocker les sockets actifs

// Stockage temporaire des dernières entrées (vélocité) reçues pour chaque joueur
const playerInputs = new Map<string, { vx: number; vy: number }>();
// Horodatage du dernier tick de régénération pour chaque joueur
const playerRegenTimers = new Map<string, number>();

// --- PARSING DES COLLISIONS DE LA CARTE ---
// Chargement du fichier Tiled JSON exporté pour extraire la couche d'obstacles
let staticObstacles: Rectangle[] = [];
let mapData: any = null;
try {
    // Résolution robuste du chemin menant à la carte Tiled partagée
    // Remonte depuis apps/game-server vers la racine puis cible apps/client/public/...
    const mapPath = path.resolve(process.cwd(), '../client/public/assets/maps/map_01_32p.tmj');
    
    if (fs.existsSync(mapPath)) {
        const rawData = fs.readFileSync(mapPath, 'utf-8');
        mapData = JSON.parse(rawData);
        staticObstacles = parseTiledCollisions(mapData);
        if (mapData.width && mapData.tilewidth) {
            GAME_CONFIG.MAP_WIDTH = mapData.width * mapData.tilewidth;
            GAME_CONFIG.MAP_HEIGHT = mapData.height * mapData.tileheight;
            console.log(`[GameServer] Dimensions carte Tiled : ${GAME_CONFIG.MAP_WIDTH}x${GAME_CONFIG.MAP_HEIGHT} px (${mapData.width}x${mapData.height} tuiles)`);
        }
        console.log(`[GameServer] ${staticObstacles.length} boîtes de collision chargées depuis Tiled !`);
    } else {
        console.warn(`[GameServer] Attention : Carte introuvable à l'emplacement ${mapPath}. Aucune collision chargée.`);
    }
} catch (err) {
    console.error('[GameServer] Erreur lors du chargement des collisions de la carte :', err);
}

// Gestion des connexions clients WebSocket
wss.on('connection', (ws) => {
    // Identifiant temporaire généré pour la session
    const playerId = `player_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    console.log(`[GameServer] Nouveau client connecté. ID attribué: ${playerId}`);

    // Création de l'état initial du joueur avec une position de départ aléatoire
    const initialPlayer: Player = {
        id: playerId,
        name: `Joueur ${playerId.substr(-4)}`,
        x: Math.floor(Math.random() * (GAME_CONFIG.MAP_WIDTH - 200)) + 100,
        y: Math.floor(Math.random() * (GAME_CONFIG.MAP_HEIGHT - 200)) + 100,
        role: PlayerRole.PROP,
        health: DEFAULT_PROPS[0].health,
        maxHealth: DEFAULT_PROPS[0].health,
        lastHitTimestamp: 0,
        isLocked: false,
        currentProp: DEFAULT_PROPS[0],
        variantIndex: 0
    };

    // Enregistrement du joueur
    players.set(playerId, initialPlayer);
    clients.set(ws, playerId);

    // Initialisation des entrées du joueur
    playerInputs.set(playerId, { vx: 0, vy: 0 });

    // 1. Envoi du message de bienvenue au joueur venant de se connecter
    ws.send(JSON.stringify({
        type: MessageType.WELCOME,
        payload: {
            player: initialPlayer
        }
    }));

    // 2. Notification aux autres clients qu'un nouveau joueur a rejoint
    broadcast({
        type: MessageType.PLAYER_JOINED,
        payload: {
            player: initialPlayer
        }
    }, ws); // Exclut l'expéditeur

    // Réception des messages envoyés par le client
    ws.on('message', (data) => {
        try {
            const message: NetworkMessage = JSON.parse(data.toString());

            switch (message.type) {
                case MessageType.PLAYER_MOVE: {
                    const payload = message.payload as PlayerMovePayload;

                    // Mise à jour de l'intention de mouvement (vélocité)
                    if (payload && typeof payload.vx === 'number' && typeof payload.vy === 'number') {
                        playerInputs.set(playerId, {
                            vx: payload.vx,
                            vy: payload.vy
                        });
                    }
                    break;
                }
                case MessageType.TRANSFORM_PROP: {
                    const payload = message.payload as TransformPropPayload;
                    const playerToTransform = players.get(playerId);

                    if (playerToTransform && playerToTransform.role === PlayerRole.PROP) {
                        const targetProp: PropDefinition | undefined = payload.currentProp || DEFAULT_PROPS.find(p =>
                            (payload.propId !== undefined && p.id === payload.propId) ||
                            (payload.spriteKey && p.internalName === payload.spriteKey)
                        );

                        if (targetProp) {
                            playerToTransform.currentProp = targetProp;
                            if (payload.variantIndex !== undefined) {
                                playerToTransform.variantIndex = payload.variantIndex;
                            }
                            playerToTransform.maxHealth = targetProp.health;
                            if (playerToTransform.health > targetProp.health) {
                                playerToTransform.health = targetProp.health;
                            }
                            players.set(playerId, playerToTransform);

                            console.log(`[GameServer] ${playerToTransform.name} s'est transformé en ${targetProp.displayName} (orientation: ${playerToTransform.variantIndex}) (HP: ${playerToTransform.health}/${playerToTransform.maxHealth})`);

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
                    const payload = message.payload as HunterShootPayload;

                    broadcast({
                        type: MessageType.HUNTER_SHOOT,
                        payload
                    });
                    break;
                }

                // Délégation propre au module métier systems/chat.ts
                case MessageType.CHAT_MESSAGE: {
                    handleChatMessage(message.payload, {
                        ws,
                        playerId,
                        players,
                        broadcast,
                        playerRegenTimers,
                        mapData,
                        staticObstacles
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
                                isKilled: targetPlayer.health <= 0
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

// Fonction utilitaire pour diffuser un message à tous les clients connectés (avec option d'exclusion)
function broadcast(message: NetworkMessage, excludeWs?: WebSocket) {
    const dataString = JSON.stringify(message);
    clients.forEach((_, clientWs) => {
        if (clientWs !== excludeWs && clientWs.readyState === clientWs.OPEN) {
            clientWs.send(dataString);
        }
    });
}

// Boucle de jeu principale
const gameLoop = new GameLoop((deltaTime: number) => {
    const now = Date.now();

    // Mise à jour de la physique et des mécaniques de survie de tous les joueurs
    players.forEach((player, id) => {
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
