import WebSocket from 'ws';
import { MessageType, type NetworkMessage, type PlayerMovePayload, type TransformPropPayload } from '@prop-hunt/shared';

const client = new WebSocket('ws://localhost:8080');

client.on('open', () => {
    console.log('Connected to server');

    // 1. Simuler un mouvement
    const movePayload: PlayerMovePayload = {
        playerId: 'test-player',
        x: 50,
        y: 120,
        vx: 0,
        vy: 0
    };

    client.send(JSON.stringify({
        type: MessageType.PLAYER_MOVE,
        payload: movePayload
    } satisfies NetworkMessage));

    // 2. Simuler une transformation en Prop après 1 seconde
    setTimeout(() => {
        console.log('Sending TRANSFORM_PROP...');
        const transformPayload: TransformPropPayload = {
            playerId: 'test-player',
            spriteKey: 'box_wood' 
        };

        client.send(JSON.stringify({
            type: MessageType.TRANSFORM_PROP,
            payload: transformPayload
        } satisfies NetworkMessage));
    }, 1000);
});

client.on('message', (data) => {
    console.log('Message from server:', data.toString());
});