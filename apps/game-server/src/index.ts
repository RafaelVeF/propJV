import { WebSocketServer, WebSocket } from 'ws';
import { GAME_NAME } from 'shared';

const PORT = Number(process.env.PORT) || 8080;
const wss = new WebSocketServer({ port: PORT });

console.log(`[Game Server] Running on ws://localhost:${PORT} (${GAME_NAME})`);

wss.on('connection', (ws: WebSocket) => {
  console.log('[Game Server] Client connected');

  ws.send(JSON.stringify({ type: 'WELCOME', game: GAME_NAME }));

  ws.on('message', (message: string) => {
    console.log('[Game Server] Received:', message.toString());
  });

  ws.on('close', () => {
    console.log('[Game Server] Client disconnected');
  });
});
