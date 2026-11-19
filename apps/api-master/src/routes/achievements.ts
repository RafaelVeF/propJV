import { Router, Response } from 'express';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { pool } from '../db.js';
import { requireAuth, AuthRequest } from '../middlewares/requireAuth.js';
import {
  computeAchievementProgress,
  ACHIEVEMENTS_METADATA,
  PlayerStatsContext
} from '../services/achievementsLogic.js';
import {
  AchievementItem,
  AchievementsOverviewResponse,
  ClaimAchievementResponse
} from '@prop-hunt/shared';

const router: Router = Router();

interface AchievementRow extends RowDataPacket {
  achievement_id: number;
  internal_name: string;
  reward: number;
  target_value: number;
  display_name: string;
  description: string;
}

interface UserAchievementRow extends RowDataPacket {
  achievement_id: number;
  progress: number;
  is_unlocked: number;
  unlocked_at: string | null;
}

interface StatsRow extends RowDataPacket {
  hider_wins?: number;
  seeker_wins?: number;
  matches_played?: number;
  total_playtime_seconds?: number;
  total_eliminations?: number;
  taunts_used_total?: number;
  props_transformed_total?: number;
  props_destroyed_total?: number;
  damage_dealt_total?: number;
  win_streak_current?: number;
  win_streak_best?: number;
}

interface UserRow extends RowDataPacket {
  currency_balance: number;
}

interface ClaimedRow extends RowDataPacket {
  reference_id: number;
}

interface CountRow extends RowDataPacket {
  count: number;
}

async function fetchPlayerStatsContext(userId: number): Promise<PlayerStatsContext> {
  const [userRows] = await pool.query<UserRow[]>(
    'SELECT currency_balance FROM users WHERE user_id = ? LIMIT 1',
    [userId]
  );
  const currencyBalance = userRows[0]?.currency_balance ?? 0;

  const [statsRows] = await pool.query<StatsRow[]>(
    'SELECT * FROM users_stats WHERE user_id = ? LIMIT 1',
    [userId]
  );
  const s = statsRows[0] || {};

  const [relRows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) AS count 
     FROM users_relationships 
     WHERE (user_id_1 = ? OR user_id_2 = ?) AND status = 'ACCEPTED'`,
    [userId, userId]
  );
  const friendsCount = relRows[0]?.count ?? 0;

  return {
    currencyBalance,
    hiderWins: s.hider_wins ?? 0,
    seekerWins: s.seeker_wins ?? 0,
    matchesPlayed: s.matches_played ?? 0,
    totalPlaytimeSeconds: s.total_playtime_seconds ?? 0,
    totalEliminations: s.total_eliminations ?? 0,
    tauntsUsedTotal: s.taunts_used_total ?? 0,
    propsTransformedTotal: s.props_transformed_total ?? 0,
    propsDestroyedTotal: s.props_destroyed_total ?? 0,
    damageDealtTotal: s.damage_dealt_total ?? 0,
    winStreakCurrent: s.win_streak_current ?? 0,
    winStreakBest: s.win_streak_best ?? 0,
    friendsCount
  };
}

async function fetchAllAchievementsWithTranslations(): Promise<AchievementRow[]> {
  const [rows] = await pool.query<AchievementRow[]>(
    `SELECT 
       a.achievement_id,
       a.internal_name,
       a.reward,
       a.target_value,
       COALESCE(tfr.display_name, ten.display_name, a.internal_name) AS display_name,
       COALESCE(tfr.description, ten.description, '') AS description
     FROM achievements a
     LEFT JOIN achievements_translations tfr ON a.achievement_id = tfr.achievement_id AND tfr.language_id = 2
     LEFT JOIN achievements_translations ten ON a.achievement_id = ten.achievement_id AND ten.language_id = 1
     ORDER BY a.achievement_id ASC`
  );
  return rows;
}

// GET /api/achievements (ou /achievements) : Récupère la liste de tous les succès avec la progression du joueur
router.get('/', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = Number((req.user as any)?.userId);
    if (!userId || isNaN(userId)) {
      res.status(401).json({ success: false, message: 'Utilisateur non authentifié.' });
      return;
    }

    const [achievements, statsCtx, claimedRows, userAchRows] = await Promise.all([
      fetchAllAchievementsWithTranslations(),
      fetchPlayerStatsContext(userId),
      pool.query<ClaimedRow[]>(
        "SELECT reference_id FROM currency_transactions WHERE user_id = ? AND transaction_reference = 'ACHIEVEMENT_REWARD'",
        [userId]
      ).then(([r]) => r),
      pool.query<UserAchievementRow[]>(
        'SELECT achievement_id, progress, is_unlocked, unlocked_at FROM users_achievements WHERE user_id = ?',
        [userId]
      ).then(([r]) => r)
    ]);

    const claimedSet = new Set<number>(claimedRows.map((r) => r.reference_id));
    const userAchMap = new Map<number, UserAchievementRow>(
      userAchRows.map((r) => [r.achievement_id, r])
    );

    const items: AchievementItem[] = [];
    const updatesToPersist: Promise<any>[] = [];

    for (const ach of achievements) {
      const meta = ACHIEVEMENTS_METADATA[ach.internal_name] || { category: 'general', icon: '🏆' };
      const computed = computeAchievementProgress(ach.internal_name, ach.target_value, statsCtx);

      const dbRow = userAchMap.get(ach.achievement_id);
      const isAlreadyUnlocked = Boolean(dbRow?.is_unlocked);
      const isNowUnlocked = isAlreadyUnlocked || computed.isUnlocked;
      const progressValue = Math.max(dbRow?.progress ?? 0, computed.current);
      const progressPercent = Math.min(100, Math.floor((progressValue / Math.max(1, ach.target_value)) * 100));
      const isClaimed = claimedSet.has(ach.achievement_id);

      // Si le succès vient d'être débloqué ou si la progression a changé, mise à jour dans users_achievements
      if (!dbRow || dbRow.progress !== progressValue || (!isAlreadyUnlocked && isNowUnlocked)) {
        updatesToPersist.push(
          pool.query(
            `INSERT INTO users_achievements (user_id, achievement_id, progress, is_unlocked, unlocked_at, created_by)
             VALUES (?, ?, ?, ?, IF(? = 1, NOW(), NULL), ?)
             ON DUPLICATE KEY UPDATE
               progress = VALUES(progress),
               is_unlocked = VALUES(is_unlocked),
               unlocked_at = IF(users_achievements.unlocked_at IS NULL AND VALUES(is_unlocked) = 1, NOW(), users_achievements.unlocked_at)`,
            [userId, ach.achievement_id, progressValue, isNowUnlocked ? 1 : 0, isNowUnlocked ? 1 : 0, userId]
          )
        );
      }

      items.push({
        id: ach.achievement_id,
        internalName: ach.internal_name,
        displayName: ach.display_name,
        description: ach.description,
        reward: ach.reward,
        targetValue: ach.target_value,
        progress: progressValue,
        progressPercent,
        isUnlocked: isNowUnlocked,
        unlockedAt: dbRow?.unlocked_at ? String(dbRow.unlocked_at) : (isNowUnlocked ? new Date().toISOString() : null),
        isClaimed,
        category: meta.category,
        icon: meta.icon
      });
    }

    if (updatesToPersist.length > 0) {
      await Promise.all(updatesToPersist);
    }

    const unclaimedCount = items.filter((a) => a.isUnlocked && !a.isClaimed).length;
    const totalUnlocked = items.filter((a) => a.isUnlocked).length;

    const responsePayload: AchievementsOverviewResponse = {
      success: true,
      achievements: items,
      unclaimedCount,
      totalUnlocked,
      totalAchievements: items.length,
      userCurrencyBalance: statsCtx.currencyBalance
    };

    res.json(responsePayload);
  } catch (error) {
    console.error('Erreur GET /achievements :', error);
    res.status(500).json({ success: false, message: 'Erreur interne lors de la récupération des succès.' });
  }
});

// POST /api/achievements/:id/claim : Réclamer la récompense d'un succès débloqué
router.post('/:id/claim', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const connection = await pool.getConnection();
  try {
    const userId = Number((req.user as any)?.userId);
    const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const achievementId = parseInt(String(rawId), 10);

    if (!userId || isNaN(userId)) {
      res.status(401).json({ success: false, message: 'Utilisateur non authentifié.' });
      return;
    }

    if (isNaN(achievementId) || achievementId <= 0) {
      res.status(400).json({ success: false, message: 'Identifiant de succès invalide.' });
      return;
    }

    // 1. Récupération des informations du succès
    const [achRows] = await connection.query<AchievementRow[]>(
      'SELECT achievement_id, internal_name, reward, target_value FROM achievements WHERE achievement_id = ?',
      [achievementId]
    );

    if (achRows.length === 0) {
      res.status(404).json({ success: false, message: 'Succès introuvable.' });
      return;
    }

    const ach = achRows[0];

    // 2. Vérification si la récompense a déjà été réclamée
    const [claimedRows] = await connection.query<ClaimedRow[]>(
      "SELECT currency_transaction_id FROM currency_transactions WHERE user_id = ? AND transaction_reference = 'ACHIEVEMENT_REWARD' AND reference_id = ? LIMIT 1",
      [userId, achievementId]
    );

    if (claimedRows.length > 0) {
      res.status(400).json({ success: false, message: 'Cette récompense a déjà été réclamée.' });
      return;
    }

    // 3. Vérification de l'état de déblocage
    const [userAchRows] = await connection.query<UserAchievementRow[]>(
      'SELECT is_unlocked, progress FROM users_achievements WHERE user_id = ? AND achievement_id = ?',
      [userId, achievementId]
    );

    let isUnlocked = Boolean(userAchRows[0]?.is_unlocked);

    if (!isUnlocked) {
      // Évaluation dynamique de secours
      const statsCtx = await fetchPlayerStatsContext(userId);
      const computed = computeAchievementProgress(ach.internal_name, ach.target_value, statsCtx);
      if (computed.isUnlocked) {
        isUnlocked = true;
      }
    }

    if (!isUnlocked) {
      res.status(400).json({ success: false, message: "Ce succès n'est pas encore débloqué." });
      return;
    }

    // 4. Transaction SQL pour attribuer les pièces et enregistrer la transaction
    await connection.beginTransaction();

    await connection.query<ResultSetHeader>(
      `INSERT INTO currency_transactions (user_id, amount, transaction_reference, reference_id, created_by)
       VALUES (?, ?, 'ACHIEVEMENT_REWARD', ?, ?)`,
      [userId, ach.reward, achievementId, userId]
    );

    await connection.query<ResultSetHeader>(
      'UPDATE users SET currency_balance = currency_balance + ? WHERE user_id = ?',
      [ach.reward, userId]
    );

    await connection.query<ResultSetHeader>(
      `INSERT INTO users_achievements (user_id, achievement_id, progress, is_unlocked, unlocked_at, created_by)
       VALUES (?, ?, ?, 1, NOW(), ?)
       ON DUPLICATE KEY UPDATE is_unlocked = 1, unlocked_at = COALESCE(users_achievements.unlocked_at, NOW())`,
      [userId, achievementId, ach.target_value, userId]
    );

    const [updatedUserRows] = await connection.query<UserRow[]>(
      'SELECT currency_balance FROM users WHERE user_id = ? LIMIT 1',
      [userId]
    );

    await connection.commit();

    const newBalance = updatedUserRows[0]?.currency_balance ?? 0;

    const response: ClaimAchievementResponse = {
      success: true,
      message: 'Récompense réclamée avec succès !',
      achievementId,
      rewardClaimed: ach.reward,
      newCurrencyBalance: newBalance
    };

    res.json(response);
  } catch (error) {
    await connection.rollback();
    console.error('Erreur POST /achievements/:id/claim :', error);
    res.status(500).json({ success: false, message: 'Erreur interne lors de la réclamation du succès.' });
  } finally {
    connection.release();
  }
});

export default router;
