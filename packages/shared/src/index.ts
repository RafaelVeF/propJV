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
    PROP_WHISTLE = 'PROP_WHISTLE'
}

// Les roles existants dans le jeu
export enum PlayerRole {
  HUNTER = 'HUNTER',
  PROP = 'PROP',
  SPECTATOR = 'SPECTATOR'
}

export interface BasePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  health: number;
}

// Joueur Prop
export interface PropPlayer extends BasePlayer {
  role: PlayerRole.PROP;
  isLocked: boolean;
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
    x: number;
    y: number;
    vx : number;
    vy: number;
}

export interface TransformPropPayload {
    playerId: string;
    spriteKey: string; // Objet de la transformation
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