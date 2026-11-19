/**
 * Transparence du calque "above" (haut des piliers, murs...) AUTOUR DE CELUI QUI REGARDE.
 *
 * Elle ne dépend pas de la présence d'un prop derrière : un chasseur ne peut donc pas s'en servir
 * comme indice, il doit s'approcher pour inspecter une cachette. Un prop caché se voit toujours lui-même.
 *
 * Deux réglages selon le type d'élément, détecté automatiquement sur la carte :
 *  - PILIER : bloc d'une seule tuile de large -> petit rayon, il faut s'approcher pour regarder derrière
 *  - MUR : bloc plus large -> grand rayon, pour ne pas devoir longer chaque mur de la carte
 */

export interface FadeRadius {
  /** En dessous de cette distance (px) : transparence maximale */
  innerRadius: number;
  /** Au-delà : élément totalement opaque (dégradé progressif entre les deux) */
  outerRadius: number;
}

export const ABOVE_FADE: { pillar: FadeRadius; wall: FadeRadius } = {
  pillar: { innerRadius: 48, outerRadius: 128 },
  wall: { innerRadius: 128, outerRadius: 256 }
};
/** Opacité minimale d'un élément tout proche (0 = invisible, 1 = opaque) */
export const ABOVE_FADE_MIN_ALPHA = 0.4;
/** Vitesse de la transition (plus petit = plus doux) */
export const ABOVE_FADE_SMOOTHING = 0.12;
/** Largeur max (en tuiles) d'un bloc pour qu'il soit considéré comme un pilier */
export const PILLAR_MAX_WIDTH_TILES = 1;

export interface TileLayerData {
  data: number[];
  width: number;
  height: number;
}

/** Grille des tuiles pleines (calque "Collision") : 1 = plein */
export interface SolidGrid {
  cells: Uint8Array;
  width: number;
  height: number;
}

/**
 * Regroupe les tuiles "above" qui se touchent en blocs, puis classe chaque bloc :
 * pilier (1) s'il ne fait que PILLAR_MAX_WIDTH_TILES de large, mur (0) sinon.
 */
export function classifyAboveTiles(layer: TileLayerData, pillarMaxWidth = PILLAR_MAX_WIDTH_TILES): Uint8Array {
  const { data, width, height } = layer;
  const result = new Uint8Array(data.length);
  const visited = new Uint8Array(data.length);
  for (let start = 0; start < data.length; start++) {
    if (data[start] === 0 || visited[start]) continue;
    // Parcours du bloc (4 voisins)
    const block: number[] = [];
    const stack = [start];
    visited[start] = 1;
    let minX = Infinity;
    let maxX = -Infinity;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      block.push(idx);
      const x = idx % width;
      const y = Math.floor(idx / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1
      ];
      for (const n of neighbors) {
        if (n >= 0 && data[n] !== 0 && !visited[n]) {
          visited[n] = 1;
          stack.push(n);
        }
      }
    }
    const isPillar = (maxX - minX + 1) <= pillarMaxWidth ? 1 : 0;
    block.forEach(idx => { result[idx] = isPillar; });
  }
  return result;
}

export function buildSolidGrid(collisionLayer: TileLayerData): SolidGrid {
  return {
    cells: Uint8Array.from(collisionLayer.data, t => (t !== 0 ? 1 : 0)),
    width: collisionLayer.width,
    height: collisionLayer.height
  };
}

/**
 * Vrai si aucune tuile pleine ne se trouve entre le point de vue et le point visé.
 * Parcours case par case de la grille (algorithme DDA). La case visée elle-même est ignorée :
 * le haut d'un mur peut chevaucher sa propre collision.
 */
export function hasTileLineOfSight(
  grid: SolidGrid | null,
  x0: number, y0: number,
  x1: number, y1: number,
  tileW: number, tileH: number
): boolean {
  if (!grid) return true;
  let cx = Math.floor(x0 / tileW);
  let cy = Math.floor(y0 / tileH);
  const endX = Math.floor(x1 / tileW);
  const endY = Math.floor(y1 / tileH);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(tileW / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(tileH / dy) : Infinity;
  let tMaxX = dx !== 0 ? ((stepX > 0 ? (cx + 1) * tileW : cx * tileW) - x0) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((stepY > 0 ? (cy + 1) * tileH : cy * tileH) - y0) / dy : Infinity;

  for (let guard = 0; guard < 512; guard++) {
    if (cx === endX && cy === endY) return true;
    if (tMaxX < tMaxY) { cx += stepX; tMaxX += tDeltaX; }
    else { cy += stepY; tMaxY += tDeltaY; }
    if (cx === endX && cy === endY) return true;
    if (cx < 0 || cy < 0 || cx >= grid.width || cy >= grid.height) return false;
    if (grid.cells[cy * grid.width + cx]) return false;
  }
  return true;
}

/**
 * Opacité cible d'une tuile "above" vue depuis (viewX, viewY).
 * Dégradé doux (smoothstep) entre le rayon intérieur et le rayon extérieur du type d'élément.
 * Un mur ne s'estompe que si on le voit vraiment (pas à travers un autre mur, depuis une autre pièce).
 * Les piliers n'ont pas ce test : leur propre base bloquerait la vue d'un joueur placé juste en dessous.
 */
export function computeAboveTileAlpha(
  viewX: number, viewY: number,
  tileX: number, tileY: number, tileW: number, tileH: number,
  isPillar: boolean,
  grid: SolidGrid | null
): number {
  // Distance entre le point de vue et le bord le plus proche de la tuile
  const nearestX = Math.max(tileX, Math.min(viewX, tileX + tileW));
  const nearestY = Math.max(tileY, Math.min(viewY, tileY + tileH));
  const dist = Math.hypot(viewX - nearestX, viewY - nearestY);

  const fade = isPillar ? ABOVE_FADE.pillar : ABOVE_FADE.wall;
  if (dist >= fade.outerRadius) return 1;

  if (!isPillar && !hasTileLineOfSight(
    grid,
    viewX, viewY,
    // Point visé légèrement à l'intérieur de la tuile (sinon l'arrondi peut tomber sur la case voisine)
    Math.max(tileX + 0.5, Math.min(tileX + tileW - 0.5, nearestX)),
    Math.max(tileY + 0.5, Math.min(tileY + tileH - 0.5, nearestY)),
    tileW, tileH
  )) {
    return 1;
  }

  const t = Math.max(0, Math.min(1, (dist - fade.innerRadius) / (fade.outerRadius - fade.innerRadius)));
  const eased = t * t * (3 - 2 * t);
  return ABOVE_FADE_MIN_ALPHA + (1 - ABOVE_FADE_MIN_ALPHA) * eased;
}
