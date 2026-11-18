import { API_ORIGIN, getAuthorizationHeader, getToken } from './authService';

const STATS_ROUTE_PREFIX = '/api/stats';
export const STATS_BASE_URL = `${API_ORIGIN}${STATS_ROUTE_PREFIX}`;

export interface UserGlobalStats {
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

export interface RecentMatchItem {
  match_id: number;
  role: 'HIDER' | 'SEEKER';
  score_earned: number;
  is_survivor: boolean | null;
  eliminations: number;
  duration_seconds: number | null;
  winning_team: 'HIDER' | 'SEEKER' | 'DRAW' | null;
  start_time: string;
  map_name: string;
}

export interface TelemetrySummary {
  avgSurvivalTimeSec: number | null;
  accuracyPercent: number | null;
  favoriteProp: string | null;
}

export interface SeekerClassSummary {
  internalName: string;
  name: string;
  weaponName: string | null;
  matchesCount: number;
  selectionPercent?: number;
}

export interface MyStatsPayload {
  success: boolean;
  isAdmin: boolean;
  stats: UserGlobalStats;
  recentMatches: RecentMatchItem[];
  telemetry: TelemetrySummary | null;
  favoriteSeekerClass: SeekerClassSummary | null;
}

export interface MatchDetailsHeader {
  match_id: number;
  server_id: string | null;
  start_time: string;
  end_time: string | null;
  duration_seconds: number | null;
  winning_team: 'HIDER' | 'SEEKER' | 'DRAW' | null;
  map_name: string;
}

export interface MatchParticipant {
  user_id: number;
  username: string;
  role: 'HIDER' | 'SEEKER';
  score_earned: number;
  currency_earned: number;
  is_survivor: boolean | null;
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

export interface MatchTelemetryPlayer {
  userId: number;
  role: 'HIDER' | 'SEEKER';
  survived?: boolean;
  survivalTimeSec?: number;
  transformationsCount?: number;
  propsUsed?: string[];
  tauntsUsed?: number;
  eliminations?: number;
  shotsFired?: number;
  shotsHit?: number;
  damageDealt?: number;
  damageTaken?: number;
}

export interface MatchTelemetryEvent {
  t: number;
  type: 'TRANSFORM' | 'TAUNT' | 'HIT' | 'ELIMINATION' | string;
  userId?: number;
  targetId?: number;
  prop?: string;
  taunt?: string;
  nearestSeekerDist?: number;
}

export interface MatchTelemetryDocument {
  matchId: number;
  serverId?: string;
  map?: string;
  durationSec?: number;
  winnerTeam?: string;
  playedAt?: string;
  players?: MatchTelemetryPlayer[];
  events?: MatchTelemetryEvent[];
}

export interface MatchDetailsPayload {
  success: boolean;
  match: MatchDetailsHeader;
  participants: MatchParticipant[];
  telemetry: MatchTelemetryDocument | null;
}

export interface GlobalCommunityStats {
  total_matches: number;
  total_playtime_seconds: number;
  total_eliminations: number;
  hider_wins: number;
  seeker_wins: number;
  draw_matches: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: number;
  username: string;
  wins: number;
  matches_played: number;
  winrate: number;
}

export interface GlobalPropUsageItem {
  prop: string;
  count: number;
  usagePercent: number;
}

export interface GlobalTelemetrySummary {
  avgSurvivalTimeSec: number | null;
  avgAccuracyPercent: number | null;
  starProp: GlobalPropUsageItem | null;
  topProps: GlobalPropUsageItem[];
}

export interface GlobalStatsPayload {
  success: boolean;
  leaderboards: {
    hiders: LeaderboardEntry[];
    seekers: LeaderboardEntry[];
  };
  starProp: GlobalPropUsageItem | null;
  favoriteSeekerClass: SeekerClassSummary | null;
}

export interface AdminHealthStats {
  total_matches: number;
  total_users: number;
  total_playtime_seconds: number;
  total_eliminations: number;
  hider_wins: number;
  seeker_wins: number;
  draw_matches: number;
}

export interface AdminMapBalanceItem {
  internalName: string;
  name: string;
  totalMatches: number;
  hiderWins: number;
  seekerWins: number;
  hiderWinrate: number;
  seekerWinrate: number;
}

export interface AdminStatsPayload {
  success: boolean;
  health: AdminHealthStats;
  telemetry: {
    avgSurvivalTimeSec: number | null;
    avgAccuracyPercent: number | null;
  } | null;
  maps: AdminMapBalanceItem[];
}

const GLOBAL_STATS_CACHE_TTL_MS = 30_000;
let cachedGlobalStats: { payload: GlobalStatsPayload; timestamp: number } | null = null;

export function invalidateGlobalStatsCache(): void {
  cachedGlobalStats = null;
}

export class StatsServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'StatsServiceError';
    this.status = status;
  }
}

async function statsRequest<T>(path: string): Promise<T> {
  const token = getToken();
  const authHeader = getAuthorizationHeader();

  if (!token || !authHeader) {
    throw new StatsServiceError('Non connecté.', 401);
  }

  const headers = new Headers({
    Accept: 'application/json',
    Authorization: authHeader,
  });

  let response: Response;
  try {
    response = await fetch(`${STATS_BASE_URL}${path}`, {
      method: 'GET',
      headers,
    });
  } catch {
    throw new StatsServiceError(
      'Impossible de contacter le serveur. Vérifiez votre connexion.',
      0
    );
  }

  let data: Record<string, unknown> | null = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = null;
    }
  }

  if (!response.ok || !data) {
    const message =
      typeof data?.message === 'string'
        ? data.message
        : `Erreur lors du chargement des statistiques (${response.status}).`;
    throw new StatsServiceError(message, response.status);
  }

  return data as unknown as T;
}

export async function fetchMyStats(): Promise<MyStatsPayload> {
  return statsRequest<MyStatsPayload>('/me');
}

export async function fetchGlobalStats(forceRefresh = false): Promise<GlobalStatsPayload> {
  const now = Date.now();
  if (
    !forceRefresh &&
    cachedGlobalStats &&
    now - cachedGlobalStats.timestamp < GLOBAL_STATS_CACHE_TTL_MS
  ) {
    return cachedGlobalStats.payload;
  }

  const payload = await statsRequest<GlobalStatsPayload>('/global');
  cachedGlobalStats = {
    payload,
    timestamp: Date.now(),
  };
  return payload;
}

export async function fetchAdminStats(): Promise<AdminStatsPayload> {
  return statsRequest<AdminStatsPayload>('/admin');
}

export async function fetchMatchDetails(matchId: number): Promise<MatchDetailsPayload> {
  return statsRequest<MatchDetailsPayload>(`/matches/${encodeURIComponent(String(matchId))}`);
}
