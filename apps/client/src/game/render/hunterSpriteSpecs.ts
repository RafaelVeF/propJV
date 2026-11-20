import type { HunterSpriteKey } from '../assets';

/**
 * Spécification déclarative d'une sprite sheet d'animation (grille, taille de cellule, nombre de frames, FPS).
 */
export interface HunterSpriteSpec {
  assetPath: string;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
}

export const HUNTER_RENDER_CONFIG = {
  /** Taille d'affichage à l'écran (px monde) pour une cellule de hauteur 64 px */
  drawSize: 54,
  /** Dimensions de la boîte logique (barre de vie / cadre debug) */
  bodyWidth: 28,
  bodyHeight: 48,
  /** Cadence par défaut si non surchargée */
  defaultFps: 8
} as const;

/**
 * Table centrale des animations du Chasseur.
 * Modifier ici le frameCount, cols/rows, fps ou assetPath sans toucher au moteur d'animation.
 */
export const HUNTER_SPRITE_SPECS: Record<HunterSpriteKey, HunterSpriteSpec> = {
  idle_left: {
    assetPath: '/assets/characters/Hunter/IdleHuntLeft.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  idle_right: {
    assetPath: '/assets/characters/Hunter/IdleHuntRight.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  idle_north: {
    assetPath: '/assets/characters/Hunter/IdleHuntNord.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  move_n: {
    assetPath: '/assets/characters/Hunter/MoveHuntNorth.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  move_nw: {
    assetPath: '/assets/characters/Hunter/MoveHuntNorthLeft.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  move_ne: {
    assetPath: '/assets/characters/Hunter/MoveHuntNorthRight.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  move_s: {
    assetPath: '/assets/characters/Hunter/MoveHuntSouth.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  move_sw: {
    assetPath: '/assets/characters/Hunter/MoveHuntSouthLeft.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  move_se: {
    assetPath: '/assets/characters/Hunter/MoveHuntSouthRight.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 8,
    fps: 8
  },
  move_w: {
    assetPath: '/assets/characters/Hunter/MoveHuntLeft.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 7,
    fps: 8
  },
  move_e: {
    assetPath: '/assets/characters/Hunter/MoveHuntRight.png',
    cols: 3,
    rows: 3,
    frameWidth: 64,
    frameHeight: 64,
    frameCount: 7,
    fps: 8
  }
};
