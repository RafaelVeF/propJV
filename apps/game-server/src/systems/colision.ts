import { type Rectangle, type Circle } from '@prop-hunt/shared';

/**
 * Vérifie si une position future (sous forme de cercle, ex: un joueur) 
 * se trouve dans les limites de la carte, peu importe ses dimensions.
 */
export function isWithinMapBounds(
    x: number,
    y: number,
    radius: number,
    mapWidth: number,
    mapHeight: number
): boolean {
    return (
        x - radius >= 0 &&
        x + radius <= mapWidth &&
        y - radius >= 0 &&
        y + radius <= mapHeight
    );
}

/**
 * Vérifie la collision entre deux cercles (ex: joueur/joueur ou projectile/joueur).
 */
export function checkCircleCollision(c1: Circle, c2: Circle): boolean {
    const dx = c1.x - c2.x;
    const dy = c1.y - c2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < c1.radius + c2.radius;
}

/**
 * Vérifie la collision entre un cercle et un obstacle rectangulaire (ex: un mur ou un décor).
 */
export function checkCircleRectCollision(circle: Circle, rect: Rectangle): boolean {
    // Trouve le point le plus proche du cercle sur le rectangle
    const closestX = Math.max(rect.x, Math.min(circle.x, rect.x + rect.width));
    const closestY = Math.max(rect.y, Math.min(circle.y, rect.y + rect.height));

    // Calcule la distance entre ce point et le centre du cercle
    const dx = circle.x - closestX;
    const dy = circle.y - closestY;

    return (dx * dx + dy * dy) < (circle.radius * circle.radius);
}

/**
 * Fonction générique globale pour valider si un déplacement vers (newX, newY) est valide
 * par rapport aux limites de la carte et à une liste optionnelle d'obstacles.
 */
export function isValidMovement(
    newX: number,
    newY: number,
    radius: number,
    mapWidth: number,
    mapHeight: number,
    obstacles: Rectangle[]
): boolean {
    // 1. Vérification des bordures de la map
    if (!isWithinMapBounds(newX, newY, radius, mapWidth, mapHeight)) {
        return false;
    }

    // 2. Vérification de la collision avec chaque obstacle de la map (chargé depuis le JSON Tiled)
    const playerCircle: Circle = { x: newX, y: newY, radius };
    for (const obstacle of obstacles) {
        if (checkCircleRectCollision(playerCircle, obstacle)) {
            return false; // Collision détectée avec un mur/décor
        }
    }

    return true;
}