// ------------------------------------------------------------------
//  Calques de la carte Tiled
// ------------------------------------------------------------------
//  Noms en minuscules : la comparaison est insensible à la casse ("Lumiere" = "lumiere").
//
//  "lumiere"  : bloque UNIQUEMENT la lumière (projette des ombres). Jamais dessiné.
//  "colision" : gère UNIQUEMENT les collisions (côté serveur). Jamais dessiné, ignoré par la lumière.
//  "above"    : calque MARQUEUR, jamais dessiné. Une tuile (générique) posée dans "above" signifie :
//               « à cette case, la tuile du calque mur passe PAR-DESSUS les joueurs » (le joueur passe
//               derrière). Il sert aussi à la lumière (voir vision.ts).
//  "murs"     : murs. Dessiné sous les joueurs, sauf aux cases marquées dans "above".
//  Tous les autres calques (sol, décor...) sont dessinés sous les joueurs.

export const LIGHT_LAYER_NAMES = ['lumiere'];
export const ABOVE_LAYER_NAME = 'above';
// Calques dont les tuiles passent par-dessus les joueurs aux cases marquées dans "above"
export const FRONT_LAYER_NAMES = ['mur', 'murs'];
// Calques de logique qui ne sont JAMAIS dessinés
export const HIDDEN_LAYER_NAMES = ['lumiere', 'colision', ABOVE_LAYER_NAME];

export const layerName = (layer: { name: string }): string => String(layer.name).toLowerCase();

/** Grille des cases marquées dans le calque "above" (1 = la tuile de mur passe devant les joueurs). */
export function buildAboveGrid(data: any): Uint8Array {
    const grid = new Uint8Array(data.width * data.height);
    data.layers.forEach((layer: any) => {
        if (layer.type !== 'tilelayer' || layerName(layer) !== ABOVE_LAYER_NAME) return;
        for (let i = 0; i < layer.data.length; i++) if (layer.data[i] !== 0) grid[i] = 1;
    });
    return grid;
}