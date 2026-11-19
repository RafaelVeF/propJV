import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GAME_NAME } from '@prop-hunt/shared';
import authRoutes from './routes/auth.js';
import friendsRoutes from './routes/friends.js';
import internalRoutes from './routes/internal.js';
import { pool } from './db.js';
import { initMongo } from './mongo.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json());

// Activation des routes d'authentification (/auth et /api/auth pour compatibilité)
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);

// Activation des routes d'amis (/friends et /api/friends pour compatibilité)
app.use('/friends', friendsRoutes);
app.use('/api/friends', friendsRoutes);

// Routes internes sécurisées (game-server -> api-master)
app.use('/api/internal', internalRoutes);

// Test de la connexion TiDB & MongoDB au démarrage
pool.getConnection()
  .then(connection => {
    console.log("Connecté avec succès à TiDB !");
    connection.release();
  })
  .catch(err => {
    console.error("Erreur de connexion à TiDB :", err.message);
  });

void initMongo();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: GAME_NAME, service: 'api-master' });
});

app.listen(PORT, () => {
  console.log(`[API Master] Running on http://localhost:${PORT} (${GAME_NAME})`);
});