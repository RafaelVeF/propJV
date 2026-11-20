export const GAME_NAME = "PropJV - Games";

export enum MessageType {
  // Les États
  WELCOME = 'WELCOME',
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',

  // Salon et préparation
  CREATE_ROOM = 'CREATE_ROOM',
  JOIN_ROOM = 'JOIN_ROOM',
  LEAVE_ROOM = 'LEAVE_ROOM',
  LIST_ROOMS = 'LIST_ROOMS',
  ROOMS_LIST = 'ROOMS_LIST',
  ROOM_ERROR = 'ROOM_ERROR',
  KICK_PLAYER = 'KICK_PLAYER',
  KICKED = 'KICKED',
  LOBBY_STATE = 'LOBBY_STATE',
  PLAYER_TOGGLE_READY = 'PLAYER_TOGGLE_READY',
  START_COUNTDOWN = 'START_COUNTDOWN',
  ROUND_TIMER_TICK = 'ROUND_TIMER_TICK',

  // Actions de jeu
  PLAYER_MOVE = 'PLAYER_MOVE',
  TRANSFORM_PROP = 'TRANSFORM_PROP',
  HUNTER_SHOOT = 'HUNTER_SHOOT',
  HUNTER_RELOAD = 'HUNTER_RELOAD',
  WEAPON_STATE = 'WEAPON_STATE',
  GRENADE_EXPLODED = 'GRENADE_EXPLODED',
  PLAYER_HIT = 'PLAYER_HIT',
  PLAYER_DIED = 'PLAYER_DIED',
  PROP_LOCK = 'PROP_LOCK',
  PROP_WHISTLE = 'PROP_WHISTLE',
  HUNTER_EMOTE = 'HUNTER_EMOTE',
  CHAT_MESSAGE = 'CHAT_MESSAGE',
  HITBOX_TOGGLE = 'HITBOX_TOGGLE',

  // État général
  GAME_START = 'GAME_START',
  ROUND_START = 'ROUND_START',
  ROUND_END = 'ROUND_END',
  GAME_END = 'GAME_END',
  GAME_STATE_UPDATE = 'GAME_STATE_UPDATE'
}

 export enum GamePhase {
  LOBBY = 'LOBBY',
  COUNTDOWN = 'COUNTDOWN',
  HIDING = 'HIDING',
  HUNTING = 'HUNTING',
  ROUND_END = 'ROUND_END'
}

// Les roles existants dans le jeu
export enum PlayerRole {
  HUNTER = 'HUNTER',
  PROP = 'PROP',
  SPECTATOR = 'SPECTATOR'
}

// Configuration du gameplay et des mécaniques de survie
export interface GameplayConfig {
  /** Durée d'affichage des infos et de la barre de vie après un hit (en ms, ex: 5000 = 5s) */
  shows_infos_duration: number;
  /** Temps sans dégâts avant que la régénération ne commence (en ms, ex: 10000 = 10s) */
  regeneration_cooldown: number;
  /** Intervalle entre chaque tick de régénération (en ms, ex: 500 = 0.5s) */
  regeneration_interval: number;
  /** PVs régénérés à chaque intervalle */
  regeneration_amount: number;
}

export const GAMEPLAY_CONFIG: GameplayConfig = {
  shows_infos_duration: 5000,      // 5 secondes
  regeneration_cooldown: 10000,    // 10 secondes après le dernier hit
  regeneration_interval: 500,      // Toutes les 0.5 secondes
  regeneration_amount: 1           // +1 PV
};

export interface BasePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  health: number;
  maxHealth?: number;
  lastHitTimestamp?: number; // Timestamp du dernier hit reçu
}

export interface PropVariant {
  assetPath: string;
  width: number;
  height: number;
  orientationName?: string;
}

export interface PropDefinition {
  id: number;
  internalName: string;
  displayName: string;
  health: number;
  hitboxRadius: number;
  variants: PropVariant[];
  // Rétro-compatibilité / raccourcis vers la variante par défaut
  assetPath: string;
  width: number;
  height: number;
}

export const DEFAULT_PROPS: PropDefinition[] = [
  {
    id: 1,
    internalName: 'prop_human',
    displayName: 'Humain',
    health: 100,
    hitboxRadius: 15,
    variants: [
      { assetPath: '', width: 24, height: 48, orientationName: 'Face' }
    ],
    assetPath: '',
    width: 24,
    height: 48
  },
  {
    id: 2,
    internalName: 'prop_wall_painting',
    displayName: 'Tableau Mural',
    health: 50,
    hitboxRadius: 15,
    variants: [
      { assetPath: '/assets/props/board/Tableau_Mur.png', width: 32, height: 32, orientationName: 'Face' }
    ],
    assetPath: '/assets/props/board/Tableau_Mur.png',
    width: 32,
    height: 32
  },
  {
    id: 3,
    internalName: 'prop_chair',
    displayName: 'Chaise',
    health: 40,
    hitboxRadius: 15,
    variants: [
      { assetPath: '/assets/props/chair/Chair_F.png', width: 32, height: 64, orientationName: 'Face (Sud)' },
      { assetPath: '/assets/props/chair/Chair_R.png', width: 32, height: 64, orientationName: 'Droite (Est)' },
      { assetPath: '/assets/props/chair/Chair_B.png', width: 32, height: 64, orientationName: 'Dos (Nord)' },
      { assetPath: '/assets/props/chair/Chair_L.png', width: 32, height: 64, orientationName: 'Gauche (Ouest)' }
    ],
    assetPath: '/assets/props/chair/Chair_F.png',
    width: 32,
    height: 64
  },
  {
    id: 4,
    internalName: 'prop_desk',
    displayName: 'Bureau',
    health: 80,
    hitboxRadius: 15,
    variants: [
      { assetPath: '/assets/props/desk/Desk_F.png', width: 64, height: 32, orientationName: 'Face (Sud)' },
      { assetPath: '/assets/props/desk/Desk_R.png', width: 32, height: 64, orientationName: 'Droite (Est)' }
    ],
    assetPath: '/assets/props/desk/Desk_F.png',
    width: 64,
    height: 32
  },
  {
    id: 5,
    internalName: 'prop_bag',
    displayName: 'Sac à dos',
    health: 45,
    hitboxRadius: 14,
    variants: [
      { assetPath: '/assets/props/bag/Bag_F.png', width: 32, height: 32, orientationName: 'Face (Sud)' },
      { assetPath: '/assets/props/bag/Bag_B.png', width: 32, height: 32, orientationName: 'Dos (Nord)' }
    ],
    assetPath: '/assets/props/bag/Bag_F.png',
    width: 32,
    height: 32
  },
  {
    id: 6,
    internalName: 'prop_can',
    displayName: 'Canette',
    health: 20,
    hitboxRadius: 10,
    variants: [
      { assetPath: '/assets/props/can/Can_F.png', width: 32, height: 32, orientationName: 'Face (Sud)' },
      { assetPath: '/assets/props/can/Can_B.png', width: 32, height: 32, orientationName: 'Dos (Nord)' }
    ],
    assetPath: '/assets/props/can/Can_F.png',
    width: 32,
    height: 32
  },
  {
    id: 7,
    internalName: 'prop_vending_machine',
    displayName: 'Distributeur',
    health: 150,
    hitboxRadius: 22,
    variants: [
      { assetPath: '/assets/props/vending_machine/Vending_machine_F.png', width: 48, height: 64, orientationName: 'Face (Sud)' }
    ],
    assetPath: '/assets/props/vending_machine/Vending_machine_F.png',
    width: 48,
    height: 64
  }
];

// Joueur Prop
export interface PropPlayer extends BasePlayer {
  role: PlayerRole.PROP;
  isLocked: boolean;
  currentProp?: PropDefinition;
  variantIndex?: number;
  currentSpriteKey?: string;
}

// Joueur Hunter
export interface HunterPlayer extends BasePlayer {
  role: PlayerRole.HUNTER;
  ammo?: number;
}

// Joueur Spectateur
export interface SpectatorPlayer extends BasePlayer {
  role: PlayerRole.SPECTATOR;
}

export type Player = PropPlayer | HunterPlayer | SpectatorPlayer;

// Les Payloads pour chaque action (les principaux)

export interface PlayerMovePayload {
  playerId: string;
  vx: number;
  vy: number;
  x?: number;
  y?: number;
}

export interface TransformPropPayload {
  playerId: string;
  propId?: number;
  variantIndex?: number;
  spriteKey?: string; // Objet de la transformation
  currentProp?: PropDefinition;
}

// =========================================================================
// COMBAT : armes des chasseurs
// Les valeurs sont partagées pour que le client affiche les mêmes portées / délais,
// mais seul le serveur les applique (serveur autoritaire).
// =========================================================================

export enum WeaponType {
  PISTOL = 'PISTOL',
  CROWBAR = 'CROWBAR',
  GRENADE = 'GRENADE'
}

export interface WeaponDefinition {
  type: WeaponType;
  displayName: string;
  /** Touche de sélection rapide (1, 2, 3) */
  slot: number;
  /** Dégâts infligés (pour la grenade : dégâts au centre de l'explosion) */
  damage: number;
  /** Portée max en px (pistolet : distance du tir, pied de biche : allonge, grenade : distance de lancer) */
  range: number;
  /** Délai minimum entre deux utilisations (ms) */
  cooldownMs: number;
  /** Taille du chargeur (armes à munitions uniquement) */
  magazineSize?: number;
  /** Durée de rechargement (ms) */
  reloadMs?: number;
  /** Angle d'attaque total en degrés (corps à corps) */
  arcDegrees?: number;
  /** Rayon de l'explosion (grenade) */
  blastRadius?: number;
  /** Délai avant explosion après le lancer (grenade, ms) */
  fuseMs?: number;
  /** Part des dégâts conservée au bord de l'explosion (0.35 = 35 %) */
  edgeDamageRatio?: number;
  iconPath?: string;
}

export const WEAPONS: Record<WeaponType, WeaponDefinition> = {
  [WeaponType.PISTOL]: {
    type: WeaponType.PISTOL,
    displayName: 'Fusil',
    slot: 1,
    damage: 20,
    range: 400,
    cooldownMs: 350,
    magazineSize: 6,
    reloadMs: 1800,
    iconPath: '/assets/weapons/rifle.png'
  },
  [WeaponType.CROWBAR]: {
    type: WeaponType.CROWBAR,
    displayName: 'Canon à ondes',
    slot: 2,
    damage: 40,
    range: 80,
    cooldownMs: 700,
    arcDegrees: 100,
    iconPath: '/assets/weapons/wave_gun.png'
  },
  [WeaponType.GRENADE]: {
    type: WeaponType.GRENADE,
    displayName: 'Lanceur',
    slot: 3,
    damage: 70,
    range: 260,
    cooldownMs: 25000,
    blastRadius: 80,
    fuseMs: 1200,
    edgeDamageRatio: 0.35,
    iconPath: '/assets/weapons/launcher.png'
  }
};

export const WEAPON_ORDER: WeaponType[] = [WeaponType.PISTOL, WeaponType.CROWBAR, WeaponType.GRENADE];

/** Client -> Serveur : intention de tir. Le serveur calcule lui-même qui est touché. */
export interface HunterShootPayload {
  weapon: WeaponType;
  /** Point visé (coordonnées monde) */
  targetX: number;
  targetY: number;
  /** Ignoré par le serveur (l'ID vient de la connexion), conservé pour compatibilité */
  hunterId?: string;
}

/** Serveur -> Clients : résultat d'une attaque, pour les effets visuels */
export interface ShotFiredPayload {
  hunterId: string;
  weapon: WeaponType;
  originX: number;
  originY: number;
  /** Point d'impact (pistolet), point frappé (pied de biche) ou point d'atterrissage (grenade) */
  impactX: number;
  impactY: number;
  hitPlayerIds: string[];
  /** Grenade : délai avant explosion (ms) */
  fuseMs?: number;
  grenadeId?: string;
}

export interface GrenadeExplodedPayload {
  grenadeId: string;
  hunterId: string;
  x: number;
  y: number;
  radius: number;
  hitPlayerIds: string[];
}

/** Client -> Serveur : demande de rechargement du pistolet */
export interface HunterReloadPayload {
  weapon?: WeaponType;
}

export interface WeaponSlotState {
  weapon: WeaponType;
  ammo?: number;
  magazineSize?: number;
  /** Temps restant avant de pouvoir réutiliser l'arme (ms, relatif pour éviter les écarts d'horloge) */
  cooldownRemainingMs: number;
  /** Temps restant de rechargement (ms), 0 si pas en rechargement */
  reloadRemainingMs: number;
}

/** Serveur -> chasseur concerné : état officiel de son arsenal */
export interface WeaponStatePayload {
  weapons: WeaponSlotState[];
}

export interface PlayerHitPayload {
  targetPlayerId: string;
  damage: number;
  isKilled: boolean;
  attackerId?: string;
  weapon?: WeaponType;
  health?: number;
  maxHealth?: number;
  lastHitTimestamp?: number;
}

/** Mort d'un joueur : il passe en rôle SPECTATOR jusqu'à la fin de la manche */
export interface PlayerDiedPayload {
  playerId: string;
  playerName: string;
  killerId?: string;
  killerName?: string;
  weapon?: WeaponType;
  x: number;
  y: number;
  /** Prop sous lequel le joueur était caché au moment de sa mort */
  propDisplayName?: string;
}

/**
 * Zone touchable d'un joueur : le rectangle de son sprite (ce que le chasseur voit et vise),
 * et non le petit cercle de collision au sol.
 */
export function getPlayerHurtbox(x: number, y: number, prop: PropDefinition | undefined, variantIndex: number = 0): Rectangle {
  const def = prop ?? DEFAULT_PROPS[0];
  const variant = def.variants?.[variantIndex] ?? def.variants?.[0];
  const width = variant?.width || def.width || 32;
  const height = variant?.height || def.height || 32;
  const radius = def.hitboxRadius || 10;
  return { x: x - width / 2, y: y + radius - height, width, height };
}

/** Un joueur est vivant s'il n'est pas spectateur et qu'il lui reste des PV. */
export function isAlive(player: { health: number; role: PlayerRole }): boolean {
  return player.role !== PlayerRole.SPECTATOR && player.health > 0;
}

/**
 * Retourne l'ID du prochain joueur à suivre en mode spectateur.
 * direction = 1 : suivant, -1 : précédent (boucle). Retourne null s'il n'y a personne à suivre.
 */
export function getNextSpectateTarget(
  candidateIds: string[],
  currentTargetId: string | null,
  direction: 1 | -1 = 1
): string | null {
  if (candidateIds.length === 0) return null;
  const ids = [...candidateIds].sort((a, b) => a.localeCompare(b));
  const currentIndex = currentTargetId ? ids.indexOf(currentTargetId) : -1;
  if (currentIndex === -1) return ids[0];
  return ids[(currentIndex + direction + ids.length) % ids.length];
}

// Enveloppe globale du paquet réseau
export interface NetworkMessage<T = any> {
  type: MessageType;
  payload: T;
  timestamp?: number;
}

// Actions de Props
export interface PropLockPayload {
  playerId: string;
  isLocked: boolean;
}

export interface PropWhistlePayload {
  playerId: string;
  soundKey?: string;
}

// Démarrage d'une partie
export interface GameStartPayload {
  mapId: string;
}

// --- Payloads du Salon et du Cycle de Round ---

export interface LobbyPlayerInfo {
  id: string;
  name: string;
  isReady: boolean;
  isHost: boolean;
}

export interface CreateRoomPayload {
  playerName?: string;
  isFreeplay?: boolean;
}

export interface JoinRoomPayload {
  roomKey: string;
  playerName?: string;
}

export interface RoomErrorPayload {
  message: string;
}

export interface PublicRoomInfo {
  roomKey: string;
  hostName: string;
  map: string;
  status: 'WAITING' | 'IN_GAME';
  playersCount: number;
  maxPlayers: number;
}

export interface RoomsListPayload {
  rooms: PublicRoomInfo[];
}

export interface KickPlayerPayload {
  targetPlayerId: string;
}

export interface KickedPayload {
  reason: string;
}

export interface LobbyStatePayload {
  roomKey?: string;
  players: LobbyPlayerInfo[];
  canStart?: boolean;
}

export interface PlayerToggleReadyPayload {
  playerId: string;
  isReady: boolean;
}

export interface StartCountdownPayload {
  countdownSeconds: number;
}

export interface RoundStartPayload {
  roundNumber: number;
  role: PlayerRole;
  hidingDuration: number;
  roundDuration: number;
  mapId: string;
}

export interface RoundTimerTickPayload {
  phase: GamePhase;
  timeRemaining: number;
}

export interface RoundScoreItem {
  playerId: string;
  name: string;
  score: number;
  kills?: number;
  survived?: boolean;
}

export interface RoundEndPayload {
  winner: PlayerRole.HUNTER | PlayerRole.PROP;
  reason: 'ALL_PROPS_ELIMINATED' | 'TIME_EXPIRED';
  scores: RoundScoreItem[];
}

// Gestion des collisions
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

// Authentification & Profil Joueur

export interface AuthUser {
  userId: number;
  username: string;
  email: string;
  currencyBalance?: number;
  adminFlag?: boolean;
  creationDate?: string | Date;
  stats?: {
    totalScore: number;
    hiderWins: number;
    seekerWins: number;
    matchesPlayed: number;
  };
}

export interface RegisterRequestPayload {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequestPayload {
  username: string;
  password: string;
}

export interface AuthResponsePayload {
  success: boolean;
  message: string;
  token?: string;
  userId?: number;
  user?: AuthUser;
  errors?: unknown[];
}

export * from './chat.js';

// =========================================================================
// AMIS & RELATIONS SOCIALES
// =========================================================================

export type FriendRelationshipStatus = 'PENDING' | 'ACCEPTED' | 'BLOCKED';

export interface FriendEntry {
  relationshipId: number;
  userId: number;
  username: string;
  lastConnection?: string | Date | null;
  since?: string | Date;
}

export interface FriendRequestEntry {
  relationshipId: number;
  userId: number;
  username: string;
  direction: 'INCOMING' | 'OUTGOING';
  createdAt?: string | Date;
}

export interface FriendsOverviewResponse {
  success: boolean;
  friends: FriendEntry[];
  incomingRequests: FriendRequestEntry[];
  outgoingRequests: FriendRequestEntry[];
  blockedUsers?: FriendEntry[];
  message?: string;
}

export interface SendFriendRequestPayload {
  username: string;
}

export interface FriendActionResponse {
  success: boolean;
  message: string;
  relationshipId?: number;
  status?: FriendRelationshipStatus;
  errors?: unknown[];
}

// =========================================================================
// EMOTES DES CHASSEURS
// =========================================================================

export interface HunterEmoteDefinition {
  id: string;
  name: string;
  assetPath: string;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  previewFrame: number;
  fps?: number;
}

const createEmote = (
  id: string,
  name: string,
  fileName: string,
  frameCount: number,
  previewFrame: number,
  opts: { cols?: number; rows?: number; frameWidth?: number; fps?: number } = {}
): HunterEmoteDefinition => ({
  id,
  name,
  assetPath: `/assets/emotes/${fileName}`,
  cols: opts.cols ?? 3,
  rows: opts.rows ?? 3,
  frameWidth: opts.frameWidth ?? 64,
  frameHeight: 64,
  frameCount,
  previewFrame,
  fps: opts.fps ?? 10
});

export const DEFAULT_HUNTER_EMOTES: HunterEmoteDefinition[] = [
  createEmote('amazed', 'Étonné', 'EmoteAmazed.png', 7, 4, { fps: 8 }),
  createEmote('dance', 'Danse', 'EmoteDance.png', 15, 10, { cols: 4, rows: 4 }),
  createEmote('love', 'Amour', 'EmoteLove.png', 15, 14, { cols: 3, rows: 5, frameWidth: 84 }),
  createEmote('aura', 'Aura', 'EmoteAura.png', 13, 5, { cols: 3, rows: 5, frameWidth: 92 }),
  createEmote('devil', 'Démon', 'EmoteDevil.png', 15, 11, { cols: 4, rows: 4 }),
  createEmote('ez', 'EZ', 'EmoteEZ.png', 7, 3, { fps: 8 })
];

export interface HunterEmotePayload {
  playerId: string;
  emoteId: string;
}

// =========================================================================
// SUCCÈS (ACHIEVEMENTS)
// =========================================================================

export type AchievementCategory = 'all' | 'general' | 'hunter' | 'prop' | 'fun';

export interface AchievementItem {
  id: number;
  internalName: string;
  displayName: string;
  description: string;
  reward: number;
  targetValue: number;
  progress: number;
  progressPercent: number;
  isUnlocked: boolean;
  unlockedAt: string | null;
  isClaimed: boolean;
  category: AchievementCategory;
  icon: string;
}

export interface AchievementsOverviewResponse {
  success: boolean;
  achievements: AchievementItem[];
  unclaimedCount: number;
  totalUnlocked: number;
  totalAchievements: number;
  userCurrencyBalance?: number;
}

export interface ClaimAchievementResponse {
  success: boolean;
  message?: string;
  achievementId: number;
  rewardClaimed: number;
  newCurrencyBalance: number;
}
