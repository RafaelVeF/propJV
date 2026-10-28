export const GAME_NAME = "PropJV - Games";

export enum MessageType {
    // Les Etats
    WELCOME = 'WELCOME',
    PLAYER_JOINED = 'PLAYER_JOINED',
    PLAYER_LEFT = 'PLAYER_LEFT',

    // Actions de jeu
    PLAYER_MOVE = 'PLAYER_MOVE',
    TRANSFORM_PROP = 'TRANSFORM_PROP',
    HUNTER_SHOOT = 'HUNTER_SHOOT',
    PLAYER_HIT = 'PLAYER_HIT',
    PROP_LOCK = 'PROP_LOCK',
    PROP_WHISTLE = 'PROP_WHISTLE',

    // Etat Générale
    GAME_START = 'GAME_START',
    ROUND_START = 'ROUND_START',
    ROUND_END = 'ROUND_END',
    GAME_END = 'GAME_END',
    GAME_STATE_UPDATE = 'GAME_STATE_UPDATE'
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

export interface PropDefinition {
  id: number;
  internalName: string;
  displayName: string;
  health: number;
  assetPath: string;
  width: number;
  height: number;
  hitboxRadius: number;
}

export const DEFAULT_PROPS: PropDefinition[] = [
  {
    id: 1,
    internalName: 'prop_human',
    displayName: 'Humain',
    health: 100,
    assetPath: '',
    width: 24,
    height: 48,
    hitboxRadius: 12
  },
  {
    id: 2,
    internalName: 'prop_wall_painting',
    displayName: 'Tableau Mural',
    health: 50,
    assetPath: '/assets/props/Tableau_Mur.png',
    width: 32,
    height: 32,
    hitboxRadius: 10
  },
  {
    id: 3,
    internalName: 'prop_wall_painting_test',
    displayName: 'Tableau Mural Test',
    health: 30,
    assetPath: '/assets/props/Tableau_Mur_test.png',
    width: 32,
    height: 32,
    hitboxRadius: 10
  }
];

// Joueur Prop
export interface PropPlayer extends BasePlayer {
  role: PlayerRole.PROP;
  isLocked: boolean;
  currentProp?: PropDefinition;
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

// Les Payload pour chaque actions (les principaux)

export interface PlayerMovePayload {
    playerId: string;
    vx : number;
    vy: number;
    x?: number;
    y?: number;
}

export interface TransformPropPayload {
    playerId: string;
    propId?: number;
    spriteKey?: string; // Objet de la transformation
}

export interface HunterShootPayload {
    hunterId: string;
    targetX: number;
    targetY: number;
}

export interface PlayerHitPayload {
    targetPlayerId: string;
    damage: number;
    isKilled: boolean;
}

// Enveloppe globale du paquet réseau
export interface NetworkMessage<T = any> {
    type: MessageType;
    payload: T;
    timestamp?: number;
  }

//Action de Props
export interface PropLockPayload {
  playerId: string;
  isLocked: boolean;
}

export interface PropWhistlePayload {
  playerId: string;
  soundKey?: string;
}

// Démarage d'une partie
export interface GameStartPayload {
    mapId: string;
}

// Gestion des colisions
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