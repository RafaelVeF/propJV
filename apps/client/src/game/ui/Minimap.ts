import { PlayerRole } from '@prop-hunt/shared';

export interface MinimapPlayerMarker {
  x: number;
  y: number;
  name?: string;
  role?: PlayerRole;
}

const SNAPSHOT_SCALE = 0.25; // 3520x2624 -> 880x656 (léger et très net)

/**
 * Pré-rend une seule fois la carte Tiled complète sur un canvas hors écran
 * pour que la minimap et le plan complet tournent à 60 FPS sans coût CPU.
 */
export function buildMapSnapshot(
  mapData: any,
  tilesetImg: HTMLImageElement
): HTMLCanvasElement | null {
  if (!mapData || !tilesetImg.complete || tilesetImg.naturalWidth === 0) {
    return null;
  }

  const tileW: number = mapData.tilewidth;
  const tileH: number = mapData.tileheight;
  const mapW = mapData.width * tileW;
  const mapH = mapData.height * tileH;

  const snapshot = document.createElement('canvas');
  snapshot.width = Math.round(mapW * SNAPSHOT_SCALE);
  snapshot.height = Math.round(mapH * SNAPSHOT_SCALE);

  const sCtx = snapshot.getContext('2d');
  if (!sCtx) return null;

  sCtx.imageSmoothingEnabled = false;
  sCtx.fillStyle = '#0f172a';
  sCtx.fillRect(0, 0, snapshot.width, snapshot.height);

  const cols = Math.floor(tilesetImg.width / tileW);

  const drawLayer = (layer: any) => {
    if (layer.type === 'group' && Array.isArray(layer.layers)) {
      layer.layers.forEach(drawLayer);
      return;
    }
    if (layer.type !== 'tilelayer') return;

    const data: number[] = layer.data || [];
    for (let i = 0; i < data.length; i++) {
      let tileId = data[i];
      if (tileId === 0) continue;
      tileId -= 1;
      const sx = (tileId % cols) * tileW;
      const sy = Math.floor(tileId / cols) * tileH;
      const dx = (i % layer.width) * tileW * SNAPSHOT_SCALE;
      const dy = Math.floor(i / layer.width) * tileH * SNAPSHOT_SCALE;
      sCtx.drawImage(
        tilesetImg,
        sx,
        sy,
        tileW,
        tileH,
        dx,
        dy,
        tileW * SNAPSHOT_SCALE,
        tileH * SNAPSHOT_SCALE
      );
    }
  };

  if (Array.isArray(mapData.layers)) {
    mapData.layers.forEach(drawLayer);
  }

  return snapshot;
}

/**
 * Dessine la minimap circulaire centrée sur le joueur local.
 * Au survol, la vue dézoome légèrement pour offrir un plus grand champ de vision.
 */
export function renderMinimap(
  ctx: CanvasRenderingContext2D,
  size: number,
  snapshot: HTMLCanvasElement | null,
  mapWidth: number,
  mapHeight: number,
  localX: number,
  localY: number,
  localRole: PlayerRole,
  allies: MinimapPlayerMarker[],
  isHovered: boolean
): void {
  const half = size / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.save();

  // Découpe circulaire stricte
  ctx.beginPath();
  ctx.arc(half, half, half, 0, Math.PI * 2);
  ctx.clip();

  // Fond sobre
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, size, size);

  // Rayon monde visible : plus grand au survol (léger dézoom)
  const viewRadius = isHovered ? 1150 : 750;
  const scale = half / viewRadius;

  if (snapshot) {
    const snapX = (localX / mapWidth) * snapshot.width;
    const snapY = (localY / mapHeight) * snapshot.height;
    const drawW = (mapWidth * scale);
    const drawH = (mapHeight * scale);
    const offsetX = half - (snapX / snapshot.width) * drawW;
    const offsetY = half - (snapY / snapshot.height) * drawH;

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(snapshot, offsetX, offsetY, drawW, drawH);
  }

  // Marqueurs des alliés
  allies.forEach(ally => {
    const ax = half + (ally.x - localX) * scale;
    const ay = half + (ally.y - localY) * scale;
    if (ax < -6 || ax > size + 6 || ay < -6 || ay > size + 6) return;

    ctx.beginPath();
    ctx.arc(ax, ay, 4, 0, Math.PI * 2);
    ctx.fillStyle = ally.role === PlayerRole.HUNTER ? '#fb923c' : '#4ade80';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  });

  // Marqueur du joueur local au centre
  ctx.beginPath();
  ctx.arc(half, half, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = localRole === PlayerRole.HUNTER ? '#ef4444' : '#38bdf8';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Anneau intérieur + points cardinaux sobres (N, S, E, O)
  ctx.beginPath();
  ctx.arc(half, half, half - 2, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.stroke();

  ctx.font = 'bold 10px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(11, 16, 28, 0.9)';

  const cardinals: Array<{ label: string; x: number; y: number; color: string }> = [
    { label: 'N', x: half, y: 11, color: '#38bdf8' },
    { label: 'S', x: half, y: size - 11, color: '#94a3b8' },
    { label: 'E', x: size - 11, y: half, color: '#94a3b8' },
    { label: 'O', x: 11, y: half, color: '#94a3b8' }
  ];
  cardinals.forEach(c => {
    ctx.strokeText(c.label, c.x, c.y);
    ctx.fillStyle = c.color;
    ctx.fillText(c.label, c.x, c.y);
  });

  ctx.restore();
}

/**
 * Dessine la carte complète (mode Plan) dans le modal de survol.
 */
export function renderFullMap(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  snapshot: HTMLCanvasElement | null,
  mapWidth: number,
  mapHeight: number,
  localX: number,
  localY: number,
  localRole: PlayerRole,
  allies: MinimapPlayerMarker[]
): void {
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, w, h);

  if (snapshot) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(snapshot, 0, 0, w, h);
  }

  const scaleX = w / mapWidth;
  const scaleY = h / mapHeight;

  // Alliés
  allies.forEach(ally => {
    const ax = ally.x * scaleX;
    const ay = ally.y * scaleY;

    ctx.beginPath();
    ctx.arc(ax, ay, 6, 0, Math.PI * 2);
    ctx.fillStyle = ally.role === PlayerRole.HUNTER ? '#fb923c' : '#4ade80';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
  });

  // Joueur local (avec halo discret)
  const px = localX * scaleX;
  const py = localY * scaleY;
  const color = localRole === PlayerRole.HUNTER ? '#ef4444' : '#38bdf8';

  ctx.beginPath();
  ctx.arc(px, py, 13, 0, Math.PI * 2);
  ctx.fillStyle = localRole === PlayerRole.HUNTER ? 'rgba(239, 68, 68, 0.25)' : 'rgba(56, 189, 248, 0.25)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
}

