import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  PlayerRole,
  WeaponType,
  WEAPONS,
  DEFAULT_PROPS,
  getNextSpectateTarget,
  isAlive,
  type Player,
  type Rectangle
} from '@prop-hunt/shared';
import {
  segmentRectIntersection,
  hasLineOfSight,
  resolvePistolShot,
  resolveMeleeHit,
  computeGrenadeLanding,
  resolveExplosion,
  HunterArsenal,
  WEAPON_HOLD_OFFSET_Y
} from '../src/systems/combat.js';

const chair = DEFAULT_PROPS.find(p => p.internalName === 'prop_chair')!;

function hunter(x: number, y: number, id = 'hunter'): Player {
  return { id, name: id, x, y, health: 100, maxHealth: 100, role: PlayerRole.HUNTER };
}

function prop(x: number, y: number, id: string, health = chair.health): Player {
  return {
    id, name: id, x, y, health, maxHealth: chair.health,
    role: PlayerRole.PROP, isLocked: false, currentProp: chair, variantIndex: 0
  };
}

describe('Système de combat autoritaire', () => {

  it('1. segmentRectIntersection détecte l\'entrée dans un rectangle', () => {
    const rect: Rectangle = { x: 10, y: -5, width: 10, height: 10 };
    assert.strictEqual(segmentRectIntersection({ x: 0, y: 0 }, { x: 40, y: 0 }, rect), 0.25);
    assert.strictEqual(segmentRectIntersection({ x: 0, y: 20 }, { x: 40, y: 20 }, rect), null, 'Passe à côté');
    assert.strictEqual(segmentRectIntersection({ x: 0, y: 0 }, { x: 5, y: 0 }, rect), null, 'S\'arrête avant');
    assert.strictEqual(segmentRectIntersection({ x: 15, y: 0 }, { x: 40, y: 0 }, rect), 0, 'Départ à l\'intérieur');
  });

  it('2. Un mur bloque la ligne de vue', () => {
    const wall: Rectangle = { x: 50, y: -50, width: 10, height: 100 };
    assert.strictEqual(hasLineOfSight({ x: 0, y: 0 }, { x: 100, y: 0 }, [wall]), false);
    assert.strictEqual(hasLineOfSight({ x: 0, y: 0 }, { x: 40, y: 0 }, [wall]), true);
  });

  it('3. Pistolet : touche le premier prop sur la trajectoire', () => {
    const h = hunter(100, 100);
    const near = prop(200, 100 + WEAPON_HOLD_OFFSET_Y, 'near');
    const far = prop(300, 100 + WEAPON_HOLD_OFFSET_Y, 'far');
    const result = resolvePistolShot(h, { x: 400, y: 100 - WEAPON_HOLD_OFFSET_Y }, [h, near, far], []);
    assert.deepStrictEqual(result.hits, [{ playerId: 'near', damage: WEAPONS[WeaponType.PISTOL].damage }]);
  });

  it('4. Pistolet : un mur protège le prop, et un tir raté ne touche personne', () => {
    const h = hunter(100, 100);
    const target = prop(250, 100 + WEAPON_HOLD_OFFSET_Y, 'target');
    const wall: Rectangle = { x: 170, y: 0, width: 20, height: 200 };
    const aim = { x: 400, y: 100 - WEAPON_HOLD_OFFSET_Y };
    assert.strictEqual(resolvePistolShot(h, aim, [h, target], [wall]).hits.length, 0, 'Bloqué par le mur');
    assert.strictEqual(resolvePistolShot(h, { x: 100, y: 400 }, [h, target], []).hits.length, 0, 'Tir dans le vide');
  });

  it('5. Pistolet : portée limitée, pas de tir allié, pas de dégâts aux morts', () => {
    const h = hunter(0, 100);
    const aim = { x: 1000, y: 100 - WEAPON_HOLD_OFFSET_Y };
    const outOfRange = prop(WEAPONS[WeaponType.PISTOL].range + 60, 100 + WEAPON_HOLD_OFFSET_Y, 'far');
    const otherHunter = hunter(100, 100 + WEAPON_HOLD_OFFSET_Y, 'h2');
    const dead: Player = { ...prop(150, 100 + WEAPON_HOLD_OFFSET_Y, 'dead'), health: 0 };
    assert.strictEqual(resolvePistolShot(h, aim, [h, outOfRange, otherHunter, dead], []).hits.length, 0);
  });

  it('6. Pied de biche : touche seulement à portée et devant le chasseur', () => {
    const h = hunter(100, 100);
    const front = prop(140, 100, 'front');
    const behind = prop(60, 100, 'behind');
    const result = resolveMeleeHit(h, { x: 300, y: 100 - WEAPON_HOLD_OFFSET_Y }, [h, front, behind], []);
    assert.deepStrictEqual(result.hits.map(x => x.playerId), ['front']);

    const tooFar = prop(250, 100, 'tooFar');
    assert.strictEqual(resolveMeleeHit(h, { x: 300, y: 100 }, [h, tooFar], []).hits.length, 0);
  });

  it('7. Grenade : portée limitée et arrêtée par les murs', () => {
    const h = hunter(0, 100 + WEAPON_HOLD_OFFSET_Y);
    const range = WEAPONS[WeaponType.GRENADE].range;
    const { landing } = computeGrenadeLanding(h, { x: 2000, y: 100 }, []);
    assert.ok(Math.abs(landing.x - range) < 0.001, 'Limitée à la portée max');

    const wall: Rectangle = { x: 100, y: 0, width: 20, height: 200 };
    const blocked = computeGrenadeLanding(h, { x: 2000, y: 100 }, [wall]).landing;
    assert.ok(blocked.x < 100, 'S\'arrête devant le mur');
  });

  it('8. Grenade : dégâts dégressifs, zone limitée et murs protecteurs', () => {
    const center = { x: 200, y: 200 };
    const onTop = prop(200, 200, 'onTop');
    const edge = prop(200 + 60, 200, 'edge');
    const outside = prop(500, 200, 'outside');
    const hits = resolveExplosion(center, 'hunter', [onTop, edge, outside], []);
    const byId = Object.fromEntries(hits.map(h => [h.playerId, h.damage]));
    assert.strictEqual(byId.onTop, WEAPONS[WeaponType.GRENADE].damage);
    assert.ok(byId.edge > 0 && byId.edge < byId.onTop, 'Moins de dégâts en bordure');
    assert.strictEqual(byId.outside, undefined);

    const wall: Rectangle = { x: 215, y: 0, width: 10, height: 400 };
    const shielded = resolveExplosion(center, 'hunter', [edge], [wall]);
    assert.strictEqual(shielded.length, 0, 'Le mur protège de l\'explosion');
  });

  it('9. Arsenal : chargeur, délai entre tirs et rechargement automatique', () => {
    const arsenal = new HunterArsenal();
    const pistol = WEAPONS[WeaponType.PISTOL];
    let now = 1000;

    assert.strictEqual(arsenal.checkUse(WeaponType.PISTOL, now), null);
    arsenal.consume(WeaponType.PISTOL, now);
    assert.strictEqual(arsenal.checkUse(WeaponType.PISTOL, now + 10), 'COOLDOWN');

    for (let i = 1; i < pistol.magazineSize!; i++) {
      now += pistol.cooldownMs;
      assert.strictEqual(arsenal.checkUse(WeaponType.PISTOL, now), null);
      arsenal.consume(WeaponType.PISTOL, now);
    }
    assert.strictEqual(arsenal.getAmmo(), 0);
    now += pistol.cooldownMs;
    assert.strictEqual(arsenal.checkUse(WeaponType.PISTOL, now), 'RELOADING', 'Rechargement auto quand vide');

    now += pistol.reloadMs!;
    assert.strictEqual(arsenal.checkUse(WeaponType.PISTOL, now), null);
    assert.strictEqual(arsenal.getAmmo(), pistol.magazineSize);
  });

  it('10. Arsenal : la grenade a un long délai, indépendant du pistolet', () => {
    const arsenal = new HunterArsenal();
    arsenal.consume(WeaponType.GRENADE, 0);
    assert.strictEqual(arsenal.checkUse(WeaponType.GRENADE, 5000), 'COOLDOWN');
    assert.strictEqual(arsenal.checkUse(WeaponType.PISTOL, 5000), null);
    assert.strictEqual(arsenal.checkUse(WeaponType.GRENADE, WEAPONS[WeaponType.GRENADE].cooldownMs), null);

    const state = arsenal.getState(5000).weapons.find(w => w.weapon === WeaponType.GRENADE)!;
    assert.strictEqual(state.cooldownRemainingMs, WEAPONS[WeaponType.GRENADE].cooldownMs - 5000);
  });

  it('11. Mode spectateur : isAlive et changement de cible', () => {
    assert.strictEqual(isAlive({ role: PlayerRole.PROP, health: 10 }), true);
    assert.strictEqual(isAlive({ role: PlayerRole.SPECTATOR, health: 10 }), false);
    assert.strictEqual(isAlive({ role: PlayerRole.HUNTER, health: 0 }), false);

    assert.strictEqual(getNextSpectateTarget([], null), null);
    assert.strictEqual(getNextSpectateTarget(['b', 'a', 'c'], null), 'a');
    assert.strictEqual(getNextSpectateTarget(['a', 'b', 'c'], 'c', 1), 'a', 'Boucle à la fin');
    assert.strictEqual(getNextSpectateTarget(['a', 'b', 'c'], 'a', -1), 'c', 'Boucle au début');
    assert.strictEqual(getNextSpectateTarget(['a', 'b'], 'gone'), 'a', 'Cible disparue');
  });
});
