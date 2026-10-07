import { type Rectangle } from '@prop-hunt/shared';

export function parseTiledCollisions(tiledJson: any): Rectangle[] {
    const obstacles: Rectangle[] = [];
    const tileWidth = tiledJson.tilewidth;   // 16 pixels
    const tileHeight = tiledJson.tileheight; // 16 pixels
	const mapWidthInTiles = tiledJson.width; // Largeur de la carte en nombre de tuiles

    // Fonction récursive pour chercher le calque nommé "Colision" dans les groupes de calques
    function findCollisionLayer(layers: any[]): any {
        for (const layer of layers) {
            if (layer.type === 'group' && layer.layers) {
                const found = findCollisionLayer(layer.layers);
                if (found) return found;
            }
            if (layer.name === 'Colision' && layer.type === 'tilelayer') {
                return layer;
            }
        }
        return null;
    }

    const collisionLayer = findCollisionLayer(tiledJson.layers);
    if (!collisionLayer) {
        console.warn('[MapLoader] Aucun calque "Colision" trouvé dans le JSON Tiled !');
        return obstacles;
    }

    // Analyse du tableau de données (data) du calque de collision
    const data: number[] = collisionLayer.data;
    data.forEach((tileId, index) => {
        if (tileId > 0) { // Si la tuile indique une collision
            const x = (index % mapWidthInTiles) * tileWidth;
            const y = Math.floor(index / mapWidthInTiles) * tileHeight;

            obstacles.push({
                x,
                y,
                width: tileWidth,
                height: tileHeight
            });
        }
    });

    console.log(`[MapLoader] ${obstacles.length} obstacles de collision chargés depuis Tiled.`);
    return obstacles;
}