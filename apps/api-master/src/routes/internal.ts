import { Router, Request, Response } from 'express';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db.js';
import { getMongoDb } from '../mongo.js';
import { requireInternalSecret } from '../middlewares/requireInternalSecret.js';

const router: Router = Router();

// Toutes les routes internes exigent le header x-internal-secret
router.use(requireInternalSecret);

interface HeartbeatBody {
    serverId?: string;
    name?: string;
    host?: string;
    port?: number;
    map?: string;
    status?: 'WAITING' | 'IN_GAME' | 'FULL' | 'OFFLINE' | string;
    playersCount?: number;
    maxPlayers?: number;
}

interface ServerLogBody {
    service?: string;
    serverId?: string;
    level?: 'INFO' | 'WARN' | 'ERROR' | string;
    event?: string;
    userId?: number | null;
    details?: Record<string, unknown>;
}

interface MatchReportPlayer {
    playerId: string;
    userId: number | null;
    username: string;
    role: 'HIDER' | 'SEEKER';
    survived: boolean;
    survivalTimeSec: number;
    scoreEarned: number;
    currencyEarned: number;
    eliminations: number;
    transformationsCount: number;
    propsUsed: string[];
    finalProp: string | null;
    seekerClass: string | null;
    tauntsUsed: number;
    propsDestroyed: number;
    damageDealt: number;
    damageTaken: number;
    shotsFired: number;
    shotsHit: number;
}

interface MatchReportEvent {
    t: number;
    type: 'TRANSFORM' | 'TAUNT' | 'HIT' | 'ELIMINATION' | string;
    userId: number | null;
    targetId?: number | null;
    prop?: string;
    taunt?: string;
    nearestSeekerDist?: number | null;
}

interface MatchReportBody {
    serverId?: string;
    mapName?: string;
    startTime?: string;
    endTime?: string;
    durationSec?: number;
    winningTeam?: 'HIDER' | 'SEEKER' | 'DRAW';
    players?: MatchReportPlayer[];
    events?: MatchReportEvent[];
}

interface IdNameRow extends RowDataPacket {
    id: number;
    internal_name: string;
}

interface ExistingUserRow extends RowDataPacket {
    user_id: number;
}

function toMysqlDateTime(isoOrDate: string | Date | undefined, fallback: Date): string {
    const parsed = isoOrDate ? new Date(isoOrDate) : fallback;
    const d = Number.isNaN(parsed.getTime()) ? fallback : parsed;
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

// 1. POST /api/internal/servers/heartbeat : Upsert dans MongoDB active_servers
router.post('/servers/heartbeat', async (req: Request, res: Response): Promise<void> => {
    try {
        const body = (req.body || {}) as HeartbeatBody;
        const serverId = typeof body.serverId === 'string' ? body.serverId.trim() : '';

        if (!serverId) {
            res.status(400).json({ success: false, message: 'serverId requis.' });
            return;
        }

        const payload = {
            serverId,
            name: body.name || serverId,
            host: body.host || 'localhost',
            port: Number(body.port) || 8080,
            map: body.map || 'map_01_32p',
            status: body.status || 'WAITING',
            playersCount: Math.max(0, Math.floor(Number(body.playersCount) || 0)),
            maxPlayers: Math.max(1, Math.floor(Number(body.maxPlayers) || 16)),
            lastHeartbeat: new Date(),
        };

        const db = await getMongoDb();
        await db.collection('active_servers').updateOne(
            { serverId },
            { $set: payload },
            { upsert: true }
        );

        res.json({ success: true, serverId, lastHeartbeat: payload.lastHeartbeat });
    } catch (error) {
        console.error('[Internal] Erreur heartbeat serveur :', (error as Error).message);
        res.status(500).json({
            success: false,
            message: 'Impossible d\'enregistrer le heartbeat serveur.',
        });
    }
});

// 2. POST /api/internal/servers/log : Insertion dans MongoDB server_logs
router.post('/servers/log', async (req: Request, res: Response): Promise<void> => {
    try {
        const body = (req.body || {}) as ServerLogBody;
        const event = typeof body.event === 'string' ? body.event.trim() : '';

        if (!event) {
            res.status(400).json({ success: false, message: 'Champ event requis.' });
            return;
        }

        const logDoc: Record<string, unknown> = {
            timestamp: new Date(),
            service: body.service || 'game-server',
            serverId: body.serverId || 'unknown',
            level: body.level || 'INFO',
            event,
            details: body.details ?? {},
        };

        if (typeof body.userId === 'number' && Number.isInteger(body.userId) && body.userId > 0) {
            logDoc.userId = body.userId;
        }

        const db = await getMongoDb();
        await db.collection('server_logs').insertOne(logDoc);

        res.status(201).json({ success: true });
    } catch (error) {
        console.error('[Internal] Erreur insertion server_logs :', (error as Error).message);
        res.status(500).json({
            success: false,
            message: 'Impossible d\'enregistrer le log serveur.',
        });
    }
});

// 3. POST /api/internal/matches/report : Transaction TiDB Cloud + Insertion MongoDB match_telemetry
router.post('/matches/report', async (req: Request, res: Response): Promise<void> => {
    const body = (req.body || {}) as MatchReportBody;
    const serverId = typeof body.serverId === 'string' && body.serverId.trim()
        ? body.serverId.trim()
        : 'srv-local-01';
    const mapName = typeof body.mapName === 'string' && body.mapName.trim()
        ? body.mapName.trim()
        : 'map_01_32p';
    const winningTeam: 'HIDER' | 'SEEKER' | 'DRAW' =
        body.winningTeam === 'HIDER' || body.winningTeam === 'SEEKER' || body.winningTeam === 'DRAW'
            ? body.winningTeam
            : 'DRAW';
    const players = Array.isArray(body.players) ? body.players : [];
    const events = Array.isArray(body.events) ? body.events : [];

    const now = new Date();
    const durationSec = Math.max(0, Math.round(Number(body.durationSec) || 0));
    const endDate = body.endTime ? new Date(body.endTime) : now;
    const startDate = body.startTime
        ? new Date(body.startTime)
        : new Date(endDate.getTime() - durationSec * 1000);

    const startMysql = toMysqlDateTime(startDate, new Date(now.getTime() - durationSec * 1000));
    const endMysql = toMysqlDateTime(endDate, now);

    const connection = await pool.getConnection();
    let matchId: number;
    let persistedPlayersCount = 0;

    try {
        await connection.beginTransaction();

        // 1. Résolution de map_id depuis maps (fallback sur la première map si absente)
        const [mapRows] = await connection.query<IdNameRow[]>(
            `SELECT map_id AS id, internal_name FROM maps WHERE internal_name = ? LIMIT 1`,
            [mapName]
        );
        let mapId = mapRows[0]?.id;
        if (!mapId) {
            const [fallbackMaps] = await connection.query<IdNameRow[]>(
                `SELECT map_id AS id, internal_name FROM maps ORDER BY map_id ASC LIMIT 1`
            );
            mapId = fallbackMaps[0]?.id;
        }
        if (!mapId) {
            throw new Error('Aucune carte configurée dans la table SQL maps.');
        }

        // 2. Insertion de la partie dans matches
        const [matchInsert] = await connection.query<ResultSetHeader>(
            `INSERT INTO matches (server_id, start_time, end_time, duration_seconds, winning_team, map_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [serverId, startMysql, endMysql, durationSec, winningTeam, mapId]
        );
        matchId = Number(matchInsert.insertId);

        // Pré-chargement des catalogues props et seeker_classes pour résolution des clés étrangères
        const [propRows] = await connection.query<IdNameRow[]>(
            `SELECT prop_id AS id, internal_name FROM props`
        );
        const propIdByName = new Map<string, number>();
        for (const r of propRows) {
            propIdByName.set(r.internal_name, Number(r.id));
        }

        const [classRows] = await connection.query<IdNameRow[]>(
            `SELECT seeker_class_id AS id, internal_name FROM seeker_classes`
        );
        const classIdByName = new Map<string, number>();
        for (const r of classRows) {
            classIdByName.set(r.internal_name, Number(r.id));
        }

        // Filtrage des joueurs authentifiés (userId SQL valide)
        const authPlayers = players.filter(
            (p): p is MatchReportPlayer & { userId: number } =>
                typeof p.userId === 'number' && Number.isInteger(p.userId) && p.userId > 0
        );

        const validUserIds = new Set<number>();
        if (authPlayers.length > 0) {
            const ids = Array.from(new Set(authPlayers.map((p) => p.userId)));
            const [existingUsers] = await connection.query<ExistingUserRow[]>(
                `SELECT user_id FROM users WHERE user_id IN (?)`,
                [ids]
            );
            for (const u of existingUsers) {
                validUserIds.add(Number(u.user_id));
            }
        }

        // 3. Pour chaque joueur authentifié et existant en base :
        const processedUserIds = new Set<number>();
        for (const p of authPlayers) {
            if (!validUserIds.has(p.userId) || processedUserIds.has(p.userId)) {
                continue;
            }
            processedUserIds.add(p.userId);

            const role: 'HIDER' | 'SEEKER' = p.role === 'SEEKER' ? 'SEEKER' : 'HIDER';
            const isWin = winningTeam === role;
            const isSurvivor = role === 'HIDER' ? Boolean(p.survived) : null;
            const survivalTimeSec = Math.max(0, Math.round(Number(p.survivalTimeSec) || 0));
            const scoreEarned = Math.max(0, Math.round(Number(p.scoreEarned) || 0));
            const currencyEarned = Math.max(0, Math.round(Number(p.currencyEarned) || 0));
            const eliminations = Math.max(0, Math.round(Number(p.eliminations) || 0));
            const transformationsCount = Math.max(0, Math.round(Number(p.transformationsCount) || 0));
            const tauntsUsed = Math.max(0, Math.round(Number(p.tauntsUsed) || 0));
            const propsDestroyed = Math.max(0, Math.round(Number(p.propsDestroyed) || 0));
            const damageDealt = Math.max(0, Math.round(Number(p.damageDealt) || 0));
            const damageTaken = Math.max(0, Math.round(Number(p.damageTaken) || 0));
            const shotsFired = Math.max(0, Math.round(Number(p.shotsFired) || 0));
            const shotsHit = Math.max(0, Math.round(Number(p.shotsHit) || 0));

            const finalPropId =
                role === 'HIDER' && p.finalProp ? (propIdByName.get(p.finalProp) ?? null) : null;
            const seekerClassId =
                role === 'SEEKER'
                    ? (p.seekerClass ? (classIdByName.get(p.seekerClass) ?? null) : (classIdByName.get('seeker_recruit') ?? null))
                    : null;

            // 3a. Insertion dans matches_users
            await connection.query(
                `INSERT INTO matches_users (
                    match_id, user_id, role, score_earned, currency_earned,
                    is_survivor, survival_time_seconds, eliminations,
                    transformations_count, taunts_used, props_destroyed,
                    damage_dealt, damage_taken, shots_fired, shots_hit,
                    final_prop_id, seeker_class_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    matchId,
                    p.userId,
                    role,
                    scoreEarned,
                    currencyEarned,
                    isSurvivor,
                    survivalTimeSec,
                    eliminations,
                    transformationsCount,
                    tauntsUsed,
                    propsDestroyed,
                    damageDealt,
                    damageTaken,
                    shotsFired,
                    shotsHit,
                    finalPropId,
                    seekerClassId,
                ]
            );

            // 3b. Mise à jour cumulative de users_stats
            const hiderWinInc = isWin && role === 'HIDER' ? 1 : 0;
            const seekerWinInc = isWin && role === 'SEEKER' ? 1 : 0;
            const winFlag = isWin ? 1 : 0;

            await connection.query(
                `INSERT INTO users_stats (
                    user_id, total_score, hider_wins, seeker_wins, matches_played,
                    total_playtime_seconds, total_eliminations, taunts_used_total,
                    props_transformed_total, props_destroyed_total,
                    damage_dealt_total, damage_taken_total,
                    win_streak_current, win_streak_best
                ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    total_score = total_score + VALUES(total_score),
                    hider_wins = hider_wins + VALUES(hider_wins),
                    seeker_wins = seeker_wins + VALUES(seeker_wins),
                    matches_played = matches_played + 1,
                    total_playtime_seconds = total_playtime_seconds + VALUES(total_playtime_seconds),
                    total_eliminations = total_eliminations + VALUES(total_eliminations),
                    taunts_used_total = taunts_used_total + VALUES(taunts_used_total),
                    props_transformed_total = props_transformed_total + VALUES(props_transformed_total),
                    props_destroyed_total = props_destroyed_total + VALUES(props_destroyed_total),
                    damage_dealt_total = damage_dealt_total + VALUES(damage_dealt_total),
                    damage_taken_total = damage_taken_total + VALUES(damage_taken_total),
                    win_streak_best = GREATEST(win_streak_best, IF(? = 1, win_streak_current + 1, 0)),
                    win_streak_current = IF(? = 1, win_streak_current + 1, 0)`,
                [
                    p.userId,
                    scoreEarned,
                    hiderWinInc,
                    seekerWinInc,
                    durationSec,
                    eliminations,
                    tauntsUsed,
                    transformationsCount,
                    propsDestroyed,
                    damageDealt,
                    damageTaken,
                    winFlag,
                    winFlag,
                    winFlag,
                    winFlag,
                ]
            );

            // 3c. Crédit des pièces + trace d'audit currency_transactions
            if (currencyEarned > 0) {
                await connection.query(
                    `UPDATE users SET currency_balance = currency_balance + ? WHERE user_id = ?`,
                    [currencyEarned, p.userId]
                );

                await connection.query(
                    `INSERT INTO currency_transactions (user_id, amount, transaction_reference, reference_id)
                     VALUES (?, ?, 'MATCH_REWARD', ?)`,
                    [p.userId, currencyEarned, matchId]
                );
            }

            persistedPlayersCount += 1;
        }

        await connection.commit();
    } catch (sqlError) {
        await connection.rollback();
        console.error('[Internal] Rollback SQL sur /api/internal/matches/report :', sqlError);
        res.status(500).json({
            success: false,
            message: 'Échec de la transaction SQL lors de l\'enregistrement de la partie.',
        });
        return;
    } finally {
        connection.release();
    }

    // 4. Insertion du document complet dans MongoDB match_telemetry (avec le matchId SQL généré)
    let telemetryStored = false;
    try {
        const db = await getMongoDb();
        await db.collection('match_telemetry').insertOne({
            matchId,
            serverId,
            map: mapName,
            durationSec,
            winnerTeam: winningTeam,
            playedAt: Number.isNaN(endDate.getTime()) ? now : endDate,
            players: players.map((p) => ({
                userId: p.userId,
                username: p.username,
                role: p.role,
                survived: Boolean(p.survived),
                survivalTimeSec: Math.max(0, Math.round(Number(p.survivalTimeSec) || 0)),
                scoreEarned: Math.max(0, Math.round(Number(p.scoreEarned) || 0)),
                currencyEarned: Math.max(0, Math.round(Number(p.currencyEarned) || 0)),
                transformationsCount: Math.max(0, Math.round(Number(p.transformationsCount) || 0)),
                propsUsed: Array.isArray(p.propsUsed) ? p.propsUsed : [],
                tauntsUsed: Math.max(0, Math.round(Number(p.tauntsUsed) || 0)),
                eliminations: Math.max(0, Math.round(Number(p.eliminations) || 0)),
                propsDestroyed: Math.max(0, Math.round(Number(p.propsDestroyed) || 0)),
                shotsFired: Math.max(0, Math.round(Number(p.shotsFired) || 0)),
                shotsHit: Math.max(0, Math.round(Number(p.shotsHit) || 0)),
                damageDealt: Math.max(0, Math.round(Number(p.damageDealt) || 0)),
                damageTaken: Math.max(0, Math.round(Number(p.damageTaken) || 0)),
            })),
            events,
        });
        telemetryStored = true;
    } catch (mongoError) {
        console.error(
            `[Internal] Échec insertion MongoDB match_telemetry (matchId=${matchId}) :`,
            (mongoError as Error).message
        );
    }

    console.log(
        `[Internal] Match #${matchId} enregistré (TiDB: ${persistedPlayersCount} joueur(s) auth, MongoDB: ${telemetryStored ? 'OK' : 'KO'})`
    );

    res.status(201).json({
        success: true,
        matchId,
        persistedPlayersCount,
        telemetryStored,
    });
});

export default router;
