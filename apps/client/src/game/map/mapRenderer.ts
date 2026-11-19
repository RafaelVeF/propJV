import {
  ABOVE_FADE_SMOOTHING,
  buildSolidGrid,
  classifyAboveTiles,
  computeAboveTileAlpha,
  type SolidGrid
} from './aboveFade';

const ABOVE_LAYER_NAME = 'above';
const COLLISION_LAYER_NAME = 'Collision';

/**
 * Chargement et rendu de la carte Tiled :
 *  - drawGround() : tous les calques sauf "above" (dessinés sous les personnages)
 *  - drawAbove()  : le calque "above" (dessiné par-dessus, avec transparence autour du point de vue)
 */
export class MapRenderer {
  private mapData: any = null;
  private readonly tilesetImg = new Image();

  // Données précalculées pour la transparence du calque "above"
  private aboveTileAlpha: Float32Array | null = null;
  private aboveTileIsPillar: Uint8Array | null = null;
  private solidGrid: SolidGrid | null = null;

  constructor(
    private readonly mapUrl = '/assets/maps/map_01_32p.tmj',
    tilesetUrl = '/assets/tilesets/PropJVTileSetMap32.png'
  ) {
    this.tilesetImg.src = tilesetUrl;
  }

  public load(): void {
    fetch(this.mapUrl)
      .then(res => res.json())
      .then(data => {
        this.mapData = data;
        console.log('[MAP] Carte chargée avec succès !', data.width, 'x', data.height);
      })
      .catch(err => console.error('[MAP] Erreur de chargement de la carte:', err));
  }

  private isReady(): boolean {
    return Boolean(this.mapData && this.tilesetImg.complete);
  }

  /** Dessine une tuile du tileset (tileId au format Tiled, commençant à 1) à l'index i du calque */
  private drawTile(ctx: CanvasRenderingContext2D, tileId: number, i: number, layerWidth: number) {
    const tileW = this.mapData.tilewidth;
    const tileH = this.mapData.tileheight;
    const cols = Math.floor(this.tilesetImg.width / tileW);
    const id = tileId - 1; // Tiled commence les ID à 1, on veut du 0-indexé
    const sx = (id % cols) * tileW;
    const sy = Math.floor(id / cols) * tileH;
    const dx = (i % layerWidth) * tileW;
    const dy = Math.floor(i / layerWidth) * tileH;
    ctx.drawImage(this.tilesetImg, sx, sy, tileW, tileH, dx, dy, tileW, tileH);
  }

  /** Sol et murs (tout sauf le calque "above") */
  public drawGround(ctx: CanvasRenderingContext2D): void {
    if (!this.isReady()) return;
    this.mapData.layers.forEach((layer: any) => {
      if (layer.type !== 'tilelayer' || layer.name === ABOVE_LAYER_NAME) return;
      for (let i = 0; i < layer.data.length; i++) {
        if (layer.data[i] !== 0) this.drawTile(ctx, layer.data[i], i, layer.width);
      }
    });
  }

  /**
   * Calque "above" : passe devant les personnages pour l'effet de profondeur.
   * Les tuiles proches du point de vue (viewX, viewY) s'estompent en douceur pour voir ce qu'il y a derrière.
   */
  public drawAbove(ctx: CanvasRenderingContext2D, viewX: number, viewY: number): void {
    if (!this.isReady()) return;
    const tileW = this.mapData.tilewidth;
    const tileH = this.mapData.tileheight;

    this.mapData.layers.forEach((layer: any) => {
      if (layer.type !== 'tilelayer' || layer.name !== ABOVE_LAYER_NAME) return;
      this.prepareAboveLayer(layer);
      const alphas = this.aboveTileAlpha!;

      for (let i = 0; i < layer.data.length; i++) {
        if (layer.data[i] === 0) continue;
        const dx = (i % layer.width) * tileW;
        const dy = Math.floor(i / layer.width) * tileH;

        const targetAlpha = computeAboveTileAlpha(
          viewX, viewY, dx, dy, tileW, tileH,
          Boolean(this.aboveTileIsPillar?.[i]),
          this.solidGrid
        );
        // Lissage dans le temps pour éviter tout clignotement
        alphas[i] += (targetAlpha - alphas[i]) * ABOVE_FADE_SMOOTHING;

        if (alphas[i] < 0.995) {
          ctx.save();
          ctx.globalAlpha = alphas[i];
          this.drawTile(ctx, layer.data[i], i, layer.width);
          ctx.restore();
        } else {
          this.drawTile(ctx, layer.data[i], i, layer.width);
        }
      }
    });
  }

  /** Calculs faits une seule fois par carte : classement pilier/mur et grille de collision */
  private prepareAboveLayer(layer: any): void {
    if (this.aboveTileAlpha && this.aboveTileAlpha.length === layer.data.length) return;
    this.aboveTileAlpha = new Float32Array(layer.data.length).fill(1);
    this.aboveTileIsPillar = classifyAboveTiles(layer);
    const collisionLayer = this.mapData.layers.find((l: any) => l.type === 'tilelayer' && l.name === COLLISION_LAYER_NAME);
    this.solidGrid = collisionLayer ? buildSolidGrid(collisionLayer) : null;
  }
}
