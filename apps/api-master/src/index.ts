import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GAME_NAME } from 'shared';

// a changer plus tard pour utiliser directement les constantes de .env

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: GAME_NAME, service: 'api-master' });
});

app.listen(PORT, () => {
  console.log(`[API Master] Running on http://localhost:${PORT} (${GAME_NAME})`);
});