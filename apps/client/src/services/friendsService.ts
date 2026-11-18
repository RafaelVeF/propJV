import type {
  FriendActionResponse,
  FriendsOverviewResponse,
  SendFriendRequestPayload,
} from '@prop-hunt/shared';
import { API_ORIGIN, getAuthorizationHeader } from './authService';

const FRIENDS_BASE_URL = `${API_ORIGIN}/api/friends`;

/** Erreur normalisée renvoyée par le service d'amis. */
export class FriendsServiceError extends Error {
  readonly status: number;
  readonly details: unknown[];

  constructor(message: string, status = 0, details: unknown[] = []) {
    super(message);
    this.name = 'FriendsServiceError';
    this.status = status;
    this.details = details;
  }
}

async function parseJson(response: Response): Promise<Record<string, unknown> | null> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function friendsRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const authHeader = getAuthorizationHeader();
  if (!authHeader) {
    throw new FriendsServiceError('Vous devez être connecté pour accéder à vos amis.', 401);
  }

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('Authorization', authHeader);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${FRIENDS_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new FriendsServiceError(
      'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.',
      0
    );
  }

  const data = await parseJson(response);

  if (!response.ok) {
    const message =
      typeof data?.message === 'string' ? data.message : `Erreur serveur (${response.status}).`;
    const details = Array.isArray(data?.errors) ? data.errors : [];
    throw new FriendsServiceError(message, response.status, details);
  }

  if (data === null) {
    throw new FriendsServiceError('Réponse vide du serveur.', response.status);
  }

  return data as T;
}

/** Récupère les amis, demandes reçues, demandes envoyées et utilisateurs bloqués. */
export async function fetchFriendsOverview(): Promise<FriendsOverviewResponse> {
  return friendsRequest<FriendsOverviewResponse>('', { method: 'GET' });
}

/** Envoie une demande d'ami à un joueur via son pseudo. */
export async function sendFriendRequest(username: string): Promise<FriendActionResponse> {
  const payload: SendFriendRequestPayload = { username };
  return friendsRequest<FriendActionResponse>('/request', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Accepte une demande d'ami reçue. */
export async function acceptFriendRequest(relationshipId: number): Promise<FriendActionResponse> {
  return friendsRequest<FriendActionResponse>(`/${relationshipId}/accept`, {
    method: 'POST',
  });
}

/** Refuse une demande reçue ou annule une demande envoyée. */
export async function rejectFriendRequest(relationshipId: number): Promise<FriendActionResponse> {
  return friendsRequest<FriendActionResponse>(`/${relationshipId}/reject`, {
    method: 'POST',
  });
}

/** Supprime un ami ou débloque un joueur. */
export async function removeFriend(relationshipId: number): Promise<FriendActionResponse> {
  return friendsRequest<FriendActionResponse>(`/${relationshipId}`, {
    method: 'DELETE',
  });
}

/** Bloque un joueur via son pseudo. */
export async function blockUser(username: string): Promise<FriendActionResponse> {
  const payload: SendFriendRequestPayload = { username };
  return friendsRequest<FriendActionResponse>('/block', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
