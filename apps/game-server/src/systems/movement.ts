import { Player } from '@prop-hunt/shared';
import { GAME_CONFIG } from '../config/game.js';
import { isValidMovement } from './collision.js';
import { type Rectangle } from '@prop-hunt/shared';

export interface SpeedAnomalyInfo {
    playerId: string;
    expectedMax: number;
    measured: number;
    action: string;
}

export function updatePlayerPosition(
    player: Player,
    vx: number,
    vy: number,
    deltaTime: number,
    obstacles: Rectangle[] = [],
    onSpeedAnomaly?: (info: SpeedAnomalyInfo) => void
): void {
    // Vérification d'anomalie de vitesse (vecteur d'entrée anormalement grand)
    const rawVx = Number.isFinite(vx) ? vx : 0;
    const rawVy = Number.isFinite(vy) ? vy : 0;
    const rawMagnitude = Math.hypot(rawVx, rawVy);

    // Un client légitime envoie vx, vy dans [-1, 1] (norme max ~1.414 en diagonale)
    let normalizedVx = rawVx;
    let normalizedVy = rawVy;

    if (rawMagnitude > 1.5) {
        const expectedMax = GAME_CONFIG.PLAYER_SPEED;
        const measured = Math.round(rawMagnitude * GAME_CONFIG.PLAYER_SPEED);
        onSpeedAnomaly?.({
            playerId: player.id,
            expectedMax,
            measured,
            action: 'VELOCITY_CLAMPED',
        });
        normalizedVx = rawVx / rawMagnitude;
        normalizedVy = rawVy / rawMagnitude;
    } else if (normalizedVx !== 0 && normalizedVy !== 0) {
        normalizedVx *= Math.SQRT1_2;
        normalizedVy *= Math.SQRT1_2;
    }

    // Application de la vitesse maximale autorisée par le serveur
    const finalVx = normalizedVx * GAME_CONFIG.PLAYER_SPEED;
    const finalVy = normalizedVy * GAME_CONFIG.PLAYER_SPEED;

    // Calcul des positions futures souhaitées
    const nextX = player.x + finalVx * deltaTime;
    const nextY = player.y + finalVy * deltaTime;

    // Récupération des dimensions de la carte et de la hitbox dynamique du joueur
    const mapWidth = GAME_CONFIG.MAP_WIDTH;
    const mapHeight = GAME_CONFIG.MAP_HEIGHT;
    const playerRadius = ('currentProp' in player && player.currentProp?.hitboxRadius)
        ? player.currentProp.hitboxRadius
        : GAME_CONFIG.PLAYER_RADIUS;

    // 1. Test et application du mouvement sur l'axe X (permet de glisser le long d'un obstacle vertical)
    if (isValidMovement(nextX, player.y, playerRadius, mapWidth, mapHeight, obstacles)) {
        player.x = nextX;
    }

    // 2. Test et application du mouvement sur l'axe Y (permet de glisser le long d'un obstacle horizontal)
    if (isValidMovement(player.x, nextY, playerRadius, mapWidth, mapHeight, obstacles)) {
        player.y = nextY;
    }
}
