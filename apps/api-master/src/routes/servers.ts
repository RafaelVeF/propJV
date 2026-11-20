import { Router, Request, Response } from 'express';
import { getMongoDb } from '../mongo.js';

const router: Router = Router();

export interface ActiveServerItem {
    serverId: string;
    name: string;
    host: string;
    port: number;
    map: string;
    status: 'WAITING' | 'IN_GAME' | 'FULL';
    playersCount: number;
    maxPlayers: number;
    updatedAt: string | null;
}

// GET /api/servers : Liste publique légère des serveurs de jeu actifs (MongoDB active_servers)
router.get('/', async (_req: Request, res: Response): Promise<void> => {
    try {
        const db = await getMongoDb();
        const docs = await db
            .collection('active_servers')
            .find({ status: { $ne: 'OFFLINE' } })
            .sort({ updatedAt: -1, lastHeartbeat: -1 })
            .limit(20)
            .toArray();

        const nowMs = Date.now();
        // On considère un serveur comme actif si son dernier heartbeat date de moins de 2 minutes
        // (si aucun serveur n'est récent mais que des entrées existent, on garde celles de moins de 10 min)
        const recentDocs = docs.filter((doc) => {
            const rawDate = doc.updatedAt ?? doc.lastHeartbeat;
            if (!rawDate) return true;
            const ts = new Date(rawDate as string | Date).getTime();
            return Number.isNaN(ts) || nowMs - ts <= 2 * 60 * 1000;
        });

        const sourceDocs = recentDocs.length > 0 ? recentDocs : docs;

        const servers: ActiveServerItem[] = sourceDocs.map((doc) => {
            const rawStatus = String(doc.status || 'WAITING').toUpperCase();
            const status: 'WAITING' | 'IN_GAME' | 'FULL' =
                rawStatus === 'IN_GAME' || rawStatus === 'FULL' ? rawStatus : 'WAITING';

            const rawDate = doc.updatedAt ?? doc.lastHeartbeat;
            const parsedDate = rawDate ? new Date(rawDate as string | Date) : null;
            const updatedAt =
                parsedDate && !Number.isNaN(parsedDate.getTime())
                    ? parsedDate.toISOString()
                    : null;

            return {
                serverId: String(doc.serverId || 'srv-local-01'),
                name: String(doc.name || doc.serverId || 'Serveur Local #1 - FR'),
                host: String(doc.host || 'localhost'),
                port: Number(doc.port) || 8080,
                map: String(doc.map || 'map_01_32p'),
                status,
                playersCount: Math.max(0, Math.floor(Number(doc.playersCount) || 0)),
                maxPlayers: Math.max(1, Math.floor(Number(doc.maxPlayers) || 32)),
                updatedAt,
            };
        });

        res.json({
            success: true,
            servers,
        });
    } catch (error) {
        console.warn('[Servers] MongoDB indisponible pour GET /api/servers :', (error as Error).message);
        res.json({
            success: true,
            servers: [],
        });
    }
});

export default router;
