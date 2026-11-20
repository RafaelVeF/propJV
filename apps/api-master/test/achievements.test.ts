import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAchievementProgress,
  ACHIEVEMENTS_METADATA,
  PlayerStatsContext
} from '../src/services/achievementsLogic.js';

describe('Achievements Logic Tests', () => {
  it('should initialize and contain metadata for all 16 achievements', () => {
    const requiredKeys = [
      'ach_first_win',
      'ach_win_5',
      'ach_win_10',
      'ach_win_25',
      'ach_kill_1',
      'ach_cleaner',
      'ach_terminator',
      'ach_survive_time',
      'ach_rich',
      'ach_taunt_spam',
      'ach_chameleon',
      'ach_props_smasher',
      'ach_streak_3',
      'ach_make_friend',
      'ach_damage_dealer',
      'ach_veteran'
    ];

    for (const key of requiredKeys) {
      assert.ok(ACHIEVEMENTS_METADATA[key], `Metadata missing for ${key}`);
      assert.ok(ACHIEVEMENTS_METADATA[key].category, `Category missing for ${key}`);
      assert.ok(ACHIEVEMENTS_METADATA[key].icon, `Icon missing for ${key}`);
    }
  });

  it('should calculate first victory based on hider + seeker wins', () => {
    const ctx: Partial<PlayerStatsContext> = { hiderWins: 0, seekerWins: 0 };
    const res0 = computeAchievementProgress('ach_first_win', 1, ctx);
    assert.equal(res0.current, 0);
    assert.equal(res0.isUnlocked, false);
    assert.equal(res0.percent, 0);

    const ctx1: Partial<PlayerStatsContext> = { hiderWins: 1, seekerWins: 0 };
    const res1 = computeAchievementProgress('ach_first_win', 1, ctx1);
    assert.equal(res1.current, 1);
    assert.equal(res1.isUnlocked, true);
    assert.equal(res1.percent, 100);

    // Should cap at targetValue
    const ctxOver: Partial<PlayerStatsContext> = { hiderWins: 4, seekerWins: 3 };
    const resOver = computeAchievementProgress('ach_first_win', 1, ctxOver);
    assert.equal(resOver.current, 1);
    assert.equal(resOver.isUnlocked, true);
    assert.equal(resOver.percent, 100);
  });

  it('should calculate eliminations progression correctly for seeker achievements', () => {
    const ctx: Partial<PlayerStatsContext> = { totalEliminations: 12 };

    const kill1 = computeAchievementProgress('ach_kill_1', 1, ctx);
    assert.equal(kill1.current, 1);
    assert.equal(kill1.isUnlocked, true);

    const cleaner = computeAchievementProgress('ach_cleaner', 5, ctx);
    assert.equal(cleaner.current, 5);
    assert.equal(cleaner.isUnlocked, true);

    const terminator = computeAchievementProgress('ach_terminator', 20, ctx);
    assert.equal(terminator.current, 12);
    assert.equal(terminator.isUnlocked, false);
    assert.equal(terminator.percent, 60);
  });

  it('should calculate win streak considering both best and current streaks', () => {
    const ctx1: Partial<PlayerStatsContext> = { winStreakCurrent: 1, winStreakBest: 2 };
    const res1 = computeAchievementProgress('ach_streak_3', 3, ctx1);
    assert.equal(res1.current, 2);
    assert.equal(res1.isUnlocked, false);
    assert.equal(res1.percent, 66);

    const ctx2: Partial<PlayerStatsContext> = { winStreakCurrent: 3, winStreakBest: 1 };
    const res2 = computeAchievementProgress('ach_streak_3', 3, ctx2);
    assert.equal(res2.current, 3);
    assert.equal(res2.isUnlocked, true);
    assert.equal(res2.percent, 100);
  });

  it('should calculate friends count achievement correctly', () => {
    const ctx0: Partial<PlayerStatsContext> = { friendsCount: 0 };
    const res0 = computeAchievementProgress('ach_make_friend', 1, ctx0);
    assert.equal(res0.current, 0);
    assert.equal(res0.isUnlocked, false);

    const ctx1: Partial<PlayerStatsContext> = { friendsCount: 4 };
    const res1 = computeAchievementProgress('ach_make_friend', 1, ctx1);
    assert.equal(res1.current, 1);
    assert.equal(res1.isUnlocked, true);
  });

  it('should calculate coins in bank achievement correctly', () => {
    const ctxLow: Partial<PlayerStatsContext> = { currencyBalance: 450 };
    const resLow = computeAchievementProgress('ach_rich', 1000, ctxLow);
    assert.equal(resLow.current, 450);
    assert.equal(resLow.isUnlocked, false);
    assert.equal(resLow.percent, 45);

    const ctxHigh: Partial<PlayerStatsContext> = { currencyBalance: 1500 };
    const resHigh = computeAchievementProgress('ach_rich', 1000, ctxHigh);
    assert.equal(resHigh.current, 1000);
    assert.equal(resHigh.isUnlocked, true);
    assert.equal(resHigh.percent, 100);
  });

  it('should gracefully handle empty or undefined stats context', () => {
    const res = computeAchievementProgress('ach_taunt_spam', 10, {});
    assert.equal(res.current, 0);
    assert.equal(res.isUnlocked, false);
    assert.equal(res.percent, 0);
  });
});
