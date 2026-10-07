import WebSocket from 'ws';
import { MessageType, type NetworkMessage, type PlayerMovePayload, type TransformPropPayload } from '@prop-hunt/shared';

// Fonction pour créer un faux joueur/client
function createTestClient(name: string, startX: number, startY: number) {
    const client = new WebSocket('ws://localhost:8080');

    client.on('open', () => {
        console.log(`[${name}] Connecté au serveur`);

        // Simuler un déplacement initial
        const initialMove: PlayerMovePayload = {
            playerId: name,
            x: startX,
            y: startY,
            vx: 0,
            vy: 0
        };

        client.send(JSON.stringify({
            type: MessageType.PLAYER_MOVE,
            payload: initialMove
        } satisfies NetworkMessage));

        // Simuler un mouvement supplémentaire après 2 secondes
        setTimeout(() => {
            console.log(`[${name}] Envoi d'un mouvement...`);
            const updateMove: PlayerMovePayload = {
                playerId: name,
                x: startX + 50,
                y: startY + 50,
                vx: 5,
                vy: 5
            };

            client.send(JSON.stringify({
                type: MessageType.PLAYER_MOVE,
                payload: updateMove
            } satisfies NetworkMessage));
        }, 2000);

        // Simuler une transformation en prop après 4 secondes
        setTimeout(() => {
            console.log(`[${name}] Transformation en prop !`);
            const transformPayload: TransformPropPayload = {
                playerId: name,
                spriteKey: 'vase_antique'
            };

            client.send(JSON.stringify({
                type: MessageType.TRANSFORM_PROP,
                payload: transformPayload
            } satisfies NetworkMessage));
        }, 4000);
    });

    client.on('message', (data) => {
        console.log(`[${name}] Message reçu du serveur ->`, data.toString());
    });

    client.on('close', () => {
        console.log(`[${name}] Déconnecté du serveur`);
    });
}

// Lancer plusieurs clients en même temps pour tester la diffusion
console.log('Lancement des clients de test...');
createTestClient('Joueur-A', 10, 10);
createTestClient('Joueur-B', 100, 100);
createTestClient('Joueur-C', 200, 200);