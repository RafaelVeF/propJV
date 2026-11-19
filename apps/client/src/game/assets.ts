import { DEFAULT_HUNTER_EMOTES, DEFAULT_PROPS, WEAPON_ORDER, WEAPONS, type WeaponType } from '@prop-hunt/shared';

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

export type HunterSpriteKey =
  | 'idle_left'
  | 'idle_right'
  | 'idle_north'
  | 'move_n'
  | 'move_nw'
  | 'move_ne'
  | 'move_s'
  | 'move_sw'
  | 'move_se'
  | 'move_w'
  | 'move_e';

export type HunterSprites = Record<HunterSpriteKey, HTMLImageElement>;

/** Précharge les 11 sprite sheets (3x3 de 64x64, 8 frames) du Chasseur */
export function loadHunterSprites(): HunterSprites {
  return {
    idle_left: loadImage('/assets/characters/Hunter/IdleHuntLeft.png'),
    idle_right: loadImage('/assets/characters/Hunter/IdleHuntRight.png'),
    idle_north: loadImage('/assets/characters/Hunter/IdleHuntNord.png'),
    move_n: loadImage('/assets/characters/Hunter/MoveHuntNorth.png'),
    move_nw: loadImage('/assets/characters/Hunter/MoveHuntNorthLeft.png'),
    move_ne: loadImage('/assets/characters/Hunter/MoveHuntNorthRight.png'),
    move_s: loadImage('/assets/characters/Hunter/MoveHuntSouth.png'),
    move_sw: loadImage('/assets/characters/Hunter/MoveHuntSouthLeft.png'),
    move_se: loadImage('/assets/characters/Hunter/MoveHuntSouthRight.png'),
    move_w: loadImage('/assets/characters/Hunter/MoveHuntLeft.png'),
    move_e: loadImage('/assets/characters/Hunter/MoveHuntRight.png')
  };
}

/** Précharge les sprite sheets d'emotes des Chasseurs, indexées par assetPath */
export function loadEmoteImages(): Map<string, HTMLImageElement> {
  const emoteImages = new Map<string, HTMLImageElement>();
  DEFAULT_HUNTER_EMOTES.forEach(e => {
    if (e.assetPath && !emoteImages.has(e.assetPath)) {
      emoteImages.set(e.assetPath, loadImage(e.assetPath));
    }
  });
  return emoteImages;
}

/** Une image est utilisable si elle est chargée et valide */
export function isImageReady(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}
