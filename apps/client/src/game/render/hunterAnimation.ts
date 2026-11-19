import { PlayerRole } from '@prop-hunt/shared';
import { networkManager } from '../../network/networkManager';
import { isImageReady, type HunterSpriteKey, type HunterSprites } from '../assets';
import type { GameState } from '../state';

export const HUNTER_FRAME_SIZE = 64;
export const HUNTER_SHEET_COLS = 3;
export const HUNTER_FRAME_COUNT = 8;
export const HUNTER_FPS = 8;
export const HUNTER_FRAME_DURATION_MS = 1000 / HUNTER_FPS; // 125 ms (~8 fps)

export const HUNTER_DRAW_SIZE = 54;
export const HUNTER_BODY_WIDTH = 28;
export const HUNTER_BODY_HEIGHT = 48;

export interface HunterAnimState {
  currentKey: HunterSpriteKey;
  animStartedAt: number;
  lastDirX: number;
  lastDirY: number;
  lastHorizontal: 'left' | 'right';
}

const DIRECTION_MOVE_KEYS: Record<string, HunterSpriteKey> = {
  '0,-1': 'move_n',
  '-1,-1': 'move_nw',
  '1,-1': 'move_ne',
  '0,1': 'move_s',
  '-1,1': 'move_sw',
  '1,1': 'move_se',
  '-1,0': 'move_w',
  '1,0': 'move_e'
};

/**
 * Quantifie un vecteur (dx, dy) vers l'une des 8 directions cardinales / diagonales (-1 | 0 | 1).
 * Seuil cos(3π/8) ≈ 0.3827 pour répartir équitablement les 8 secteurs de 45°.
 */
function quantizeDirection8(dx: number, dy: number): { dirX: number; dirY: number } {
  const len = Math.hypot(dx, dy);
  if (len <= 1e-6) return { dirX: 0, dirY: 0 };
  const nx = dx / len;
  const ny = dy / len;
  return {
    dirX: Math.abs(nx) > 0.3827 ? Math.sign(nx) : 0,
    dirY: Math.abs(ny) > 0.3827 ? Math.sign(ny) : 0
  };
}

/**
 * Gère la direction, le passage repos/marche et l'horloge 8 FPS des sprites Chasseur.
 */
export class HunterAnimator {
  private readonly states = new Map<string, HunterAnimState>();

  public get(playerId: string): HunterAnimState | undefined {
    return this.states.get(playerId);
  }

  public sync(
    state: GameState,
    localVx: number,
    localVy: number,
    remoteVelocities: Map<string, { dx: number; dy: number }>,
    now = Date.now()
  ): void {
    const activeHunters = new Set<string>();

    if (
      state.localPlayerRole === PlayerRole.HUNTER &&
      !state.spectator.active &&
      state.player.health > 0 &&
      networkManager.localPlayerId
    ) {
      activeHunters.add(networkManager.localPlayerId);
      const isMoving = localVx !== 0 || localVy !== 0;
      this.updateOne(networkManager.localPlayerId, isMoving, localVx, localVy, now);
    }

    state.otherPlayers.forEach((op, id) => {
      if (op.role === PlayerRole.HUNTER && op.health > 0) {
        activeHunters.add(id);
        const vel = remoteVelocities.get(id);
        const dx = vel?.dx ?? 0;
        const dy = vel?.dy ?? 0;
        const isMoving = Math.hypot(dx, dy) > 0.35;
        this.updateOne(id, isMoving, dx, dy, now);
      }
    });

    this.states.forEach((_, id) => {
      if (!activeHunters.has(id)) this.states.delete(id);
    });
  }

  private updateOne(playerId: string, isMoving: boolean, dx: number, dy: number, now: number): void {
    let anim = this.states.get(playerId);
    if (!anim) {
      anim = {
        currentKey: 'idle_left',
        animStartedAt: now,
        lastDirX: -1,
        lastDirY: 1,
        lastHorizontal: 'left'
      };
      this.states.set(playerId, anim);
    }

    let nextKey: HunterSpriteKey;

    if (isMoving) {
      const { dirX, dirY } = quantizeDirection8(dx, dy);
      if (dirX !== 0 || dirY !== 0) {
        anim.lastDirX = dirX;
        anim.lastDirY = dirY;
        if (dirX < 0) anim.lastHorizontal = 'left';
        else if (dirX > 0) anim.lastHorizontal = 'right';
      }
      nextKey = DIRECTION_MOVE_KEYS[`${anim.lastDirX},${anim.lastDirY}`] ?? 'move_s';
    } else {
      // Au repos : dos si le dernier déplacement était montant (NW, N, NE), sinon face gauche/droite
      if (anim.lastDirY < 0) {
        nextKey = 'idle_north';
      } else if (anim.lastDirX > 0) {
        nextKey = 'idle_right';
      } else if (anim.lastDirX < 0) {
        nextKey = 'idle_left';
      } else {
        nextKey = anim.lastHorizontal === 'right' ? 'idle_right' : 'idle_left';
      }
    }

    if (nextKey !== anim.currentKey) {
      anim.currentKey = nextKey;
      anim.animStartedAt = now;
    }
  }
}

/**
 * Dessine la frame courante (grille 3x3 de 64x64, 8 frames à 8 FPS) du sprite Chasseur.
 * Retourne true si le sprite a été dessiné, false si l'image n'est pas encore prête.
 */
export function drawHunterSprite(
  ctx: CanvasRenderingContext2D,
  sprites: HunterSprites,
  anim: HunterAnimState,
  posX: number,
  posY: number,
  radius: number,
  now = Date.now()
): boolean {
  const sheet = sprites[anim.currentKey];
  if (!isImageReady(sheet)) return false;

  const elapsed = Math.max(0, now - anim.animStartedAt);
  const frameIndex = Math.floor(elapsed / HUNTER_FRAME_DURATION_MS) % HUNTER_FRAME_COUNT;
  const col = frameIndex % HUNTER_SHEET_COLS;
  const row = Math.floor(frameIndex / HUNTER_SHEET_COLS);

  const sx = col * HUNTER_FRAME_SIZE;
  const sy = row * HUNTER_FRAME_SIZE;
  const drawX = posX - HUNTER_DRAW_SIZE / 2;
  const drawY = posY + radius - HUNTER_DRAW_SIZE + 1;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sheet,
    sx,
    sy,
    HUNTER_FRAME_SIZE,
    HUNTER_FRAME_SIZE,
    drawX,
    drawY,
    HUNTER_DRAW_SIZE,
    HUNTER_DRAW_SIZE
  );
  ctx.restore();
  return true;
}
