import { Player } from '@prop-hunt/shared';
import { GAME_CONFIG } from '../config/game.js';
import { isValidMovement } from './colision.js';
import { type Rectangle, type Circle } from '@prop-hunt/shared';

export function updatePlayerPosition(
    player: Player,
    vx: number,
    vy: number,
    deltaTime: number,
    obstacles: Rectangle[] = []
): void {

    // Normalisation de la vitesse pour éviter que le joueur aille plus vite en diagonale
    let normalizedVx = vx;
    let normalizedVy = vy;

    if (normalizedVx !== 0 && normalizedVy !== 0) {
        normalizedVx *= Math.SQRT1_2;
        normalizedVy *= Math.SQRT1_2;
    }

    // Application de la vitesse maximale autorisée par le serveur
    const finalVx = normalizedVx * GAME_CONFIG.PLAYER_SPEED;
    const finalVy = normalizedVy * GAME_CONFIG.PLAYER_SPEED;

    // Calcul des positions futures souhaitées
    const nextX = player.x + finalVx * deltaTime;
    const nextY = player.y + finalVy * deltaTime;

    // Récupération des dimensions fixes de la carte et la hitbox du joueur
    const mapWidth = GAME_CONFIG.MAP_WIDTH;
    const mapHeight = GAME_CONFIG.MAP_HEIGHT;
    const playerRadius = GAME_CONFIG.PLAYER_RADIUS;

    // 1. Test et application du mouvement sur l'axe X (permet de glisser le long d'un obstacle vertical)
    if (isValidMovement(nextX, player.y, playerRadius, mapWidth, mapHeight, obstacles)) {
        player.x = nextX;
    }

    // 2. Test et application du mouvement sur l'axe Y (permet de glisser le long d'un obstacle horizontal)
    if (isValidMovement(player.x, nextY, playerRadius, mapWidth, mapHeight, obstacles)) {
        player.y = nextY;
    }
}
