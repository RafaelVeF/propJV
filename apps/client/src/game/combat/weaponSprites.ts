import { WeaponType } from '@prop-hunt/shared';
import { isImageReady } from '../assets';

/** Hauteur (px) de l'arme par rapport aux pieds du chasseur. Même valeur que WEAPON_HOLD_OFFSET_Y côté serveur. */
export const HOLD_OFFSET_Y = 14;

/**
 * Calibrage des sprites d'armes (16x16) : ils ne sont pas dessinés "canon vers la droite".
 * - angle : direction vers laquelle pointe l'arme dans le PNG d'origine (radians)
 * - pivotX / pivotY : pixel tenu par la main (crosse du pistolet, bas du manche du pied de biche)
 * - mirrored : le PNG est dessiné "tourné vers la gauche" (crosse du mauvais côté), il faut le retourner
 */
const WEAPON_SPRITE_CALIBRATION: Partial<Record<WeaponType, { angle: number; pivotX: number; pivotY: number; mirrored?: boolean }>> = {
  [WeaponType.PISTOL]: { angle: -3 * Math.PI / 4, pivotX: 8, pivotY: 12, mirrored: true }, // Canon vers le haut-gauche
  [WeaponType.CROWBAR]: { angle: -Math.PI / 4, pivotX: 4, pivotY: 13 }                     // Crochet vers le haut-droite
};

/** Dessine une arme tenue en main par un personnage en (x, y), orientée vers la cible */
export function drawHeldWeapon(
  ctx: CanvasRenderingContext2D,
  weaponImages: Map<WeaponType, HTMLImageElement>,
  x: number, y: number, angle: number, weapon: WeaponType
): void {
  const handX = x + Math.cos(angle) * 8;
  const handY = y - HOLD_OFFSET_Y + Math.sin(angle) * 8;
  ctx.save();
  ctx.translate(handX, handY);
  // 1. On oriente un repère dont l'axe X pointe vers la cible
  ctx.rotate(angle);
  const img = weaponImages.get(weapon);
  const calib = WEAPON_SPRITE_CALIBRATION[weapon];
  // 2. Vers la gauche, on retourne l'arme pour qu'elle ne soit pas tenue à l'envers
  //    (et on inverse ce retournement si le sprite d'origine est lui-même dessiné en miroir)
  const facingLeft = Math.abs(angle) > Math.PI / 2;
  if (facingLeft !== Boolean(calib?.mirrored)) ctx.scale(1, -1);
  if (isImageReady(img) && calib) {
    // 3. On compense l'orientation d'origine du sprite pour que son canon suive l'axe X
    ctx.rotate(-calib.angle);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -calib.pivotX, -calib.pivotY, 16, 16);
  } else {
    // Grenade : petite boule sombre avec sa goupille
    ctx.fillStyle = '#3f6212';
    ctx.beginPath();
    ctx.arc(4, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d4d4d4';
    ctx.fillRect(2, -6, 3, 2);
  }
  ctx.restore();
}
