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

const hunterGridSpec = (
  fileName: string,
  frameCount: number = 8,
  fps: number = HUNTER_RENDER_CONFIG.defaultFps
): HunterSpriteSpec => ({
  assetPath: `/assets/characters/Hunter/${fileName}`,
  cols: 3,
  rows: 3,
  frameWidth: 64,
  frameHeight: 64,
  frameCount,
  fps
});

/**
 * Table centrale des animations du Chasseur.
 * Modifier ici le frameCount, cols/rows, fps ou assetPath sans toucher au moteur d'animation.
 */
export const HUNTER_SPRITE_SPECS: Record<HunterSpriteKey, HunterSpriteSpec> = {
  idle_left: hunterGridSpec('IdleHuntLeft.png'),
  idle_right: hunterGridSpec('IdleHuntRight.png'),
  idle_north: hunterGridSpec('IdleHuntNord.png'),
  move_n: hunterGridSpec('MoveHuntNorth.png'),
  move_nw: hunterGridSpec('MoveHuntNorthLeft.png'),
  move_ne: hunterGridSpec('MoveHuntNorthRight.png'),
  move_s: hunterGridSpec('MoveHuntSouth.png'),
  move_sw: hunterGridSpec('MoveHuntSouthLeft.png'),
  move_se: hunterGridSpec('MoveHuntSouthRight.png'),
  move_w: hunterGridSpec('MoveHuntLeft.png', 7),
  move_e: hunterGridSpec('MoveHuntRight.png', 7)
};
