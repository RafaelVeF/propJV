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

interface GlobalMatchesSummaryRow extends RowDataPacket {
    total_matches: number;
    hider_wins: number;
    seeker_wins: number;
    draw_matches: number;
}

interface GlobalUsersStatsSummaryRow extends RowDataPacket {
    total_playtime_seconds: number;
    total_eliminations: number;
    sum_hider_wins: number;
    sum_seeker_wins: number;
}

interface LeaderboardRow extends RowDataPacket {
    user_id: number;
    username: string;
    wins: number;
    matches_played: number;
    winrate: number;
}

interface GlobalTelemetryFacetResult {
    globalAverages: Array<{
        playerEntries: number;
        avgSurvivalTimeSec: number | null;
        seekerShotsFired: number;
        seekerShotsHit: number;
    }>;
    propRanking: Array<{
        _id: string;
        count: number;
    }>;
    totalPropUses: Array<{
        total: number;
    }>;
}

export interface GlobalPropUsageItem {
    prop: string;
    count: number;
    usagePercent: number;
}

export interface GlobalTelemetryStats {
    avgSurvivalTimeSec: number | null;
    avgAccuracyPercent: number | null;
    starProp: GlobalPropUsageItem | null;
    topProps: GlobalPropUsageItem[];
}

interface UserAdminRow extends RowDataPacket {
    admin_flag: number | boolean;
}

interface SeekerClassFreqRow extends RowDataPacket {
    class_internal_name: string;
    class_name: string;
    weapon_name: string | null;
    matches_count: number;
}

interface TotalCountRow extends RowDataPacket {
    total: number;
}

interface MapBalanceRow extends RowDataPacket {
    map_internal_name: string;
    map_name: string;
    total_matches: number;
    hider_wins: number;
    seeker_wins: number;
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

        // 1. Statistiques globales depuis MySQL (users_stats) + statut admin + classe Seeker favorite
        const [
            [statsRows],
            [matchRows],
            [adminRows],
            [favClassRows],
        ] = await Promise.all([
            pool.query<UserStatsRow[]>(
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
            ),
            pool.query<RecentMatchRow[]>(
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
            ),
            pool.query<UserAdminRow[]>(
                `SELECT admin_flag FROM users WHERE user_id = ? LIMIT 1`,
                [userId]
            ),
            pool.query<SeekerClassFreqRow[]>(
                `SELECT
                    sc.internal_name AS class_internal_name,
                    COALESCE(sct.display_name, sc.internal_name) AS class_name,
                    COALESCE(wt_ranged.display_name, wt_melee.display_name) AS weapon_name,
                    COUNT(*) AS matches_count
                 FROM matches_users mu
                 INNER JOIN seeker_classes sc ON mu.seeker_class_id = sc.seeker_class_id
                 LEFT JOIN seeker_classes_translations sct
                    ON sc.seeker_class_id = sct.seeker_class_id AND sct.language_id = 2
                 LEFT JOIN weapons_translations wt_ranged
                    ON sc.ranged_weapon_id = wt_ranged.weapon_id AND wt_ranged.language_id = 2
                 LEFT JOIN weapons_translations wt_melee
                    ON sc.melee_weapon_id = wt_melee.weapon_id AND wt_melee.language_id = 2
                 WHERE mu.user_id = ? AND mu.role = 'SEEKER' AND mu.seeker_class_id IS NOT NULL
                 GROUP BY sc.seeker_class_id, sc.internal_name, sct.display_name, wt_ranged.display_name, wt_melee.display_name
                 ORDER BY matches_count DESC, sc.seeker_class_id ASC
                 LIMIT 1`,
                [userId]
            ),
        ]);

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

        const isAdmin = Boolean(
            adminRows[0] &&
                (Number(adminRows[0].admin_flag) === 1 || adminRows[0].admin_flag === true)
        );

        const favClassRow = favClassRows[0];
        const favoriteSeekerClass = favClassRow
            ? {
                  internalName: favClassRow.class_internal_name,
                  name: favClassRow.class_name,
                  weaponName: favClassRow.weapon_name ?? null,
                  matchesCount: Number(favClassRow.matches_count ?? 0),
              }
            : null;

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
            isAdmin,
            stats,
            recentMatches,
            telemetry,
            favoriteSeekerClass,
        });
    } catch (error) {
        console.error('Erreur récupération /api/stats/me :', error);
        res.status(500).json({
            success: false,
            message: 'Erreur interne du serveur lors de la récupération des statistiques.',
        });
    }
});

async function fetchMongoGlobalTelemetry(logContext: string): Promise<GlobalTelemetryStats | null> {
    try {
        const db = await getMongoDb();
        const aggResult = await db
            .collection('match_telemetry')
            .aggregate<GlobalTelemetryFacetResult>([
                { $unwind: '$players' },
                {
                    $facet: {
                        globalAverages: [
                            {
                                $group: {
                                    _id: null,
                                    playerEntries: { $sum: 1 },
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
                        propRanking: [
                            {
                                $unwind: {
                                    path: '$players.propsUsed',
                                    preserveNullAndEmptyArrays: false,
                                },
                            },
                            { $match: { 'players.propsUsed': { $nin: [null, ''] } } },
                            { $group: { _id: '$players.propsUsed', count: { $sum: 1 } } },
                            { $sort: { count: -1, _id: 1 } },
                            { $limit: 5 },
                        ],
                        totalPropUses: [
                            {
                                $unwind: {
                                    path: '$players.propsUsed',
                                    preserveNullAndEmptyArrays: false,
                                },
                            },
                            { $match: { 'players.propsUsed': { $nin: [null, ''] } } },
                            { $count: 'total' },
                        ],
                    },
                },
            ])
            .toArray();

        const facet = aggResult[0];
        const avgData = facet?.globalAverages?.[0];
        const totalPropCount = Number(facet?.totalPropUses?.[0]?.total ?? 0);

        const topProps: GlobalPropUsageItem[] = (facet?.propRanking ?? []).map((item) => {
            const count = Number(item.count ?? 0);
            const usagePercent =
                totalPropCount > 0 ? Math.round((count / totalPropCount) * 1000) / 10 : 0;
            return {
                prop: String(item._id),
                count,
                usagePercent,
            };
        });

        if (!avgData && topProps.length === 0) {
            return null;
        }

        const shotsFired = Number(avgData?.seekerShotsFired ?? 0);
        const shotsHit = Number(avgData?.seekerShotsHit ?? 0);

        return {
            avgSurvivalTimeSec:
                avgData?.avgSurvivalTimeSec !== null &&
                avgData?.avgSurvivalTimeSec !== undefined
                    ? Math.round(Number(avgData.avgSurvivalTimeSec))
                    : null,
            avgAccuracyPercent:
                shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 1000) / 10 : null,
            starProp: topProps[0] ?? null,
            topProps,
        };
    } catch (mongoError) {
        console.warn(
            `Télémétrie MongoDB indisponible pour ${logContext} :`,
            (mongoError as Error).message
        );
        return null;
    }
}

// GET /api/stats/global : Statistiques communautaires (Top 10 Hiders/Seekers, Objet Star, Classe Seeker Star)
router.get('/global', requireAuth, async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
        const [
            [topHidersRows],
            [topSeekersRows],
            [starClassRows],
            [totalSeekerClassRows],
            mongoTelemetry,
        ] = await Promise.all([
            pool.query<LeaderboardRow[]>(
                `SELECT
                    u.user_id,
                    u.username,
                    us.hider_wins AS wins,
                    us.matches_played,
                    ROUND((us.hider_wins * 100.0) / us.matches_played, 1) AS winrate
                 FROM users_stats us
                 INNER JOIN users u ON us.user_id = u.user_id
                 WHERE us.matches_played >= 1
                 ORDER BY winrate DESC, us.hider_wins DESC, us.total_score DESC
                 LIMIT 10`
            ),
            pool.query<LeaderboardRow[]>(
                `SELECT
                    u.user_id,
                    u.username,
                    us.seeker_wins AS wins,
                    us.matches_played,
                    ROUND((us.seeker_wins * 100.0) / us.matches_played, 1) AS winrate
                 FROM users_stats us
                 INNER JOIN users u ON us.user_id = u.user_id
                 WHERE us.matches_played >= 1
                 ORDER BY winrate DESC, us.seeker_wins DESC, us.total_score DESC
                 LIMIT 10`
            ),
            pool.query<SeekerClassFreqRow[]>(
                `SELECT
                    sc.internal_name AS class_internal_name,
                    COALESCE(sct.display_name, sc.internal_name) AS class_name,
                    COALESCE(wt_ranged.display_name, wt_melee.display_name) AS weapon_name,
                    COUNT(*) AS matches_count
                 FROM matches_users mu
                 INNER JOIN seeker_classes sc ON mu.seeker_class_id = sc.seeker_class_id
                 LEFT JOIN seeker_classes_translations sct
                    ON sc.seeker_class_id = sct.seeker_class_id AND sct.language_id = 2
                 LEFT JOIN weapons_translations wt_ranged
                    ON sc.ranged_weapon_id = wt_ranged.weapon_id AND wt_ranged.language_id = 2
                 LEFT JOIN weapons_translations wt_melee
                    ON sc.melee_weapon_id = wt_melee.weapon_id AND wt_melee.language_id = 2
                 WHERE mu.role = 'SEEKER' AND mu.seeker_class_id IS NOT NULL
                 GROUP BY sc.seeker_class_id, sc.internal_name, sct.display_name, wt_ranged.display_name, wt_melee.display_name
                 ORDER BY matches_count DESC, sc.seeker_class_id ASC
                 LIMIT 1`
            ),
            pool.query<TotalCountRow[]>(
                `SELECT COUNT(*) AS total
                 FROM matches_users
                 WHERE role = 'SEEKER' AND seeker_class_id IS NOT NULL`
            ),
            fetchMongoGlobalTelemetry('/api/stats/global'),
        ]);

        const mapLeaderboard = (rows: LeaderboardRow[]) =>
            rows.map((row, index) => ({
                rank: index + 1,
                user_id: Number(row.user_id),
                username: row.username,
                wins: Number(row.wins ?? 0),
                matches_played: Number(row.matches_played ?? 0),
                winrate: Number(row.winrate ?? 0),
            }));

        const starClassRow = starClassRows[0];
        const totalSeekerPicks = Number(totalSeekerClassRows[0]?.total ?? 0);
        const starClassCount = Number(starClassRow?.matches_count ?? 0);

        const favoriteSeekerClass = starClassRow
            ? {
                  internalName: starClassRow.class_internal_name,
                  name: starClassRow.class_name,
                  weaponName: starClassRow.weapon_name ?? null,
                  matchesCount: starClassCount,
                  selectionPercent:
                      totalSeekerPicks > 0
                          ? Math.round((starClassCount / totalSeekerPicks) * 1000) / 10
                          : 0,
              }
            : null;

        res.json({
            success: true,
            leaderboards: {
                hiders: mapLeaderboard(topHidersRows),
                seekers: mapLeaderboard(topSeekersRows),
            },
            starProp: mongoTelemetry?.starProp ?? null,
            favoriteSeekerClass,
        });
    } catch (error) {
        console.error('Erreur récupération /api/stats/global :', error);
        res.status(500).json({
            success: false,
            message:
                'Erreur interne du serveur lors de la récupération des statistiques globales.',
        });
    }
});

// GET /api/stats/admin : Santé du jeu & équilibrage (réservé aux administrateurs admin_flag = 1)
router.get('/admin', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const payload = req.user as { userId?: number } | undefined;
        const userId = Number(payload?.userId);

        if (!userId || Number.isNaN(userId)) {
            res.status(401).json({ success: false, message: 'Session invalide.' });
            return;
        }

        const [adminRows] = await pool.query<UserAdminRow[]>(
            `SELECT admin_flag FROM users WHERE user_id = ? LIMIT 1`,
            [userId]
        );
        const isAdmin = Boolean(
            adminRows[0] &&
                (Number(adminRows[0].admin_flag) === 1 || adminRows[0].admin_flag === true)
        );

        if (!isAdmin) {
            res.status(403).json({
                success: false,
                message: 'Accès refusé. Droits administrateur requis.',
            });
            return;
        }

        const [
            [matchesSummaryRows],
            [usersStatsSummaryRows],
            [usersCountRows],
            [mapBalanceRows],
            mongoTelemetry,
        ] = await Promise.all([
            pool.query<GlobalMatchesSummaryRow[]>(
                `SELECT
                    COUNT(*) AS total_matches,
                    COALESCE(SUM(CASE WHEN winning_team = 'HIDER' THEN 1 ELSE 0 END), 0) AS hider_wins,
                    COALESCE(SUM(CASE WHEN winning_team = 'SEEKER' THEN 1 ELSE 0 END), 0) AS seeker_wins,
                    COALESCE(SUM(CASE WHEN winning_team = 'DRAW' THEN 1 ELSE 0 END), 0) AS draw_matches
                 FROM matches`
            ),
            pool.query<GlobalUsersStatsSummaryRow[]>(
                `SELECT
                    COALESCE(SUM(total_playtime_seconds), 0) AS total_playtime_seconds,
                    COALESCE(SUM(total_eliminations), 0) AS total_eliminations,
                    COALESCE(SUM(hider_wins), 0) AS sum_hider_wins,
                    COALESCE(SUM(seeker_wins), 0) AS sum_seeker_wins
                 FROM users_stats`
            ),
            pool.query<TotalCountRow[]>(`SELECT COUNT(*) AS total FROM users`),
            pool.query<MapBalanceRow[]>(
                `SELECT
                    mp.internal_name AS map_internal_name,
                    COALESCE(mt.display_name, mp.internal_name) AS map_name,
                    COUNT(*) AS total_matches,
                    COALESCE(SUM(CASE WHEN m.winning_team = 'HIDER' THEN 1 ELSE 0 END), 0) AS hider_wins,
                    COALESCE(SUM(CASE WHEN m.winning_team = 'SEEKER' THEN 1 ELSE 0 END), 0) AS seeker_wins
                 FROM matches m
                 INNER JOIN maps mp ON m.map_id = mp.map_id
                 LEFT JOIN maps_translations mt ON mp.map_id = mt.map_id AND mt.language_id = 2
                 GROUP BY mp.map_id, mp.internal_name, mt.display_name
                 ORDER BY total_matches DESC, mp.map_id ASC`
            ),
            fetchMongoGlobalTelemetry('/api/stats/admin'),
        ]);

        const mRow = matchesSummaryRows[0];
        const uRow = usersStatsSummaryRows[0];
        const matchesHiderWins = Number(mRow?.hider_wins ?? 0);
        const matchesSeekerWins = Number(mRow?.seeker_wins ?? 0);
        const sumHiderWins = Number(uRow?.sum_hider_wins ?? 0);
        const sumSeekerWins = Number(uRow?.sum_seeker_wins ?? 0);

        const hiderWins =
            matchesHiderWins + matchesSeekerWins > 0 ? matchesHiderWins : sumHiderWins;
        const seekerWins =
            matchesHiderWins + matchesSeekerWins > 0 ? matchesSeekerWins : sumSeekerWins;

        const health = {
            total_matches: Number(mRow?.total_matches ?? 0),
            total_users: Number(usersCountRows[0]?.total ?? 0),
            total_playtime_seconds: Number(uRow?.total_playtime_seconds ?? 0),
            total_eliminations: Number(uRow?.total_eliminations ?? 0),
            hider_wins: hiderWins,
            seeker_wins: seekerWins,
            draw_matches: Number(mRow?.draw_matches ?? 0),
        };

        const maps = mapBalanceRows.map((row) => {
            const total = Number(row.total_matches ?? 0);
            const hWins = Number(row.hider_wins ?? 0);
            const sWins = Number(row.seeker_wins ?? 0);
            const decided = hWins + sWins;
            return {
                internalName: row.map_internal_name,
                name: row.map_name,
                totalMatches: total,
                hiderWins: hWins,
                seekerWins: sWins,
                hiderWinrate: decided > 0 ? Math.round((hWins / decided) * 1000) / 10 : 0,
                seekerWinrate: decided > 0 ? Math.round((sWins / decided) * 1000) / 10 : 0,
            };
        });

        res.json({
            success: true,
            health,
            telemetry: mongoTelemetry
                ? {
                      avgSurvivalTimeSec: mongoTelemetry.avgSurvivalTimeSec,
                      avgAccuracyPercent: mongoTelemetry.avgAccuracyPercent,
                  }
                : null,
            maps,
        });
    } catch (error) {
        console.error('Erreur récupération /api/stats/admin :', error);
        res.status(500).json({
            success: false,
            message:
                'Erreur interne du serveur lors de la récupération des métriques administrateur.',
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
