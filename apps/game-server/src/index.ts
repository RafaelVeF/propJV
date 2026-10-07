import { WebSocketServer, WebSocket } from 'ws';
import { 
    MessageType, 
    PlayerRole, 
    type Player, 
    type NetworkMessage, 
    type PlayerMovePayload, 
    type TransformPropPayload,
    type PropLockPayload,
    type PropWhistlePayload,
    type HunterShootPayload
} from '@prop-hunt/shared';

const wss = new WebSocketServer({ port: 8080 }); // Serveur WebSocket sur le port 8080

const players = new Map<string, Player>(); // Map pour stocker les états des joueurs
const clients = new Set<WebSocket>();    // Set pour stocker les sockets actifs

wss.on('connection', (ws) => {
    console.log('Client connected');
    const playerId = Math.random().toString(36).substring(2, 15); // ID aléatoire assigné au joueur

    // Initialisation d'un nouveau joueur (par défaut en tant que Prop)
    const newPlayer: Player = {
        id: playerId,
        name: `Player_${playerId.substring(0, 4)}`,
        x: 0,
        y: 0,
        health: 100,
        role: PlayerRole.PROP,
        isLocked: false,
        currentSpriteKey: 'default_box'
    };

    players.set(playerId, newPlayer);
    clients.add(ws); 

    // Envoi du message de bienvenue au joueur qui vient de se connecter
    ws.send(JSON.stringify({ 
        type: MessageType.WELCOME, 
        payload: { player: newPlayer } 
    } satisfies NetworkMessage));

    // Notifie les autres joueurs qu'un nouveau joueur a rejoint
    clients.forEach(clientWs => {
        if (clientWs !== ws && clientWs.readyState === clientWs.OPEN) {
            clientWs.send(JSON.stringify({ 
                type: MessageType.PLAYER_JOINED, 
                payload: { player: newPlayer } 
            } satisfies NetworkMessage));
        }
    });

    ws.on('message', (data) => {
        console.log('Message received:', data.toString());
        try {
            const message: NetworkMessage = JSON.parse(data.toString());
            
            switch (message.type) {
                case MessageType.PLAYER_MOVE: {

                    const payload = message.payload as PlayerMovePayload; 

                    // Met à jour la position du joueur dans le serveur
                    const currentPlayer = players.get(playerId);
                    if (currentPlayer) {
                        currentPlayer.x = payload.x;
                        currentPlayer.y = payload.y;
                        players.set(playerId, currentPlayer);
                    }

                    // Diffuse la position aux autres joueurs
                    clients.forEach(clientWs => {
                        if (clientWs !== ws && clientWs.readyState === clientWs.OPEN) {
                            clientWs.send(JSON.stringify({ 
                                type: MessageType.PLAYER_MOVE, 
                                payload: { 
                                    playerId, 
                                    x: payload.x, 
                                    y: payload.y, 
                                    vx: payload.vx, 
                                    vy: payload.vy 
                                } 
                            } satisfies NetworkMessage));
                        }
                    });
                    break;
                }
                case MessageType.TRANSFORM_PROP: {

                    const payload = message.payload as TransformPropPayload;

                    // Met à jour le sprite du joueur Prop dans le serveur
                    const playerToTransform = players.get(playerId);
                    if (playerToTransform && playerToTransform.role === PlayerRole.PROP) {
                        playerToTransform.currentSpriteKey = payload.spriteKey;
                        players.set(playerId, playerToTransform);
                        
                        // Notifie les autres joueurs de la transformation
                        clients.forEach(clientWs => {
                            if (clientWs !== ws && clientWs.readyState === clientWs.OPEN) {
                                clientWs.send(JSON.stringify({ 
                                    type: MessageType.TRANSFORM_PROP, 
                                    payload: { 
                                        playerId, 
                                        spriteKey: payload.spriteKey 
                                    } 
                                } satisfies NetworkMessage));
                            }
                        });
                    }
                    break;
                }
                case MessageType.PROP_LOCK: {

                    const payload = message.payload as PropLockPayload;

                    // Met à jour l'état de verrouillage du joueur Prop dans le serveur
                    const playerToLock = players.get(playerId);
                    if (playerToLock && playerToLock.role === PlayerRole.PROP) {
                        playerToLock.isLocked = payload.isLocked;
                        players.set(playerId, playerToLock);

                        // Diffuse l'état de verrouillage (immobilisation du prop)
                        clients.forEach(clientWs => {
                            if (clientWs !== ws && clientWs.readyState === clientWs.OPEN) {
                                clientWs.send(JSON.stringify({
                                    type: MessageType.PROP_LOCK,
                                    payload: { playerId, isLocked: payload.isLocked }
                                } satisfies NetworkMessage));
                            }
                        });
                    }
                    break;
                }
                case MessageType.PROP_WHISTLE: {
                    const payload = message.payload as PropWhistlePayload;

                    // Diffuse le son du sifflement du prop aux autres joueurs
                    clients.forEach(clientWs => {
                        if (clientWs !== ws && clientWs.readyState === clientWs.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: MessageType.PROP_WHISTLE,
                                payload: { playerId, soundKey: payload.soundKey }
                            } satisfies NetworkMessage));
                        }
                    });
                    break;
                }
                case MessageType.HUNTER_SHOOT: {
                    const payload = message.payload as HunterShootPayload;

                    // Diffuse l'action de tir du chasseur
                    clients.forEach(clientWs => {
                        if (clientWs !== ws && clientWs.readyState === clientWs.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: MessageType.HUNTER_SHOOT,
                                payload
                            } satisfies NetworkMessage));
                        }
                    });
                    break;
                }

                case MessageType.PLAYER_HIT: {
                    const payload = message.payload as { playerId: string; damage: number };

                    // Notifie les autres joueurs qu'un joueur a été touché
                    clients.forEach(clientWs => {
                        if (clientWs !== ws && clientWs.readyState === clientWs.OPEN) {
                            clientWs.send(JSON.stringify({
                                type: MessageType.PLAYER_HIT,
                                payload
                            } satisfies NetworkMessage));
                        }
                    });
                    break;
                }
            }
        } catch (error) {
            console.error('Erreur lors du traitement du message WebSocket :', error);
        }
    });

    ws.on('close', () => {
        console.log('Client disconnected');
        players.delete(playerId);
        clients.delete(ws); 
        
        // Notifie les autres joueurs de la déconnexion
        clients.forEach(clientWs => {
            if (clientWs.readyState === clientWs.OPEN) {
                clientWs.send(JSON.stringify({ 
                    type: MessageType.PLAYER_LEFT, 
                    payload: { playerId } 
                } satisfies NetworkMessage));
            }
        });     
    });
}); 