import { DEFAULT_PROPS, WEAPON_ORDER, WEAPONS, type WeaponType } from '@prop-hunt/shared';

function loadImage(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

/** Précharge les textures de props (y compris toutes les orientations/variantes), indexées par chemin */
export function loadPropImages(): Map<string, HTMLImageElement> {
  const propImages = new Map<string, HTMLImageElement>();
  DEFAULT_PROPS.forEach(p => {
    p.variants?.forEach(v => {
      if (v.assetPath && !propImages.has(v.assetPath)) {
        propImages.set(v.assetPath, loadImage(v.assetPath));
      }
    });
    if (p.assetPath && !propImages.has(p.assetPath)) {
      propImages.set(p.assetPath, loadImage(p.assetPath));
    }
  });
  return propImages;
}

/** Précharge les sprites des armes qui en ont un (la grenade est dessinée en code) */
export function loadWeaponImages(): Map<WeaponType, HTMLImageElement> {
  const weaponImages = new Map<WeaponType, HTMLImageElement>();
  WEAPON_ORDER.forEach(type => {
    const path = WEAPONS[type].iconPath;
    if (path) weaponImages.set(type, loadImage(path));
  });
  return weaponImages;
}

/** Une image est utilisable si elle est chargée et valide */
export function isImageReady(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}
