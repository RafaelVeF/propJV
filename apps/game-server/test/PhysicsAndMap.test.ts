import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PlayerRole, type Player, type Rectangle } from '@prop-hunt/shared';
import {
  isWithinMapBounds,
  checkCircleCollision,
  checkCircleRectCollision,
  isValidMovement
} from '../src/systems/collision.js';
import { updatePlayerPosition } from '../src/systems/movement.js';
import { parseTiledCollisions } from '../src/utils/mapLoader.js';
import { GAME_CONFIG } from '../src/config/game.js';

describe('Système de Collision, Mouvement et Chargement de Carte', () => {

  it('1. isWithinMapBounds vérifie les limites de la carte', () => {
    assert.strictEqual(isWithinMapBounds(100, 100, 12, 800, 800), true);
    assert.strictEqual(isWithinMapBounds(5, 100, 12, 800, 800), false, 'Dépassement bord gauche');
    assert.strictEqual(isWithinMapBounds(795, 100, 12, 800, 800), false, 'Dépassement bord droit');
    assert.strictEqual(isWithinMapBounds(100, 5, 12, 800, 800), false, 'Dépassement bord haut');
    assert.strictEqual(isWithinMapBounds(100, 795, 12, 800, 800), false, 'Dépassement bord bas');
  });

  it('2. checkCircleCollision détecte le chevauchement entre deux cercles', () => {
    assert.strictEqual(
      checkCircleCollision({ x: 0, y: 0, radius: 10 }, { x: 15, y: 0, radius: 10 }),
      true
    );
    assert.strictEqual(
      checkCircleCollision({ x: 0, y: 0, radius: 10 }, { x: 25, y: 0, radius: 10 }),
      false
    );
  });

  it('3. checkCircleRectCollision détecte la collision cercle / obstacle rectangulaire', () => {
    const wall: Rectangle = { x: 100, y: 100, width: 32, height: 32 };
    assert.strictEqual(checkCircleRectCollision({ x: 95, y: 116, radius: 10 }, wall), true);
    assert.strictEqual(checkCircleRectCollision({ x: 50, y: 50, radius: 10 }, wall), false);
  });

  it('4. isValidMovement bloque en cas de collision avec un mur', () => {
    const obstacles: Rectangle[] = [{ x: 200, y: 200, width: 32, height: 32 }];
    assert.strictEqual(isValidMovement(100, 100, 12, 800, 800, obstacles), true);
    assert.strictEqual(isValidMovement(210, 210, 12, 800, 800, obstacles), false);
  });

  it('5. updatePlayerPosition déplace et normalise la diagonale sans dépasser la vitesse max', () => {
    GAME_CONFIG.MAP_WIDTH = 1000;
    GAME_CONFIG.MAP_HEIGHT = 1000;

    const player: Player = {
      id: 'p1',
      name: 'TestProp',
      role: PlayerRole.PROP,
      x: 500,
      y: 500,
      health: 100,
      isLocked: false
    };

    const deltaTime = 0.05; // 1 tick à 20Hz
    updatePlayerPosition(player, 1, 1, deltaTime, []);

    const expectedDelta = Math.SQRT1_2 * GAME_CONFIG.PLAYER_SPEED * deltaTime;
    assert.ok(Math.abs(player.x - (500 + expectedDelta)) < 0.001, 'Déplacement X normalisé en diagonale');
    assert.ok(Math.abs(player.y - (500 + expectedDelta)) < 0.001, 'Déplacement Y normalisé en diagonale');
  });

  it('6. updatePlayerPosition permet de glisser le long d\'un mur vertical', () => {
    GAME_CONFIG.MAP_WIDTH = 1000;
    GAME_CONFIG.MAP_HEIGHT = 1000;

    const player: Player = {
      id: 'p1',
      name: 'TestProp',
      role: PlayerRole.PROP,
      x: 185,
      y: 200,
      health: 100,
      isLocked: false
    };

    // Mur juste à droite (x = 200)
    const wall: Rectangle[] = [{ x: 200, y: 150, width: 32, height: 100 }];
    updatePlayerPosition(player, 1, 1, 0.05, wall);

    // X reste bloqué devant le mur, mais Y continue de glisser vers le bas
    assert.strictEqual(player.x, 185, 'X bloqué par le mur');
    assert.ok(player.y > 200, 'Y continue de glisser le long du mur');
  });

  it('7. parseTiledCollisions extrait les tuiles de collision même dans un groupe imbriqué', () => {
    const fakeTiledMap = {
      width: 3,
      tilewidth: 32,
      tileheight: 32,
      layers: [
        { type: 'tilelayer', name: 'Ground', data: [1, 1, 1, 1, 1, 1, 1, 1, 1] },
        {
          type: 'group',
          name: 'World',
          layers: [
            { type: 'tilelayer', name: 'Collision', data: [0, 5, 0, 0, 0, 5, 0, 0, 0] }
          ]
        }
      ]
    };

    const obstacles = parseTiledCollisions(fakeTiledMap);
    assert.strictEqual(obstacles.length, 2);
    assert.deepStrictEqual(obstacles[0], { x: 32, y: 0, width: 32, height: 32 });
    assert.deepStrictEqual(obstacles[1], { x: 64, y: 32, width: 32, height: 32 });
  });

  it('8. parseTiledCollisions retourne un tableau vide si aucun calque Collision n\'existe', () => {
    const emptyMap = {
      width: 2,
      tilewidth: 32,
      tileheight: 32,
      layers: [{ type: 'tilelayer', name: 'Ground', data: [1, 1, 1, 1] }]
    };

    const obstacles = parseTiledCollisions(emptyMap);
    assert.deepStrictEqual(obstacles, []);
  });

});

