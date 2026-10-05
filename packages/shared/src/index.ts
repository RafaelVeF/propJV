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
    PLAYER_HIT = 'PLAYER_HIT'
}

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
    targety: number;
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