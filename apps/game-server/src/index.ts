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
    GAMEPLAY_CONFIG,
    type ChatMessagePayload,
    CHAT_COMMANDS,
    type ChatCommandDefinition
} from '@prop-hunt/shared';
import { GameLoop } from './GameLoop.js';
import { updatePlayerPosition } from './systems/movement.js';
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

    // Envoi du message de bienvenue au joueur qui vient de se connecter
    ws.send(JSON.stringify({
        type: MessageType.WELCOME,
        payload: { player: newPlayer }
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
                case MessageType.PLAYER_MOVE: {

                    const payload = message.payload as PlayerMovePayload;
                    // On enregistre l'intention demandée par le joueur
                    // Elle sera traitée et validée de manière autoritaire par la GameLoop
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

                            console.log(`[GameServer] ${playerToTransform.name} transformé en ${targetProp.displayName} (orientation index: ${playerToTransform.variantIndex ?? 0}, hitbox: r${targetProp.hitboxRadius}px, HP: ${playerToTransform.health}/${playerToTransform.maxHealth})`);

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

                    // Met à jour l'état de verrouillage du joueur Prop dans le serveur
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

                case MessageType.CHAT_MESSAGE: {
                    const payload = message.payload as { text?: string };
                    if (!payload || typeof payload.text !== 'string') break;
                    const trimmed = payload.text.trim();
                    if (trimmed.length === 0 || trimmed.length > 250) break;

                    const sender = players.get(playerId);
                    const senderName = sender?.name || `Joueur ${playerId.substring(0, 4)}`;

                    // Fonction utilitaire pour envoyer un message système privé au joueur
                    const sendSystemMessage = (text: string) => {
                        ws.send(JSON.stringify({
                            type: MessageType.CHAT_MESSAGE,
                            payload: {
                                id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                senderId: 'system',
                                senderName: 'Système',
                                text,
                                timestamp: Date.now(),
                                isSystem: true
                            } satisfies ChatMessagePayload
                        }));
                    };

                    // Fonction utilitaire pour diffuser un message système à tous les joueurs
                    const broadcastSystemMessage = (text: string) => {
                        broadcast({
                            type: MessageType.CHAT_MESSAGE,
                            payload: {
                                id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                                senderId: 'system',
                                senderName: 'Système',
                                text,
                                timestamp: Date.now(),
                                isSystem: true
                            } satisfies ChatMessagePayload
                        });
                    };

                    // --- TRAITEMENT DES COMMANDES COMMENÇANT PAR '/' ---
                    if (trimmed.startsWith('/')) {
                        const parts = trimmed.slice(1).split(' ').filter(p => p.length > 0);
                        if (parts.length === 0) {
                            sendSystemMessage(`Tapez /help pour afficher la liste des commandes disponibles.`);
                            break;
                        }

                        const rawCmd = parts[0].toLowerCase();
                        const def = CHAT_COMMANDS.find(c => c.name === rawCmd || c.aliases?.includes(rawCmd));

                        if (!def) {
                            sendSystemMessage(`Commande inconnue "/${rawCmd}". Tapez /help pour afficher les commandes disponibles.`);
                            break;
                        }

                        switch (def.name) {
                            case 'help': {
                                if (parts.length > 1) {
                                    const subQuery = parts[1].toLowerCase().replace(/^\//, '');
                                    const subDef = CHAT_COMMANDS.find(c => c.name === subQuery || c.aliases?.includes(subQuery));
                                    if (subDef) {
                                        sendSystemMessage(`Commande /${subDef.name} : ${subDef.description}\n• Utilisation : ${subDef.syntax}\n• Exemple : ${subDef.example}`);
                                    } else {
                                        sendSystemMessage(`Commande "${subQuery}" introuvable. Tapez /help pour afficher toutes les commandes.`);
                                    }
                                } else {
                                    const listStr = CHAT_COMMANDS.map(c => `/${c.name}`).join(', ');
                                    sendSystemMessage(`Commandes disponibles : ${listStr}\n Tapez /help <commande> pour voir la syntaxe et un exemple détaillé.`);
                                }
                                break;
                            }

                            case 'role': {
                                if (parts.length < 2) {
                                    sendSystemMessage(`Argument manquant. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
                                    break;
                                }
                                const target = parts[1].toLowerCase();
                                let targetRole: PlayerRole | null = null;
                                if (target === 'hunter' || target === 'chasseur') targetRole = PlayerRole.HUNTER;
                                if (target === 'prop') targetRole = PlayerRole.PROP;

                                if (!targetRole) {
                                    sendSystemMessage(`Rôle "${parts[1]}" invalide. Choix : hunter, prop. (Exemple : /role hunter)`);
                                    break;
                                }

                                if (sender) {
                                    sender.role = targetRole;
                                    if (targetRole === PlayerRole.HUNTER) {
                                        sender.health = 100;
                                        sender.maxHealth = 100;
                                    } else if (targetRole === PlayerRole.PROP) {
                                        const defP = DEFAULT_PROPS[0];
                                        (sender as any).currentProp = defP;
                                        sender.health = defP.health;
                                        sender.maxHealth = defP.health;
                                    }
                                    players.set(playerId, sender);
                                    broadcastSystemMessage(`${senderName} a changé son rôle en ${targetRole === PlayerRole.HUNTER ? 'CHASSEUR' : 'PROP'}.`);
                                }
                                break;
                            }

                            case 'switch': {
                                if (sender) {
                                    const newRole = sender.role === PlayerRole.HUNTER ? PlayerRole.PROP : PlayerRole.HUNTER;
                                    sender.role = newRole;
                                    if (newRole === PlayerRole.HUNTER) {
                                        sender.health = 100;
                                        sender.maxHealth = 100;
                                    } else {
                                        const defP = DEFAULT_PROPS[0];
                                        (sender as any).currentProp = defP;
                                        sender.health = defP.health;
                                        sender.maxHealth = defP.health;
                                    }
                                    players.set(playerId, sender);
                                    broadcastSystemMessage(`${senderName} est maintenant ${newRole === PlayerRole.HUNTER ? 'CHASSEUR' : 'PROP'}.`);
                                }
                                break;
                            }

                            case 'prop': {
                                if (!sender || sender.role !== PlayerRole.PROP) {
                                    sendSystemMessage(`Vous devez être en rôle PROP pour changer de prop. (Tapez /role prop pour changer de rôle)`);
                                    break;
                                }
                                if (parts.length < 2) {
                                    const propNames = DEFAULT_PROPS.filter(p => p.internalName !== 'prop_human').map(p => p.displayName).join(', ');
                                    sendSystemMessage(`Nom de prop manquant. Utilisation : ${def.syntax} (Exemple : ${def.example})\n• Props disponibles : ${propNames}`);
                                    break;
                                }
                                const query = parts.slice(1).join(' ').toLowerCase();
                                const matchedProp = DEFAULT_PROPS.find(p =>
                                    p.internalName.toLowerCase().includes(query) ||
                                    p.displayName.toLowerCase().includes(query)
                                );

                                if (!matchedProp) {
                                    const propNames = DEFAULT_PROPS.filter(p => p.internalName !== 'prop_human').map(p => p.displayName).join(', ');
                                    sendSystemMessage(`Prop "${query}" introuvable. Props disponibles : ${propNames} (Exemple : /prop chaise)`);
                                    break;
                                }

                                sender.currentProp = matchedProp;
                                sender.maxHealth = matchedProp.health;
                                sender.health = Math.min(sender.health, matchedProp.health);
                                sender.variantIndex = 0;
                                players.set(playerId, sender);

                                broadcast({
                                    type: MessageType.TRANSFORM_PROP,
                                    payload: {
                                        playerId,
                                        propId: matchedProp.id,
                                        variantIndex: 0,
                                        spriteKey: matchedProp.internalName,
                                        currentProp: matchedProp
                                    }
                                });
                                broadcastSystemMessage(`✨ ${senderName} s'est transformé en ${matchedProp.displayName} (${matchedProp.health} HP).`);
                                break;
                            }

                            case 'tp': {
                                if (parts.length < 3 || isNaN(Number(parts[1])) || isNaN(Number(parts[2]))) {
                                    sendSystemMessage(`Coordonnées manquantes ou invalides. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
                                    break;
                                }
                                const targetX = Math.round(Number(parts[1]));
                                const targetY = Math.round(Number(parts[2]));
                                if (sender) {
                                    sender.x = targetX;
                                    sender.y = targetY;
                                    players.set(playerId, sender);
                                    broadcast({
                                        type: MessageType.PLAYER_MOVE,
                                        payload: {
                                            playerId,
                                            x: targetX,
                                            y: targetY,
                                            vx: 0,
                                            vy: 0
                                        }
                                    });
                                    sendSystemMessage(`Téléportation réussie vers (${targetX}, ${targetY}).`);
                                }
                                break;
                            }

                            case 'heal': {
                                if (sender) {
                                    const maxH = (sender as any).currentProp?.health || sender.maxHealth || 100;
                                    let amount = maxH;
                                    if (parts.length > 1) {
                                        const parsed = Number(parts[1]);
                                        if (isNaN(parsed) || parsed <= 0) {
                                            sendSystemMessage(`Montant de soin invalide. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
                                            break;
                                        }
                                        amount = parsed;
                                    }
                                    sender.health = Math.min(maxH, sender.health + amount);
                                    players.set(playerId, sender);

                                    broadcast({
                                        type: MessageType.PLAYER_HIT,
                                        payload: {
                                            targetPlayerId: playerId,
                                            playerId,
                                            damage: 0,
                                            health: sender.health,
                                            maxHealth: maxH,
                                            lastHitTimestamp: sender.lastHitTimestamp || 0,
                                            isKilled: false
                                        }
                                    });
                                    sendSystemMessage(`Soin appliqué : ${sender.health}/${maxH} HP.`);
                                }
                                break;
                            }

                            case 'damage': {
                                if (parts.length < 2 || isNaN(Number(parts[1])) || Number(parts[1]) <= 0) {
                                    sendSystemMessage(`Montant de dégâts invalide. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
                                    break;
                                }
                                if (sender) {
                                    const dmg = Number(parts[1]);
                                    const maxH = (sender as any).currentProp?.health || sender.maxHealth || 100;
                                    sender.health = Math.max(0, sender.health - dmg);
                                    sender.lastHitTimestamp = Date.now();
                                    playerRegenTimers.delete(playerId);
                                    players.set(playerId, sender);

                                    broadcast({
                                        type: MessageType.PLAYER_HIT,
                                        payload: {
                                            targetPlayerId: playerId,
                                            playerId,
                                            damage: dmg,
                                            health: sender.health,
                                            maxHealth: maxH,
                                            lastHitTimestamp: sender.lastHitTimestamp,
                                            isKilled: sender.health <= 0
                                        }
                                    });
                                    sendSystemMessage(`Dégâts subis : -${dmg} HP (${sender.health}/${maxH} HP).`);
                                }
                                break;
                            }

                            case 'speed': {
                                if (parts.length < 2) {
                                    sendSystemMessage(`Valeur manquante. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
                                    break;
                                }
                                if (sender) {
                                    if (parts[1].toLowerCase() === 'reset') {
                                        (sender as any).speed = 5;
                                        sendSystemMessage(`Vitesse réinitialisée à 5.`);
                                    } else {
                                        const spd = Number(parts[1]);
                                        if (isNaN(spd) || spd < 1 || spd > 20) {
                                            sendSystemMessage(`Vitesse invalide (1 à 20). Utilisation : ${def.syntax} (Exemple : ${def.example})`);
                                            break;
                                        }
                                        (sender as any).speed = spd;
                                        sendSystemMessage(`Vitesse définie à ${spd}.`);
                                    }
                                    players.set(playerId, sender);
                                }
                                break;
                            }

                            case 'roll': {
                                let max = 100;
                                if (parts.length > 1) {
                                    const parsed = Number(parts[1]);
                                    if (isNaN(parsed) || parsed < 2) {
                                        sendSystemMessage(`Nombre maximal invalide (minimum 2). Utilisation : ${def.syntax} (Exemple : ${def.example})`);
                                        break;
                                    }
                                    max = Math.floor(parsed);
                                }
                                const result = Math.floor(Math.random() * max) + 1;
                                broadcastSystemMessage(`${senderName} a lancé un dé (1-${max}) et obtient : ${result} !`);
                                break;
                            }

                            case 'me': {
                                if (parts.length < 2) {
                                    sendSystemMessage(`Action manquante. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
                                    break;
                                }
                                const action = parts.slice(1).join(' ');
                                broadcastSystemMessage(`* ${senderName} ${action}`);
                                break;
                            }

                            case 'whistle': {
                                broadcast({
                                    type: MessageType.PROP_WHISTLE,
                                    payload: { playerId, soundKey: 'whistle_default' }
                                });
                                broadcastSystemMessage(`🎵 ${senderName} a sifflé !`);
                                break;
                            }

                            case 'list': {
                                const playerLines: string[] = [];
                                players.forEach((p, id) => {
                                    const isMe = id === playerId;
                                    const roleStr = p.role === PlayerRole.HUNTER ? 'CHASSEUR' : 'PROP';
                                    const propInfo = p.role === PlayerRole.PROP && (p as any).currentProp ? ` [${(p as any).currentProp.displayName}]` : '';
                                    playerLines.push(`• ${p.name || `Joueur ${id.substring(0, 4)}`} (${roleStr}${propInfo}) - ${p.health}/${p.maxHealth || 100} HP${isMe ? ' (Vous)' : ''}`);
                                });
                                sendSystemMessage(`👥 Joueurs connectés (${players.size}) :\n${playerLines.join('\n')}`);
                                break;
                            }

                            case 'ping': {
                                sendSystemMessage(`Pong ! Connexion WebSocket active (Port 8080).`);
                                break;
                            }
                        }
                        break;
                    }

                    // --- MESSAGE STANDARD NORMAL ---
                    const chatMsg: ChatMessagePayload = {
                        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                        senderId: playerId,
                        senderName,
                        senderRole: sender?.role,
                        text: trimmed,
                        timestamp: Date.now()
                    };

                    console.log(`[Chat] [${senderName}]: ${trimmed}`);

                    broadcast({
                        type: MessageType.CHAT_MESSAGE,
                        payload: chatMsg
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