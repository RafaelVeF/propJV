import { DEFAULT_HUNTER_EMOTES, DEFAULT_PROPS, WEAPON_ORDER, WEAPONS, WeaponType } from '@prop-hunt/shared';
import { HUNTER_SPRITE_SPECS } from './render/hunterSpriteSpecs';

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

/** Précharge les sprites des armes (rifle, wave_gun, launcher, zap, landmine_launcher) */
export function loadWeaponImages(): Map<WeaponType, HTMLImageElement> {
  const weaponImages = new Map<WeaponType, HTMLImageElement>();
  WEAPON_ORDER.forEach(type => {
    const path = WEAPONS[type].iconPath;
    if (path) weaponImages.set(type, loadImage(path));
  });
  return weaponImages;
}

/** Précharge le sprite de la mine posée au sol */
export function loadMineGroundImage(): HTMLImageElement | undefined {
  const path = WEAPONS[WeaponType.MINE].groundIconPath;
  return path ? loadImage(path) : undefined;
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

/** Précharge les sprite sheets du Chasseur à partir de HUNTER_SPRITE_SPECS */
export function loadHunterSprites(): HunterSprites {
  const sprites = {} as HunterSprites;
  (Object.keys(HUNTER_SPRITE_SPECS) as HunterSpriteKey[]).forEach(key => {
    sprites[key] = loadImage(HUNTER_SPRITE_SPECS[key].assetPath);
  });
  return sprites;
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

export interface DroneImages {
  ready: HTMLImageElement;
  reloading: HTMLImageElement;
}

/** Précharge les sprites des drones accompagnants (prêt / en rechargement) */
export function loadDroneImages(): DroneImages {
  return {
    ready: loadImage('/assets/drones/drone_ready.png'),
    reloading: loadImage('/assets/drones/drone_reloading.png')
  };
}

/** Une image est utilisable si elle est chargée et valide */
export function isImageReady(img: HTMLImageElement | null | undefined): img is HTMLImageElement {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}
