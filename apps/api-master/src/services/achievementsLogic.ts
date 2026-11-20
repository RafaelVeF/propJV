import { AchievementCategory } from '@prop-hunt/shared';

export interface AchievementMeta {
  category: AchievementCategory;
  icon: string;
}

export const ACHIEVEMENTS_METADATA: Record<string, AchievementMeta> = {
  ach_first_win: { category: 'general', icon: '🥇' },
  ach_win_5: { category: 'general', icon: '🎖️' },
  ach_win_10: { category: 'general', icon: '👑' },
  ach_win_25: { category: 'general', icon: '🏆' },
  ach_kill_1: { category: 'hunter', icon: '🎯' },
  ach_cleaner: { category: 'hunter', icon: '💥' },
  ach_terminator: { category: 'hunter', icon: '☠️' },
  ach_survive_time: { category: 'prop', icon: '⏱️' },
  ach_rich: { category: 'general', icon: '💰' },
  ach_taunt_spam: { category: 'fun', icon: '🐔' },
  ach_chameleon: { category: 'prop', icon: '🦎' },
  ach_props_smasher: { category: 'hunter', icon: '🔨' },
  ach_streak_3: { category: 'general', icon: '🔥' },
  ach_make_friend: { category: 'fun', icon: '🤝' },
  ach_damage_dealer: { category: 'hunter', icon: '🧨' },
  ach_veteran: { category: 'general', icon: '⭐' }
};

export interface PlayerStatsContext {
  currencyBalance: number;
  hiderWins: number;
  seekerWins: number;
  matchesPlayed: number;
  totalPlaytimeSeconds: number;
  totalEliminations: number;
  tauntsUsedTotal: number;
  propsTransformedTotal: number;
  propsDestroyedTotal: number;
  damageDealtTotal: number;
  winStreakCurrent: number;
  winStreakBest: number;
  friendsCount: number;
}

export function computeAchievementProgress(
  internalName: string,
  targetValue: number,
  ctx: Partial<PlayerStatsContext>
): { current: number; isUnlocked: boolean; percent: number } {
  const safeTarget = Math.max(1, targetValue);
  let current = 0;

  switch (internalName) {
    case 'ach_first_win':
    case 'ach_win_5':
    case 'ach_win_10':
    case 'ach_win_25':
      current = (ctx.hiderWins ?? 0) + (ctx.seekerWins ?? 0);
      break;
    case 'ach_kill_1':
    case 'ach_cleaner':
    case 'ach_terminator':
      current = ctx.totalEliminations ?? 0;
      break;
    case 'ach_survive_time':
      current = ctx.totalPlaytimeSeconds ?? 0;
      break;
    case 'ach_rich':
      current = ctx.currencyBalance ?? 0;
      break;
    case 'ach_taunt_spam':
      current = ctx.tauntsUsedTotal ?? 0;
      break;
    case 'ach_chameleon':
      current = ctx.propsTransformedTotal ?? 0;
      break;
    case 'ach_props_smasher':
      current = ctx.propsDestroyedTotal ?? 0;
      break;
    case 'ach_streak_3':
      current = Math.max(ctx.winStreakBest ?? 0, ctx.winStreakCurrent ?? 0);
      break;
    case 'ach_make_friend':
      current = ctx.friendsCount ?? 0;
      break;
    case 'ach_damage_dealer':
      current = ctx.damageDealtTotal ?? 0;
      break;
    case 'ach_veteran':
      current = ctx.matchesPlayed ?? 0;
      break;
    default:
      current = 0;
  }

  const cappedCurrent = Math.min(current, safeTarget);
  const percent = Math.min(100, Math.floor((current / safeTarget) * 100));
  const isUnlocked = current >= safeTarget;

  return {
    current: cappedCurrent,
    isUnlocked,
    percent
  };
}
