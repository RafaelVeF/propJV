import { WeaponType } from '@prop-hunt/shared';
import { isImageReady, type DroneImages } from '../assets';

/** Hauteur (px) d'origine serveur par rapport aux pieds du chasseur. Même valeur que WEAPON_HOLD_OFFSET_Y. */
export const HOLD_OFFSET_Y = 14;

/**
 * Dessine le drone accompagnant du chasseur et son module d'arme superposé
 * (sprites 32x32 alignés sur le centre, arme orientée à droite par défaut).
 */
export function drawHunterDrone(
  ctx: CanvasRenderingContext2D,
  droneImages: DroneImages,
  weaponImages: Map<WeaponType, HTMLImageElement>,
  dx: number,
  dy: number,
  baseY: number,
  angle: number,
  weapon: WeaponType,
  ready: boolean,
  recoil: number
): void {
  ctx.save();

  // 1. Ombre portée au sol sous le drone
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(dx, baseY + 18, 9, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Corps du drone (prêt vs en rechargement/cooldown)
  ctx.translate(dx, dy);
  ctx.imageSmoothingEnabled = false;
  const droneImg = ready ? droneImages.ready : droneImages.reloading;
  if (isImageReady(droneImg)) {
    ctx.drawImage(droneImg, -16, -16, 32, 32);
  } else {
    ctx.fillStyle = ready ? '#f97316' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Arme branchée au centre du drone, tournée vers le curseur
  ctx.rotate(angle);
  if (Math.abs(angle) > Math.PI / 2) {
    ctx.scale(1, -1);
  }
  if (recoil > 0) {
    ctx.translate(-recoil, 0);
  }

  const weaponImg = weaponImages.get(weapon);
  if (isImageReady(weaponImg)) {
    ctx.drawImage(weaponImg, -16, -16, 32, 32);
  }

  ctx.restore();
}
