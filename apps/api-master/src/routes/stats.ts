import { Router, Response } from 'express';
import { RowDataPacket } from 'mysql2';
import { pool } from '../db.js';
import { getMongoDb } from '../mongo.js';
import { requireAuth, AuthRequest } from '../middlewares/requireAuth.js';

const router: Router = Router();

interface UserStatsRow extends RowDataPacket {
    total_score: number;
    hider_wins: number;
    seeker_wins: number;
    matches_played: number;
    total_playtime_seconds: number;
    total_eliminations: number;
    taunts_used_total: number;
    props_transformed_total: number;
    props_destroyed_total: number;
    damage_dealt_total: number;
    damage_taken_total: number;
    win_streak_current: number;
    win_streak_best: number;
}

interface RecentMatchRow extends RowDataPacket {
    match_id: number;
    role: 'HIDER' | 'SEEKER';
    score_earned: number;
    is_survivor: number | boolean | null;
    eliminations: number;
    duration_seconds: number | null;
    winning_team: 'HIDER' | 'SEEKER' | 'DRAW' | null;
    start_time: Date | string;
    map_name: string;
}

interface MatchHeaderRow extends RowDataPacket {
    match_id: number;
    server_id: string | null;
    start_time: Date | string;
    end_time: Date | string | null;
    duration_seconds: number | null;
    winning_team: 'HIDER' | 'SEEKER' | 'DRAW' | null;
    map_name: string;
}

interface MatchParticipantRow extends RowDataPacket {
    user_id: number;
    username: string;
    role: 'HIDER' | 'SEEKER';
    score_earned: number;
    currency_earned: number;
    is_survivor: number | boolean | null;
    survival_time_seconds: number;
    eliminations: number;
    transformations_count: number;
    taunts_used: number;
    props_destroyed: number;
    damage_dealt: number;
    damage_taken: number;
    shots_fired: number;
    shots_hit: number;
    final_prop_name: string | null;
    seeker_class_name: string | null;
}

interface TelemetryFacetResult {
    roleMetrics: Array<{
        matchCount: number;
        avgSurvivalTimeSec: number | null;
        seekerShotsFired: number;
        seekerShotsHit: number;
    }>;
    propMetrics: Array<{
        _id: string;
        count: number;
    }>;
}

export interface TelemetryStats {
    avgSurvivalTimeSec: number | null;
    accuracyPercent: number | null;
    favoriteProp: string | null;
}

const DEFAULT_USER_STATS = {
    total_score: 0,
    hider_wins: 0,
    seeker_wins: 0,
    matches_played: 0,
    total_playtime_seconds: 0,
    total_eliminations: 0,
    taunts_used_total: 0,
    props_transformed_total: 0,
    props_destroyed_total: 0,
    damage_dealt_total: 0,
    damage_taken_total: 0,
    win_streak_current: 0,
    win_streak_best: 0,
};

// GET /api/stats/me : Récupère les statistiques complètes (SQL + MongoDB) du joueur connecté
router.get('/me', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const payload = req.user as { userId?: number; username?: string } | undefined;
        const userId = Number(payload?.userId);

        if (!userId || Number.isNaN(userId)) {
            res.status(401).json({ success: false, message: 'Session invalide.' });
            return;
        }

        // 1. Statistiques globales depuis MySQL (users_stats)
        const [statsRows] = await pool.query<UserStatsRow[]>(
            `SELECT
                total_score,
                hider_wins,
                seeker_wins,
                matches_played,
                total_playtime_seconds,
                total_eliminations,
                taunts_used_total,
                props_transformed_total,
                props_destroyed_total,
                damage_dealt_total,
                damage_taken_total,
                win_streak_current,
                win_streak_best
             FROM users_stats
             WHERE user_id = ?
             LIMIT 1`,
            [userId]
        );

        const rawStats = statsRows[0];
        const stats = rawStats
            ? {
                  total_score: Number(rawStats.total_score ?? 0),
                  hider_wins: Number(rawStats.hider_wins ?? 0),
                  seeker_wins: Number(rawStats.seeker_wins ?? 0),
                  matches_played: Number(rawStats.matches_played ?? 0),
                  total_playtime_seconds: Number(rawStats.total_playtime_seconds ?? 0),
                  total_eliminations: Number(rawStats.total_eliminations ?? 0),
                  taunts_used_total: Number(rawStats.taunts_used_total ?? 0),
                  props_transformed_total: Number(rawStats.props_transformed_total ?? 0),
                  props_destroyed_total: Number(rawStats.props_destroyed_total ?? 0),
                  damage_dealt_total: Number(rawStats.damage_dealt_total ?? 0),
                  damage_taken_total: Number(rawStats.damage_taken_total ?? 0),
                  win_streak_current: Number(rawStats.win_streak_current ?? 0),
                  win_streak_best: Number(rawStats.win_streak_best ?? 0),
              }
            : { ...DEFAULT_USER_STATS };

        // 2. Les 8 derniers matchs via matches_users + matches + maps
        const [matchRows] = await pool.query<RecentMatchRow[]>(
            `SELECT
                mu.match_id,
                mu.role,
                mu.score_earned,
                mu.is_survivor,
                mu.eliminations,
                m.duration_seconds,
                m.winning_team,
                m.start_time,
                mp.internal_name AS map_name
             FROM matches_users mu
             INNER JOIN matches m ON mu.match_id = m.match_id
             INNER JOIN maps mp ON m.map_id = mp.map_id
             WHERE mu.user_id = ?
             ORDER BY m.start_time DESC, mu.match_id DESC
             LIMIT 8`,
            [userId]
        );

        const recentMatches = matchRows.map((row) => ({
            match_id: Number(row.match_id),
            role: row.role,
            score_earned: Number(row.score_earned ?? 0),
            is_survivor: row.is_survivor === null ? null : Boolean(row.is_survivor),
            eliminations: Number(row.eliminations ?? 0),
            duration_seconds: row.duration_seconds !== null ? Number(row.duration_seconds) : null,
            winning_team: row.winning_team ?? null,
            start_time: row.start_time,
            map_name: row.map_name,
        }));

        // 3. Télémétrie MongoDB (encapsulée dans un try/catch pour tolérer l'absence de Mongo)
        let telemetry: TelemetryStats | null = null;
        try {
            const db = await getMongoDb();
            const aggResult = await db
                .collection('match_telemetry')
                .aggregate<TelemetryFacetResult>([
                    { $match: { 'players.userId': userId } },
                    { $unwind: '$players' },
                    { $match: { 'players.userId': userId } },
                    {
                        $facet: {
                            roleMetrics: [
                                {
                                    $group: {
                                        _id: null,
                                        matchCount: { $sum: 1 },
                                        avgSurvivalTimeSec: {
                                            $avg: {
                                                $cond: [
                                                    { $eq: ['$players.role', 'HIDER'] },
                                                    '$players.survivalTimeSec',
                                                    null,
                                                ],
                                            },
                                        },
                                        seekerShotsFired: {
                                            $sum: {
                                                $cond: [
                                                    { $eq: ['$players.role', 'SEEKER'] },
                                                    { $ifNull: ['$players.shotsFired', 0] },
                                                    0,
                                                ],
                                            },
                                        },
                                        seekerShotsHit: {
                                            $sum: {
                                                $cond: [
                                                    { $eq: ['$players.role', 'SEEKER'] },
                                                    { $ifNull: ['$players.shotsHit', 0] },
                                                    0,
                                                ],
                                            },
                                        },
                                    },
                                },
                            ],
                            propMetrics: [
                                {
                                    $unwind: {
                                        path: '$players.propsUsed',
                                        preserveNullAndEmptyArrays: false,
                                    },
                                },
                                { $match: { 'players.propsUsed': { $nin: [null, ''] } } },
                                { $group: { _id: '$players.propsUsed', count: { $sum: 1 } } },
                                { $sort: { count: -1, _id: 1 } },
                                { $limit: 1 },
                            ],
                        },
                    },
                ])
                .toArray();

            const facet = aggResult[0];
            const roleData = facet?.roleMetrics?.[0];

            if (roleData && roleData.matchCount > 0) {
                const shotsFired = Number(roleData.seekerShotsFired ?? 0);
                const shotsHit = Number(roleData.seekerShotsHit ?? 0);

                telemetry = {
                    avgSurvivalTimeSec:
                        roleData.avgSurvivalTimeSec !== null &&
                        roleData.avgSurvivalTimeSec !== undefined
                            ? Math.round(Number(roleData.avgSurvivalTimeSec))
                            : null,
                    accuracyPercent:
                        shotsFired > 0
                            ? Math.round((shotsHit / shotsFired) * 1000) / 10
                            : null,
                    favoriteProp: facet?.propMetrics?.[0]?._id ?? null,
                };
            }
        } catch (mongoError) {
            console.warn('Télémétrie MongoDB indisponible pour /api/stats/me :', (mongoError as Error).message);
            telemetry = null;
        }

        res.json({
            success: true,
            stats,
            recentMatches,
            telemetry,
        });
    } catch (error) {
        console.error('Erreur récupération /api/stats/me :', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur lors de la récupération des statistiques.',
        });
    }
});

// GET /api/stats/matches/:matchId : Détails complets d'une partie (SQL + télémétrie MongoDB)
router.get('/matches/:matchId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const matchId = Number(req.params.matchId);
        if (!Number.isInteger(matchId) || matchId <= 0) {
            res.status(400).json({
                success: false,
                message: 'Identifiant de partie invalide.',
            });
            return;
        }

        // 1. Informations générales du match depuis matches + maps
        const [matchRows] = await pool.query<MatchHeaderRow[]>(
            `SELECT
                m.match_id,
                m.server_id,
                m.start_time,
                m.end_time,
                m.duration_seconds,
                m.winning_team,
                mp.internal_name AS map_name
             FROM matches m
             INNER JOIN maps mp ON m.map_id = mp.map_id
             WHERE m.match_id = ?
             LIMIT 1`,
            [matchId]
        );

        if (matchRows.length === 0) {
            res.status(404).json({
                success: false,
                message: 'Partie introuvable.',
            });
            return;
        }

        const header = matchRows[0];
        const match = {
            match_id: Number(header.match_id),
            server_id: header.server_id ?? null,
            start_time: header.start_time,
            end_time: header.end_time ?? null,
            duration_seconds: header.duration_seconds !== null ? Number(header.duration_seconds) : null,
            winning_team: header.winning_team ?? null,
            map_name: header.map_name,
        };

        // 2. Liste complète des participants de ce match (matches_users + users + props + seeker_classes)
        const [participantRows] = await pool.query<MatchParticipantRow[]>(
            `SELECT
                mu.user_id,
                u.username,
                mu.role,
                mu.score_earned,
                mu.currency_earned,
                mu.is_survivor,
                mu.survival_time_seconds,
                mu.eliminations,
                mu.transformations_count,
                mu.taunts_used,
                mu.props_destroyed,
                mu.damage_dealt,
                mu.damage_taken,
                mu.shots_fired,
                mu.shots_hit,
                pr.internal_name AS final_prop_name,
                sc.internal_name AS seeker_class_name
             FROM matches_users mu
             INNER JOIN users u ON mu.user_id = u.user_id
             LEFT JOIN props pr ON mu.final_prop_id = pr.prop_id
             LEFT JOIN seeker_classes sc ON mu.seeker_class_id = sc.seeker_class_id
             WHERE mu.match_id = ?
             ORDER BY mu.score_earned DESC, mu.user_id ASC`,
            [matchId]
        );

        const participants = participantRows.map((row) => ({
            user_id: Number(row.user_id),
            username: row.username,
            role: row.role,
            score_earned: Number(row.score_earned ?? 0),
            currency_earned: Number(row.currency_earned ?? 0),
            is_survivor: row.is_survivor === null ? null : Boolean(row.is_survivor),
            survival_time_seconds: Number(row.survival_time_seconds ?? 0),
            eliminations: Number(row.eliminations ?? 0),
            transformations_count: Number(row.transformations_count ?? 0),
            taunts_used: Number(row.taunts_used ?? 0),
            props_destroyed: Number(row.props_destroyed ?? 0),
            damage_dealt: Number(row.damage_dealt ?? 0),
            damage_taken: Number(row.damage_taken ?? 0),
            shots_fired: Number(row.shots_fired ?? 0),
            shots_hit: Number(row.shots_hit ?? 0),
            final_prop_name: row.final_prop_name ?? null,
            seeker_class_name: row.seeker_class_name ?? null,
        }));

        // 3. Télémétrie MongoDB (players.propsUsed + events chronologiques)
        let telemetry: Record<string, unknown> | null = null;
        try {
            const db = await getMongoDb();
            const doc = await db.collection('match_telemetry').findOne(
                { matchId },
                { projection: { _id: 0 } }
            );
            telemetry = doc ? (doc as Record<string, unknown>) : null;
        } catch (mongoError) {
            console.warn(
                `Télémétrie MongoDB indisponible pour /api/stats/matches/${matchId} :`,
                (mongoError as Error).message
            );
            telemetry = null;
        }

        res.json({
            success: true,
            match,
            participants,
            telemetry,
        });
    } catch (error) {
        console.error('Erreur récupération /api/stats/matches/:matchId :', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur lors de la récupération des détails de la partie.',
        });
    }
});

export default router;
