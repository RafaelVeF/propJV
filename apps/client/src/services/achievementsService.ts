import type {
  AchievementsOverviewResponse,
  ClaimAchievementResponse
} from '@prop-hunt/shared';
import { API_ORIGIN, getToken } from './authService';

export class AchievementsServiceError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'AchievementsServiceError';
    this.status = status;
  }
}

async function authFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  if (!token) {
    throw new AchievementsServiceError('Vous devez être connecté pour accéder aux succès.', 401);
  }

  const url = `${API_ORIGIN}${endpoint}`;
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.message || `Erreur serveur (${response.status})`;
    throw new AchievementsServiceError(errorMsg, response.status);
  }

  return data as T;
}

export async function fetchAchievementsOverview(): Promise<AchievementsOverviewResponse> {
  return authFetch<AchievementsOverviewResponse>('/api/achievements', { method: 'GET' });
}

export async function claimAchievementReward(achievementId: number): Promise<ClaimAchievementResponse> {
  return authFetch<ClaimAchievementResponse>(`/api/achievements/${achievementId}/claim`, {
    method: 'POST'
  });
}
