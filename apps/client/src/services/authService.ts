import type {
  AuthResponsePayload,
  AuthUser,
  LoginRequestPayload,
  RegisterRequestPayload,
} from '@prop-hunt/shared';

/**
 * Service d'authentification côté client.
 *
 * Responsabilités :
 * - appeler les routes HTTP du serveur API (/api/auth/...)
 * - conserver le token JWT et l'utilisateur connecté dans localStorage
 * - exposer une session réactive pour l'interface (onAuthChange)
 */

const DEFAULT_API_ORIGIN = 'http://localhost:3000';
const AUTH_ROUTE_PREFIX = '/api/auth';
const TOKEN_STORAGE_KEY = 'propjv:auth:token';
const USER_STORAGE_KEY = 'propjv:auth:user';

export type AuthChangeReason = 'login' | 'logout' | 'session-refreshed' | 'session-expired';

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export type AuthChangeListener = (session: AuthSession | null, reason: AuthChangeReason) => void;

/** Erreur normalisée renvoyée par le service (message serveur + statut HTTP). */
export class AuthServiceError extends Error {
  readonly status: number;
  readonly details: unknown[];

  constructor(message: string, status = 0, details: unknown[] = []) {
    super(message);
    this.name = 'AuthServiceError';
    this.status = status;
    this.details = details;
  }
}

function resolveApiOrigin(): string {
  const configured = import.meta.env.VITE_API_URL;
  const origin = typeof configured === 'string' && configured.trim() ? configured.trim() : DEFAULT_API_ORIGIN;
  return origin.replace(/\/+$/, '');
}

export const API_ORIGIN = resolveApiOrigin();
export const AUTH_BASE_URL = `${API_ORIGIN}${AUTH_ROUTE_PREFIX}`;

// Session en mémoire : filet de sécurité si localStorage est indisponible
// (navigation privée, stockage plein, contexte sans window...).
let memorySession: AuthSession | null = null;
const listeners = new Set<AuthChangeListener>();

function getStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStorage(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // localStorage indisponible : la session reste en mémoire uniquement.
  }
}

function removeStorage(key: string): void {
  try {
    getStorage()?.removeItem(key);
  } catch {
    // Rien à faire : le stockage est déjà inaccessible.
  }
}

function decodeJwtPayload(token: string): { exp?: number } | null {
  const payload = token.split('.')[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const decoded = atob(padded);
    return JSON.parse(decoded) as { exp?: number };
  } catch {
    return null;
  }
}

/** Vérifie localement l'expiration du JWT (sans appel réseau). */
export function isTokenExpired(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return false;
  return payload.exp * 1000 <= Date.now();
}

function readStoredUser(): AuthUser | null {
  const raw = readStorage(USER_STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function persistUser(user: AuthUser): void {
  if (memorySession) {
    memorySession = { ...memorySession, user };
  }
  writeStorage(USER_STORAGE_KEY, JSON.stringify(user));
}

function clearStoredSession(): void {
  memorySession = null;
  removeStorage(TOKEN_STORAGE_KEY);
  removeStorage(USER_STORAGE_KEY);
}

function notify(reason: AuthChangeReason): void {
  const session = getSession();
  listeners.forEach((listener) => {
    try {
      listener(session, reason);
    } catch (error) {
      console.warn('Erreur dans un écouteur de session :', error);
    }
  });
}

/**
 * S'abonner aux changements de session (connexion, déconnexion, expiration).
 * Retourne la fonction de désabonnement.
 */
export function onAuthChange(listener: AuthChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Token JWT courant, ou null s'il est absent/expiré. */
export function getToken(): string | null {
  const token = readStorage(TOKEN_STORAGE_KEY) ?? memorySession?.token ?? null;
  if (!token) return null;

  if (isTokenExpired(token)) {
    clearStoredSession();
    return null;
  }

  return token;
}

/** Session courante (token + utilisateur) ou null si non connecté. */
export function getSession(): AuthSession | null {
  const token = getToken();
  if (!token) return null;

  const user = readStoredUser() ?? memorySession?.user ?? null;
  if (!user) return null;

  return { token, user };
}

export function getCurrentUser(): AuthUser | null {
  return getSession()?.user ?? null;
}

export function isAuthenticated(): boolean {
  return getSession() !== null;
}

/** En-tête Authorization prêt à l'emploi pour les futures routes protégées. */
export function getAuthorizationHeader(): string | null {
  const token = getToken();
  return token ? `Bearer ${token}` : null;
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${AUTH_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new AuthServiceError(
      'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.',
      0
    );
  }

  const data = await parseJson(response);

  if (!response.ok) {
    const message =
      typeof data?.message === 'string' ? data.message : `Erreur serveur (${response.status}).`;
    const details = Array.isArray(data?.errors) ? data.errors : [];
    throw new AuthServiceError(message, response.status, details);
  }

  if (data === null) {
    throw new AuthServiceError('Réponse vide du serveur.', response.status);
  }

  return data as T;
}

function saveSession(response: AuthResponsePayload): AuthSession {
  if (!response.token || !response.user) {
    throw new AuthServiceError("Réponse d'authentification incomplète.", 502);
  }

  const session: AuthSession = { token: response.token, user: response.user };
  memorySession = session;
  writeStorage(TOKEN_STORAGE_KEY, session.token);
  writeStorage(USER_STORAGE_KEY, JSON.stringify(session.user));

  return session;
}

/** Inscription d'un nouveau joueur puis ouverture de session. */
export async function register(payload: RegisterRequestPayload): Promise<AuthSession> {
  const response = await request<AuthResponsePayload>('/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const session = saveSession(response);
  notify('login');
  return session;
}

/** Connexion d'un joueur puis ouverture de session. */
export async function login(payload: LoginRequestPayload): Promise<AuthSession> {
  const response = await request<AuthResponsePayload>('/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const session = saveSession(response);
  notify('login');
  return session;
}

/**
 * Récupère le profil du joueur connecté depuis l'API (/auth/me).
 * Une session invalide (401) est nettoyée automatiquement.
 */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  if (!getToken()) return null;

  try {
    const response = await request<AuthResponsePayload>('/me', { method: 'GET' });
    if (!response.success || !response.user) return null;

    persistUser(response.user);
    notify('session-refreshed');
    return response.user;
  } catch (error) {
    if (error instanceof AuthServiceError && error.status === 401) {
      clearStoredSession();
      notify('session-expired');
      return null;
    }
    throw error;
  }
}

/** Déconnexion locale (le JWT côté serveur reste valide jusqu'à expiration). */
export function logout(): void {
  clearStoredSession();
  notify('logout');
}
