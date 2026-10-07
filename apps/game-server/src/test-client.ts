import WebSocket from 'ws';
import { MessageType, type NetworkMessage, type PlayerMovePayload } from '@prop-hunt/shared';

const ws = new WebSocket('ws://localhost:8080');

ws.on('open', () => {
    console.log('[TestClient] Connecté au serveur de jeu.');

    // Simule l'envoi d'une intention de mouvement vers la droite (vx: 1, vy: 0) toutes les 100ms
    const moveInterval = setInterval(() => {
        const movePayload: PlayerMovePayload = {playerId: 'test-player', vx: 1, vy: 0};
        const message: NetworkMessage = {
            type: MessageType.PLAYER_MOVE,
            payload: movePayload
        };
        ws.send(JSON.stringify(message));
    }, 100);

    // Arrête le test après 5 secondes
    setTimeout(() => {
        clearInterval(moveInterval);
        ws.close();
        console.log('[TestClient] Test terminé, déconnexion.');
    }, 5000);
});

ws.on('message', (data) => {
    try {
        const message: NetworkMessage = JSON.parse(data.toString());

        if (message.type === MessageType.WELCOME) {
            console.log('[TestClient] Reçu WELCOME :', message.payload);
        }

        if (message.type === MessageType.GAME_STATE_UPDATE) {
            // Affiche la position officielle renvoyée par le serveur autoritaire
            const { players } = message.payload as { players: any[] };
            players.forEach(p => {
                console.log(`[Server State] Joueur ${p.id} -> Position X: ${p.id ? p.x.toFixed(2) : p.x}, Y: ${p.y.toFixed(2)}`);
            });
        }
    } catch (e) {
        console.error('[TestClient] Erreur de parsing du message :', e);
    }
});

ws.on('close', () => {
    console.log('[TestClient] Connexion fermée.');
});