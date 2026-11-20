import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let clientPromise: Promise<MongoClient> | null = null;
let cachedDb: Db | null = null;

export function getMongoDbName(): string {
    return process.env.MONGO_DB_NAME?.trim() || 'propjv';
}

/**
 * Retourne l'instance singleton de la base MongoDB (`propjv` par défaut).
 * Lève une erreur si MONGO_URI n'est pas configuré ou si la connexion échoue.
 */
export async function getMongoDb(): Promise<Db> {
    if (cachedDb) {
        return cachedDb;
    }

    const uri = process.env.MONGO_URI?.trim();
    if (!uri) {
        throw new Error('MONGO_URI non configuré dans les variables d’environnement.');
    }

    const dbName = getMongoDbName();

    if (!clientPromise) {
        const client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 4000,
            connectTimeoutMS: 4000,
        });

        clientPromise = client.connect().catch((err) => {
            clientPromise = null;
            cachedDb = null;
            throw err;
        });
    }

    const connectedClient = await clientPromise;
    cachedDb = connectedClient.db(dbName);
    return cachedDb;
}

/**
 * Initialise et vérifie la connexion MongoDB dès le démarrage de l'API
 * avec un ping explicite, sans bloquer le lancement du serveur en cas d'échec.
 */
export async function initMongo(): Promise<void> {
    const dbName = getMongoDbName();
    try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        console.log(`[MongoDB] Connecté avec succès à la base "${dbName}" !`);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[MongoDB] Échec de connexion à la base "${dbName}" : ${message}`);
    }
}