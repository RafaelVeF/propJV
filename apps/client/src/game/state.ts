import {
  DEFAULT_PROPS,
  GamePhase,
  PlayerRole,
  type PropDefinition
} from '@prop-hunt/shared';

/** Rayon de vision visible autour du joueur (détermine le zoom de la caméra) */
export const VISION_RADIUS = 200;

/** Joueur local : position affichée (x, y) interpolée vers la position officielle du serveur (targetX, targetY) */
export interface LocalPlayerState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  health: number;
  maxHealth: number;
  lastHitTimestamp: number;
  currentProp: PropDefinition;
  variantIndex: number;
  speed: number;
}

export interface RemotePlayerState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  health: number;
  maxHealth: number;
  lastHitTimestamp?: number;
  name?: string;
  currentProp?: PropDefinition;
  variantIndex?: number;
  role?: PlayerRole;
}

export interface SpectatorState {
  active: boolean;
  targetId: string | null;
  freeCam: boolean;
  zoom: number;
}

/**
 * État partagé de l'écran de jeu, lu et modifié par les différents modules
 * (réseau, entrées, rendu, combat, spectateur...).
 */
export interface GameState {
  player: LocalPlayerState;
  otherPlayers: Map<string, RemotePlayerState>;
  localPlayerRole: PlayerRole;
  currentPhase: GamePhase;
  /** Affichage des hitbox de debug (touche H) */
  showHitbox: boolean;
  spectator: SpectatorState;
  /** Point regardé par la caméra (coordonnées monde) */
  camera: { x: number; y: number };
  /** Transformation caméra du dernier rendu, pour convertir l'écran en coordonnées monde */
  view: { camX: number; camY: number; zoom: number };
  /** Souris en coordonnées écran (canvas) */
  mouse: { x: number; y: number; inside: boolean };
  /** Touches actuellement enfoncées (en minuscules) */
  keys: Record<string, boolean>;
  /** Intensité de la secousse d'écran (explosions proches) */
  screenShake: number;
}

export function createGameState(): GameState {
  const player: LocalPlayerState = {
    x: 250,
    y: 250,
    targetX: 250,
    targetY: 250,
    health: 100,
    maxHealth: 100,
    lastHitTimestamp: 0,
    currentProp: DEFAULT_PROPS[0],
    variantIndex: 0, // Index de l'orientation/variante actuelle du prop
    speed: 5
  };

  return {
    player,
    otherPlayers: new Map(),
    localPlayerRole: PlayerRole.PROP,
    currentPhase: GamePhase.LOBBY,
    showHitbox: true,
    spectator: { active: false, targetId: null, freeCam: false, zoom: 1 },
    camera: { x: player.x, y: player.y },
    view: { camX: 0, camY: 0, zoom: 1 },
    mouse: { x: 0, y: 0, inside: false },
    keys: {},
    screenShake: 0
  };
}

/** Convertit des coordonnées écran (canvas) en coordonnées monde, selon la caméra du dernier rendu */
export function screenToWorld(state: GameState, canvas: HTMLCanvasElement, sx: number, sy: number) {
  return {
    x: state.view.camX + (sx - canvas.width / 2) / state.view.zoom,
    y: state.view.camY + (sy - canvas.height / 2) / state.view.zoom
  };
}

/** Position et apparence d'un joueur (local ou distant) à partir de son ID */
export function getPlayerRenderInfo(state: GameState, id: string, localPlayerId: string | null) {
  if (id === localPlayerId) {
    const p = state.player;
    return { x: p.x, y: p.y, prop: p.currentProp, variantIndex: p.variantIndex };
  }
  const op = state.otherPlayers.get(id);
  return op ? { x: op.x, y: op.y, prop: op.currentProp, variantIndex: op.variantIndex ?? 0 } : null;
}

/** IDs des autres joueurs encore en vie (pour le mode spectateur) */
export function getAlivePlayerIds(state: GameState): string[] {
  const ids: string[] = [];
  state.otherPlayers.forEach((op, id) => {
    if (op.role !== PlayerRole.SPECTATOR && op.health > 0) ids.push(id);
  });
  return ids;
}

/** Le joueur local est un chasseur vivant (il a donc ses armes en main) */
export function isLocalHunterArmed(state: GameState): boolean {
  return state.localPlayerRole === PlayerRole.HUNTER && !state.spectator.active && state.player.health > 0;
}
