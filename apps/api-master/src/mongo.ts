import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

let clientPromise: Promise<MongoClient> | null = null;
let cachedDb: Db | null = null;

function getDbName(): string {
    return process.env.MONGO_DB_NAME?.trim() || 'propjv';
}

export async function getMongoDb(): Promise<Db> {
    if (cachedDb) {
        return cachedDb;
    }

    const uri = process.env.MONGO_URI?.trim();
    if (!uri) {
        throw new Error('Variable d\'environnement MONGO_URI manquante.');
    }

    if (!clientPromise) {
        const client = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
        });
        clientPromise = client.connect().catch((err) => {
            clientPromise = null;
            throw err;
        });
    }

    const connectedClient = await clientPromise;
    cachedDb = connectedClient.db(getDbName());
    return cachedDb;
}

export async function initMongo(): Promise<void> {
    const dbName = getDbName();
    try {
        const db = await getMongoDb();
        await db.command({ ping: 1 });
        console.log(`[MongoDB] Connecté avec succès à la base "${dbName}"`);
    } catch (error) {
        console.error(
            `[MongoDB] Échec de connexion à la base "${dbName}" :`,
            (error as Error).message
        );
    }
}
