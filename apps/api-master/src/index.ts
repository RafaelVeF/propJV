import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GAME_NAME } from '@prop-hunt/shared';
import mysql from 'mysql2/promise';

// a changer plus tard pour utiliser directement les constantes de .env

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Configuration du pool de connexion TiDB
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: {
        rejectUnauthorized: true
    }
});

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