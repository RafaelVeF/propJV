import { GamePhase, WeaponType } from '@prop-hunt/shared';
import { isLocalHunterArmed, type GameState } from '../state';
import type { CombatEffects } from './combatEffects';
import type { WeaponController } from './weaponController';

/** Réticule à la souris (coordonnées écran), avec progression du rechargement et hit marker */
export function drawCrosshair(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  weapons: WeaponController,
  effects: CombatEffects
): void {
  const { mouse, currentPhase } = state;
  if (!isLocalHunterArmed(state) || !mouse.inside) return;
  if (currentPhase !== GamePhase.HUNTING && currentPhase !== GamePhase.HIDING) return;

  const now = Date.now();
  const ready = currentPhase === GamePhase.HUNTING && weapons.isReady(weapons.selectedWeapon, now);
  const color = ready ? '#ffffff' : 'rgba(148, 163, 184, 0.7)';
  const { x, y } = mouse;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y);
  ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y);
  ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 4);
  ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 12);
  ctx.stroke();

  // Rechargement : cercle de progression autour du réticule
  const reloadProgress = weapons.getReloadProgress(now);
  if (weapons.selectedWeapon === WeaponType.PISTOL && reloadProgress !== null) {
    ctx.strokeStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + reloadProgress * Math.PI * 2);
    ctx.stroke();
  }

  // Hit marker : petite croix rouge en X quand le serveur confirme une touche
  if (now - effects.hitMarkerAt < 200) {
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 9); ctx.lineTo(x - 4, y - 4);
    ctx.moveTo(x + 9, y - 9); ctx.lineTo(x + 4, y - 4);
    ctx.moveTo(x - 9, y + 9); ctx.lineTo(x - 4, y + 4);
    ctx.moveTo(x + 9, y + 9); ctx.lineTo(x + 4, y + 4);
    ctx.stroke();
  }
  ctx.restore();
}
