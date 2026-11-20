import { DEFAULT_HUNTER_EMOTES, PlayerRole, type HunterEmoteDefinition } from '@prop-hunt/shared';
import { networkManager } from '../../network/networkManager';
import { isImageReady, type HunterSpriteKey, type HunterSprites } from '../assets';
import type { GameState } from '../state';
import { HUNTER_RENDER_CONFIG, HUNTER_SPRITE_SPECS } from './hunterSpriteSpecs';

export const HUNTER_DRAW_SIZE = HUNTER_RENDER_CONFIG.drawSize;
export const HUNTER_BODY_WIDTH = HUNTER_RENDER_CONFIG.bodyWidth;
export const HUNTER_BODY_HEIGHT = HUNTER_RENDER_CONFIG.bodyHeight;

export interface ActiveHunterEmote {
  def: HunterEmoteDefinition;
  startedAt: number;
}

export interface HunterAnimState {
  currentKey: HunterSpriteKey;
  animStartedAt: number;
  lastDirX: number;
  lastDirY: number;
  lastHorizontal: 'left' | 'right';
  activeEmote?: ActiveHunterEmote;
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

  /** Joue une emote une seule fois (une boucle) sur le chasseur ciblé */
  public playEmote(playerId: string, emoteId: string, now = Date.now()): void {
    const def = DEFAULT_HUNTER_EMOTES.find(e => e.id === emoteId);
    if (!def) return;

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
    anim.activeEmote = { def, startedAt: now };
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
      // Un déplacement interrompt l'emote en cours pour revenir immédiatement à la marche
      anim.activeEmote = undefined;
      const { dirX, dirY } = quantizeDirection8(dx, dy);
      if (dirX !== 0 || dirY !== 0) {
        anim.lastDirX = dirX;
        anim.lastDirY = dirY;
        if (dirX < 0) anim.lastHorizontal = 'left';
        else if (dirX > 0) anim.lastHorizontal = 'right';
      }
      nextKey = DIRECTION_MOVE_KEYS[`${anim.lastDirX},${anim.lastDirY}`] ?? 'move_s';
    } else {
      // Expiration de l'emote après une seule boucle complète
      if (anim.activeEmote) {
        const fps = anim.activeEmote.def.fps ?? HUNTER_RENDER_CONFIG.defaultFps;
        const totalMs = anim.activeEmote.def.frameCount * (1000 / fps);
        if (now - anim.activeEmote.startedAt >= totalMs) {
          anim.activeEmote = undefined;
        }
      }
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

function drawGridFrame(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  frameIndex: number,
  cols: number,
  frameWidth: number,
  frameHeight: number,
  posX: number,
  posY: number,
  radius: number
): void {
  const col = frameIndex % cols;
  const row = Math.floor(frameIndex / cols);
  const scale = HUNTER_DRAW_SIZE / frameHeight;
  const drawW = frameWidth * scale;
  const drawH = frameHeight * scale;
  const drawX = posX - drawW / 2;
  const drawY = posY + radius - drawH + 1;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sheet, col * frameWidth, row * frameHeight, frameWidth, frameHeight, drawX, drawY, drawW, drawH);
  ctx.restore();
}

/**
 * Dessine la frame courante du sprite Chasseur (ou de son emote ponctuelle).
 * Retourne true si le sprite a été dessiné, false si l'image n'est pas encore prête.
 */
export function drawHunterSprite(
  ctx: CanvasRenderingContext2D,
  sprites: HunterSprites,
  anim: HunterAnimState,
  posX: number,
  posY: number,
  radius: number,
  now = Date.now(),
  emoteImages?: Map<string, HTMLImageElement>
): boolean {
  // 1. Emote en cours : une seule boucle, puis retour à l'idle
  if (anim.activeEmote && emoteImages) {
    const { def, startedAt } = anim.activeEmote;
    const emoteSheet = emoteImages.get(def.assetPath);
    const frameMs = 1000 / (def.fps ?? HUNTER_RENDER_CONFIG.defaultFps);
    const frameIndex = Math.floor(Math.max(0, now - startedAt) / frameMs);

    if (frameIndex >= def.frameCount) {
      anim.activeEmote = undefined;
    } else if (isImageReady(emoteSheet)) {
      drawGridFrame(ctx, emoteSheet, frameIndex, def.cols, def.frameWidth, def.frameHeight, posX, posY, radius);
      return true;
    }
  }

  // 2. Animation normale (Idle ou Marche 8 directions) d'après HUNTER_SPRITE_SPECS
  const spec = HUNTER_SPRITE_SPECS[anim.currentKey];
  const sheet = sprites[anim.currentKey];
  if (!isImageReady(sheet)) return false;

  const frameMs = 1000 / (spec.fps || HUNTER_RENDER_CONFIG.defaultFps);
  const frameIndex = Math.floor(Math.max(0, now - anim.animStartedAt) / frameMs) % spec.frameCount;
  drawGridFrame(ctx, sheet, frameIndex, spec.cols, spec.frameWidth, spec.frameHeight, posX, posY, radius);
  return true;
}
