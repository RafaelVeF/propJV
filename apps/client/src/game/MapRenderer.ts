/**
 * MapRenderer — Chargement et rendu des couches de la carte Tiled (.tmj).
 *
 * Gère le tileset, le chargement asynchrone de la carte, et expose deux
 * méthodes de rendu : sol/murs (sous les entités) et couche "above" (par-dessus).
 */
export class MapRenderer {
  private mapData: any = null;
  private tilesetImg: HTMLImageElement = new Image();
  private loaded: boolean = false;

  constructor(
    mapUrl: string = '/assets/maps/map_01_32p.tmj',
    tilesetUrl: string = '/assets/tilesets/PropJVTileSetMap32.png'
  ) {
    this.tilesetImg.src = tilesetUrl;

    fetch(mapUrl)
      .then(res => res.json())
      .then(data => {
        this.mapData = data;
        this.loaded = true;
        console.log('[MAP] Carte chargée avec succès !', data.width, 'x', data.height);
      })
      .catch(err => console.error('[MAP] Erreur de chargement de la carte:', err));
  }

  public isReady(): boolean {
    return this.loaded && this.tilesetImg.complete;
  }

  /** Dessine toutes les couches SAUF "above" (sol, murs, décors sous les entités) */
  public renderGround(ctx: CanvasRenderingContext2D): void {
    if (!this.isReady()) return;

    const tileW = this.mapData.tilewidth;
    const tileH = this.mapData.tileheight;
    const cols = Math.floor(this.tilesetImg.width / tileW);

    this.mapData.layers.forEach((layer: any) => {
      if (layer.type === 'tilelayer' && layer.name !== 'above') {
        this.drawLayer(ctx, layer, cols, tileW, tileH);
      }
    });
  }

  /** Dessine la couche "above" (éléments qui passent devant les personnages) */
  public renderAbove(ctx: CanvasRenderingContext2D): void {
    if (!this.isReady()) return;

    const tileW = this.mapData.tilewidth;
    const tileH = this.mapData.tileheight;
    const cols = Math.floor(this.tilesetImg.width / tileW);

    this.mapData.layers.forEach((layer: any) => {
      if (layer.type === 'tilelayer' && layer.name === 'above') {
        this.drawLayer(ctx, layer, cols, tileW, tileH);
      }
    });
  }

  private drawLayer(ctx: CanvasRenderingContext2D, layer: any, cols: number, tileW: number, tileH: number): void {
    for (let i = 0; i < layer.data.length; i++) {
      let tileId = layer.data[i];
      if (tileId !== 0) {
        tileId -= 1; // Tiled commence à 1, on veut du 0-indexé
        const sx = (tileId % cols) * tileW;
        const sy = Math.floor(tileId / cols) * tileH;
        const dx = (i % layer.width) * tileW;
        const dy = Math.floor(i / layer.width) * tileH;
        ctx.drawImage(this.tilesetImg, sx, sy, tileW, tileH, dx, dy, tileW, tileH);
      }
    }
  }
}

