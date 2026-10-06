import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GAME_NAME } from '@prop-hunt/shared';
import authRoutes from './routes/auth.js';
import { pool } from './db.js'; 

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Activation de la route
app.use('/api/auth', authRoutes);

// Test de la connexion au démarrage
pool.getConnection()
    .then(connection => {
        console.log("Connecté avec succès à TiDB !");
        connection.release();
    })
    .catch(err => {
        console.error("Erreur de connexion à TiDB :", err.message);
    });

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', app: GAME_NAME, service: 'api-master' });
});

app.listen(PORT, () => {
  console.log(`[API Master] Running on http://localhost:${PORT} (${GAME_NAME})`);
});