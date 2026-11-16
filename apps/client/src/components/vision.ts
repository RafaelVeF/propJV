import { LIGHT_LAYER_NAMES, ABOVE_LAYER_NAME, layerName } from './mapLayers';

// ------------------------------------------------------------------
//  Réglages de la lumière
// ------------------------------------------------------------------

// Opacité des zones d'ombre : 1 = noir total, plus bas = on devine la carte et les joueurs
const SHADOW_OPACITY = 0.80;
// Part du rayon de vision (en fin de cercle) utilisée pour un dégradé doux : 0 = bord net
const SOFT_EDGE = 0.2;
// true : si le joueur se tient sur une tuile "lumiere", tout est dans l'ombre sauf cette tuile
//        (il ne voit plus à travers le mur dans lequel il se trouve).
// false : la tuile de départ est ignorée, le joueur voit à travers.
const BLOCK_WHEN_INSIDE_WALL = true;
// Position des "yeux" du joueur, en part de la taille du carré au-dessus de son centre
// (0 = centre, 0.5 = bord supérieur). Les ombres sont calculées depuis ce point : le joueur
// voit donc avec la partie haute de son carré, et non depuis son centre.
const EYE_HEIGHT = 0.7;
// Vue "3D" : l'image d'une tuile "lumiere" est la FACE AVANT (sud) du mur ou du pilier, son dessus
// étant dans "above". Elle n'est donc éclairée que si le joueur voit sa face sud (il est plus bas
// que la tuile). Vue du nord, de l'est ou de l'ouest, la tuile reste dans l'ombre.
// false : n'importe quelle face visible éclaire la tuile (ancien comportement).
const LIGHT_ONLY_SOUTH_FACES = false;
// Quand le joueur se trouve sous une tuile "above", les tuiles "lumiere" situées au-dessus de lui,
// dans ce cône (centré vers le haut), ignorent la règle "une tuile above devant = pas d'éclairage".
const UNDER_ABOVE_OPEN_ANGLE = (120 * Math.PI) / 180;
// Perspective : les murs du bas d'une pièce sont dans "lumiere" ET dans "above", et le joueur peut
// passer derrière. Que faire quand il se trouve sur une telle tuile ?
//  'front' : la lumière est calculée depuis un point juste devant la face nord du mur
//            (les yeux sont replacés au nord du mur). Le joueur et la caméra ne bougent pas.
//  'shift' : le tronçon de mur est DÉCALÉ d'une rangée vers le bas pour le calcul : la tuile du
//            joueur devient libre et c'est la rangée du dessous qui bloque la vue.
//  'none'  : ancien comportement ("joueur dans un mur" = tout dans l'ombre sauf sa tuile).
// Dans les deux premiers cas, le tronçon de mur reste affiché sombre (vu de dos).
const BEHIND_WALL_MODE: 'front' | 'shift' | 'none' = 'front';
// true : les tuiles "lumiere" dont le joueur voit la face sud sont "dé-ombrées" (affichées éclairées).
// false : TOUTES les tuiles "lumiere" restent dans l'ombre (elles projettent leurs ombres, mais ne
//         sont jamais éclairées elles-mêmes), sauf celle où se tient le joueur (BLOCK_WHEN_INSIDE_WALL).
const LIGHT_VISIBLE_WALL_TILES = false;
// (si LIGHT_VISIBLE_WALL_TILES = true) true : une tuile "lumiere" qui est aussi marquée dans "above"
// n'est jamais éclairée ; false : elle s'éclaire comme les autres murs.
const NEVER_LIGHT_WALL_UNDER_ABOVE = false;
// Écart maximal entre deux points de l'arc qui ferme chaque ombre (voir addEdge)
const ARC_STEP = Math.PI / 16; // 11,25°

/** Ce dont la vision a besoin pour un joueur : son centre et la taille de son carré. */
export interface VisionViewer {
    x: number;
    y: number;
    size: number;
}

// ------------------------------------------------------------------
//  Système de vision
// ------------------------------------------------------------------
//  Utilisation :
//    const vision = new VisionSystem(VISION_RADIUS);
//    vision.setMap(donneesTiled);           // une fois la carte chargée
//    vision.render(ctx, player, zoom);       // à chaque image, APRÈS avoir dessiné la scène
//    vision.isInsideWall(x, y);              // le point est-il dans une tuile "lumiere" ?
//
//  Fonctionnement du rendu :
//  0. La lumière part des YEUX du joueur (haut de son carré), pas de son centre.
//  1. On parcourt uniquement les tuiles "lumiere" autour du joueur (fenêtre de la taille du cercle).
//  2. Chaque face de tuile tournée vers le joueur (et donnant sur une case libre) projette
//     une ombre : un polygone qui part de la face et s'étend en s'éloignant du joueur.
//  3. Les tuiles dont la face SUD est directement visible sont "dé-ombrées" : elles restent claires
//     (voir LIGHT_ONLY_SOUTH_FACES : les autres faces projettent une ombre mais n'éclairent pas).
//     L'ombre commence donc juste derrière elles. Exception : si une tuile "above" se trouve
//     sur la ligne de vue AVANT la tuile "lumiere", celle-ci n'est pas éclairée.
//  4. Tout ce qui dépasse le rayon de vision est assombri par un dégradé circulaire.
//     Le cercle de lumière est ainsi limité par les murs proches et par le rayon maximal.
export class VisionSystem {
    // Canvas offscreen qui ne contient QUE les zones d'ombre (noires, opaques).
    // Il est collé sur la scène avec l'opacité SHADOW_OPACITY : deux ombres qui se
    // chevauchent ne s'assombrissent donc pas deux fois.
    private readonly shadowCanvas: HTMLCanvasElement;
    private readonly shadowCtx: CanvasRenderingContext2D;

    // Grille des tuiles qui bloquent la lumière (calque "lumiere", 1 = mur)
    private wallGrid: Uint8Array | null = null;
    // Grille des tuiles du calque "above" (1 = tuile présente). Elles ne bloquent pas la lumière,
    // mais une tuile "lumiere" cachée derrière l'une d'elles n'est pas éclairée.
    private aboveGrid: Uint8Array | null = null;
    private gridW = 0;
    private gridH = 0;
    private tileW = 16;
    private tileH = 16;

    // Après chaque appel à rayDistance : true si le rayon a traversé une tuile "above"
    // AVANT de s'arrêter (sur un mur, ou à maxDist).
    private rayCrossedAbove = false;

    constructor(private readonly visionRadius: number) {
        this.shadowCanvas = document.createElement('canvas');
        const shadowCtx = this.shadowCanvas.getContext('2d');
        if (!shadowCtx) throw new Error('[VISION] Impossible de créer le canvas des ombres');
        this.shadowCtx = shadowCtx;
    }

    // ------------------------------------------------------------------
    //  Carte
    // ------------------------------------------------------------------

    /** Construit les grilles de lumière à partir des données Tiled (JSON .tmj). */
    setMap(data: any): void {
        this.gridW = data.width;
        this.gridH = data.height;
        this.tileW = data.tilewidth;
        this.tileH = data.tileheight;
        const wallGrid = new Uint8Array(this.gridW * this.gridH);
        const aboveGrid = new Uint8Array(this.gridW * this.gridH);
        let found = false;

        data.layers.forEach((layer: any) => {
            if (layer.type !== 'tilelayer') return;
            const name = layerName(layer);
            if (name === ABOVE_LAYER_NAME) {
                for (let i = 0; i < layer.data.length; i++) {
                    if (layer.data[i] !== 0) aboveGrid[i] = 1;
                }
            }
            if (!LIGHT_LAYER_NAMES.includes(name)) return;
            found = true;
            for (let i = 0; i < layer.data.length; i++) {
                if (layer.data[i] !== 0) wallGrid[i] = 1;
            }
        });

        this.wallGrid = wallGrid;
        this.aboveGrid = aboveGrid;

        if (!found) {
            console.warn('[MAP] Aucun calque de lumière trouvé parmi', LIGHT_LAYER_NAMES, '- la vision ne sera pas bloquée.');
        }
    }

    // ------------------------------------------------------------------
    //  Grille de lumière
    // ------------------------------------------------------------------

    // Hors de la carte = mur
    private isSolid(cx: number, cy: number): boolean {
        if (cx < 0 || cy < 0 || cx >= this.gridW || cy >= this.gridH) return true;
        return this.wallGrid![cy * this.gridW + cx] === 1;
    }

    // Case dans la carte ET libre (sans tuile "lumiere")
    private isFree(cx: number, cy: number): boolean {
        return cx >= 0 && cy >= 0 && cx < this.gridW && cy < this.gridH && this.wallGrid![cy * this.gridW + cx] === 0;
    }

    // Case dans la carte, à la fois dans "lumiere" et dans "above" (mur du bas d'une pièce)
    private isWallAndAbove(cx: number, cy: number): boolean {
        return !!this.wallGrid && !!this.aboveGrid && cx >= 0 && cy >= 0 && cx < this.gridW && cy < this.gridH
            && this.wallGrid[cy * this.gridW + cx] === 1 && this.aboveGrid[cy * this.gridW + cx] === 1;
    }

    /** Vrai si le point (x, y) se trouve dans une tuile du calque "lumiere". */
    isInsideWall(x: number, y: number): boolean {
        if (!this.wallGrid) return false;
        return this.isSolid(Math.floor(x / this.tileW), Math.floor(y / this.tileH));
    }

    // Lance un rayon depuis (ox, oy) et renvoie la distance jusqu'au premier mur
    // (ou maxDist si rien n'est touché). Algorithme DDA sur la grille de tuiles.
    // Sert à savoir si une face de mur est directement visible.
    private rayDistance(ox: number, oy: number, angle: number, maxDist: number): number {
        this.rayCrossedAbove = false;
        if (!this.wallGrid) return maxDist;

        const tileW = this.tileW;
        const tileH = this.tileH;
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);

        let cx = Math.floor(ox / tileW);
        let cy = Math.floor(oy / tileH);
        const stepX = dx > 0 ? 1 : -1;
        const stepY = dy > 0 ? 1 : -1;

        const tDeltaX = dx === 0 ? Infinity : Math.abs(tileW / dx);
        const tDeltaY = dy === 0 ? Infinity : Math.abs(tileH / dy);
        let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (cx + 1) * tileW - ox : ox - cx * tileW)) / Math.abs(dx);
        let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (cy + 1) * tileH - oy : oy - cy * tileH)) / Math.abs(dy);

        // La tuile de départ est ignorée : on avance de tuile en tuile
        while (true) {
            let t: number;
            if (tMaxX < tMaxY) {
                t = tMaxX;
                tMaxX += tDeltaX;
                cx += stepX;
            } else {
                t = tMaxY;
                tMaxY += tDeltaY;
                cy += stepY;
            }
            if (t >= maxDist) return maxDist;
            if (this.isSolid(cx, cy)) return t;
            // Case libre (donc dans la carte) : y a-t-il une tuile "above" avant la cible ?
            if (this.aboveGrid && this.aboveGrid[cy * this.gridW + cx] === 1) this.rayCrossedAbove = true;
        }
    }

    // ------------------------------------------------------------------
    //  Rendu : ombres derrière les tuiles "lumiere" + cercle de vision
    // ------------------------------------------------------------------

    /**
     * Dessine les ombres et le cercle de vision par-dessus la scène déjà dessinée dans `ctx`.
     * La caméra est supposée centrée sur `viewer`, avec le facteur de zoom `zoom`.
     */
    render(ctx: CanvasRenderingContext2D, viewer: VisionViewer, zoom: number): void {
        const screen = ctx.canvas;
        const shadowCanvas = this.shadowCanvas;
        // Le canvas des ombres suit la taille de l'écran
        if (shadowCanvas.width !== screen.width || shadowCanvas.height !== screen.height) {
            shadowCanvas.width = screen.width;
            shadowCanvas.height = screen.height;
        }

        const f = this.shadowCtx;
        const wallGrid = this.wallGrid;
        const aboveGrid = this.aboveGrid;
        const gridW = this.gridW;
        const gridH = this.gridH;
        const tw = this.tileW;
        const th = this.tileH;
        // Origine de la lumière : les yeux (haut du carré). Le centre du carré reste viewer.x / viewer.y.
        const px = viewer.x;
        let py = viewer.y - EYE_HEIGHT * viewer.size;
        const R = this.visionRadius;

        // Distance à laquelle on s'intéresse aux murs, et distance où se terminent les ombres.
        // Les ombres vont bien au-delà de R : elles sont de toute façon couvertes par le dégradé.
        const reach = R + 2 * Math.max(tw, th);
        const far = reach * 1.6;

        f.setTransform(1, 0, 0, 1, 0, 0);
        f.globalCompositeOperation = 'source-over';
        f.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);

        // Même transformation caméra que la scène
        f.setTransform(
            zoom, 0, 0, zoom,
            screen.width / 2 - viewer.x * zoom,
            screen.height / 2 - viewer.y * zoom
        );
        f.fillStyle = '#000000';

        // Tuiles "lumiere" à afficher en entier (non ombrées)
        const litTiles = new Set<number>();

        // Joueur derrière un mur du bas (tuile "lumiere" + "above") ?
        const ptx = Math.floor(viewer.x / tw);
        let pty = Math.floor(viewer.y / th);
        const behindWall = BEHIND_WALL_MODE !== 'none' && this.isWallAndAbove(ptx, pty);

        // Tronçon de mur où se trouve le joueur : tuiles "lumiere" + "above" contiguës de sa rangée.
        // Il reste affiché sombre (plus bas).
        const shiftedRow: number[] = [];
        // Mode 'shift' : tuiles de la rangée du dessous rendues bloquantes le temps du calcul
        const addedBelow: number[] = [];
        if (behindWall) {
            let sx0 = ptx;
            let sx1 = ptx;
            while (this.isWallAndAbove(sx0 - 1, pty)) sx0--;
            while (this.isWallAndAbove(sx1 + 1, pty)) sx1++;
            for (let x = sx0; x <= sx1; x++) shiftedRow.push(pty * gridW + x);
        }

        if (behindWall && BEHIND_WALL_MODE === 'front') {
            // On remonte jusqu'au haut du mur (il peut faire plusieurs tuiles d'épaisseur)
            // et on place les yeux juste devant sa face nord.
            let topRow = pty;
            while (this.isWallAndAbove(ptx, topRow - 1)) topRow--;
            const frontY = topRow * th - 0.5;
            if (py > frontY) py = frontY;
            // La suite du calcul se fait depuis la tuile devant le mur
            pty = Math.floor(py / th);
        } else if (behindWall && BEHIND_WALL_MODE === 'shift') {
            // Le tronçon descend d'une rangée (annulé juste après le calcul des ombres)
            shiftedRow.forEach((idx) => {
                wallGrid![idx] = 0;
                const below = idx + gridW;
                if (below < gridW * gridH && wallGrid![below] === 0) {
                    wallGrid![below] = 1;
                    addedBelow.push(below);
                }
            });
        }

        // Le joueur se trouve-t-il sous une tuile "above" ?
        const underAbove = !!aboveGrid && ptx >= 0 && pty >= 0 && ptx < gridW && pty < gridH
            && aboveGrid[pty * gridW + ptx] === 1;

        const insideWall = BLOCK_WHEN_INSIDE_WALL && !behindWall && this.isInsideWall(viewer.x, viewer.y);

        // Toutes les ombres sont ajoutées au MÊME tracé et remplies en un seul fill(), pour éviter
        // de fines coutures aux jointures. Chaque polygone est orienté dans le même sens,
        // donc ils s'additionnent au lieu de s'annuler.
        f.beginPath();

        // Ajoute un polygone (liste x,y,x,y...) au tracé, toujours dans le même sens de rotation
        const addPoly = (pts: number[]) => {
            const n = pts.length / 2;
            let area = 0;
            for (let i = 0; i < n; i++) {
                const j = (i + 1) % n;
                area += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1];
            }
            if (area >= 0) {
                f.moveTo(pts[0], pts[1]);
                for (let i = 1; i < n; i++) f.lineTo(pts[2 * i], pts[2 * i + 1]);
            } else {
                f.moveTo(pts[2 * (n - 1)], pts[2 * (n - 1) + 1]);
                for (let i = n - 2; i >= 0; i--) f.lineTo(pts[2 * i], pts[2 * i + 1]);
            }
            f.closePath();
        };

        // Une face est éclairée si le joueur voit directement au moins un de ses points
        // (près du début, milieu, près de la fin), sans autre mur entre les deux
        // ET sans tuile "above" entre les deux (sinon la tuile "above" la cache : on ne l'éclaire pas).
        const canSeeEdge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number): boolean => {
            for (const t of [0.1, 0.5, 0.9]) {
                // Point légèrement DEVANT la face (0.05 px), pour ne pas toucher la tuile elle-même
                const sx = ax + (bx - ax) * t + nx * 0.05;
                const sy = ay + (by - ay) * t + ny * 0.05;
                const dx = sx - px;
                const dy = sy - py;
                const dist = Math.hypot(dx, dy);
                if (dist < 1e-6) return true;
                const angle = Math.atan2(dy, dx);
                if (this.rayDistance(px, py, angle, dist) >= dist) {
                    if (!this.rayCrossedAbove) return true;
                    // Joueur sous une tuile "above" : vers le haut (cône de UNDER_ABOVE_OPEN_ANGLE),
                    // les tuiles "above" devant la face ne cachent pas la tuile "lumiere".
                    if (underAbove) {
                        // Écart avec la direction "haut" (angle -PI/2, l'axe Y de l'écran pointe vers le bas)
                        const diff = Math.atan2(Math.sin(angle + Math.PI / 2), Math.cos(angle + Math.PI / 2));
                        if (Math.abs(diff) <= UNDER_ABOVE_OPEN_ANGLE / 2) return true;
                    }
                }
            }
            return false;
        };

        // Ombre derrière une face A-B : A, B, puis un ARC de points lointains (à la distance "far")
        // qui balaie tous les angles sous lesquels le joueur voit la face, de B jusqu'à A.
        // Un arc (et non 2 ou 3 points reliés par des segments) est indispensable quand le joueur est
        // collé à la face : elle occupe alors presque 180° de vue, et un segment entre deux points
        // lointains passerait juste sous le mur, laissant fuir la lumière derrière.
        const addEdge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number, tile: number, lights: boolean) => {
            const dax = ax - px, day = ay - py;
            const dbx = bx - px, dby = by - py;
            if (Math.hypot(dax, day) < 1e-6 || Math.hypot(dbx, dby) < 1e-6) return;

            const angA = Math.atan2(day, dax);
            const angB = Math.atan2(dby, dbx);
            // Écart angulaire de B vers A par le plus court chemin (toujours < 180° : le joueur n'est
            // jamais sur la ligne de la face, puisqu'il est strictement de son côté)
            const span = Math.atan2(Math.sin(angA - angB), Math.cos(angA - angB));
            const steps = Math.max(1, Math.ceil(Math.abs(span) / ARC_STEP));

            const pts = [ax, ay, bx, by];
            for (let i = 0; i <= steps; i++) {
                const ang = angB + (span * i) / steps;
                pts.push(px + Math.cos(ang) * far, py + Math.sin(ang) * far);
            }
            addPoly(pts);

            // Toutes les faces projettent une ombre ; seule une face qui "éclaire" peut allumer la tuile.
            // Voir NEVER_LIGHT_WALL_UNDER_ABOVE pour les tuiles aussi marquées dans "above".
            const tileInAbove = NEVER_LIGHT_WALL_UNDER_ABOVE && !!aboveGrid && aboveGrid[tile] === 1;
            if (LIGHT_VISIBLE_WALL_TILES && lights && !tileInAbove && !litTiles.has(tile) && canSeeEdge(ax, ay, bx, by, nx, ny)) litTiles.add(tile);
        };

        if (insideWall) {
            // Le joueur est dans un mur : tout est dans l'ombre (sa propre tuile est éclairée plus bas)
            f.rect(px - far * 2, py - far * 2, far * 4, far * 4);
        } else if (wallGrid) {
            // Fenêtre de tuiles autour du joueur
            const x0 = Math.max(0, Math.floor((px - reach) / tw));
            const x1 = Math.min(gridW - 1, Math.floor((px + reach) / tw));
            const y0 = Math.max(0, Math.floor((py - reach) / th));
            const y1 = Math.min(gridH - 1, Math.floor((py + reach) / th));

            for (let ty = y0; ty <= y1; ty++) {
                for (let tx = x0; tx <= x1; tx++) {
                    const tile = ty * gridW + tx;
                    if (wallGrid[tile] !== 1) continue;

                    const left = tx * tw, right = left + tw;
                    const top = ty * th, bottom = top + th;

                    // Hors portée : ignorée
                    const cdx = left + tw / 2 - px;
                    const cdy = top + th / 2 - py;
                    if (cdx * cdx + cdy * cdy > reach * reach) continue;

                    // Une face compte si elle donne sur une case libre ET que le joueur est de son côté
                    if (py < top && this.isFree(tx, ty - 1)) addEdge(left, top, right, top, 0, -1, tile, !LIGHT_ONLY_SOUTH_FACES);        // haut
                    if (py > bottom && this.isFree(tx, ty + 1)) addEdge(left, bottom, right, bottom, 0, 1, tile, true);                  // bas
                    if (px < left && this.isFree(tx - 1, ty)) addEdge(left, top, left, bottom, -1, 0, tile, !LIGHT_ONLY_SOUTH_FACES);      // gauche
                    if (px > right && this.isFree(tx + 1, ty)) addEdge(right, top, right, bottom, 1, 0, tile, !LIGHT_ONLY_SOUTH_FACES);    // droite
                }
            }
        }
        f.fill();

        // Mode 'shift' : fin du calcul, on remet le mur à sa vraie place
        if (BEHIND_WALL_MODE === 'shift') {
            shiftedRow.forEach((idx) => { wallGrid![idx] = 1; });
            addedBelow.forEach((idx) => { wallGrid![idx] = 0; });
        }

        // Si le joueur se trouve sous une tuile "above", la tuile "lumiere" située juste en dessous
        // de lui n'est pas éclairée.
        if (underAbove) {
            litTiles.delete((pty + 1) * gridW + ptx);
        }

        // La tuile sur laquelle se tient le joueur est toujours éclairée
        if (insideWall) {
            if (ptx >= 0 && pty >= 0 && ptx < gridW && pty < gridH) litTiles.add(pty * gridW + ptx);
        }

        // Les tuiles "lumiere" directement visibles sont dé-ombrées : elles apparaissent entières
        if (litTiles.size > 0) {
            f.globalCompositeOperation = 'destination-out';
            f.beginPath();
            litTiles.forEach((idx) => {
                f.rect((idx % gridW) * tw, Math.floor(idx / gridW) * th, tw, th);
            });
            f.fill();
            f.globalCompositeOperation = 'source-over';
        }

        // Toutes les tuiles "lumiere" restent sombres : on les repeint dans l'ombre une par une,
        // pour qu'aucune ne soit éclairée, quelle que soit la position du joueur.
        if (!LIGHT_VISIBLE_WALL_TILES && wallGrid) {
            const keepLit = insideWall && ptx >= 0 && pty >= 0 && ptx < gridW && pty < gridH ? pty * gridW + ptx : -1;
            const x0 = Math.max(0, Math.floor((px - reach) / tw));
            const x1 = Math.min(gridW - 1, Math.floor((px + reach) / tw));
            const y0 = Math.max(0, Math.floor((py - reach) / th));
            const y1 = Math.min(gridH - 1, Math.floor((py + reach) / th));
            f.beginPath();
            for (let ty = y0; ty <= y1; ty++) {
                for (let tx = x0; tx <= x1; tx++) {
                    const tile = ty * gridW + tx;
                    if (wallGrid[tile] !== 1 || tile === keepLit) continue;
                    f.rect(tx * tw, ty * th, tw, th);
                }
            }
            f.fill();
        }

        // Le tronçon de mur derrière lequel se trouve le joueur reste sombre (vu de dos, comme d'habitude)
        if (shiftedRow.length > 0) {
            f.beginPath();
            shiftedRow.forEach((idx) => {
                f.rect((idx % gridW) * tw, Math.floor(idx / gridW) * th, tw, th);
            });
            f.fill();
        }

        // Limite circulaire : dégradé transparent -> noir autour du rayon de vision.
        // Dessiné EN DERNIER pour que même une tuile claire hors du cercle reste sombre.
        f.setTransform(1, 0, 0, 1, 0, 0);
        const cx = screen.width / 2;
        const cy = screen.height / 2;
        const rPx = R * zoom;
        const grad = f.createRadialGradient(cx, cy, rPx * (1 - SOFT_EDGE), cx, cy, rPx);
        grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 1)');
        f.fillStyle = grad;
        f.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height);

        // On colle les ombres par-dessus la scène, en coordonnées écran, avec l'opacité voulue
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = SHADOW_OPACITY;
        ctx.drawImage(shadowCanvas, 0, 0);
        ctx.restore();
    }
}