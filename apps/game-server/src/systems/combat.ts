import {
    WeaponType,
    WEAPONS,
    WEAPON_ORDER,
    getPlayerHurtbox,
    isAlive,
    PlayerRole,
    type Player,
    type Rectangle,
    type WeaponStatePayload
} from '@prop-hunt/shared';

// =========================================================================
// SYSTÈME DE COMBAT AUTORITAIRE
// Le client envoie seulement "je tire avec telle arme vers tel point".
// Tout le reste (droit de tirer, munitions, délais, qui est touché, dégâts)
// est calculé ici, côté serveur.
// =========================================================================

/** Hauteur (en px) à laquelle le chasseur tient son arme par rapport à ses pieds */
export const WEAPON_HOLD_OFFSET_Y = 14;

export interface Point {
    x: number;
    y: number;
}

/**
 * Intersection segment / rectangle (méthode des "slabs").
 * Retourne la fraction t ∈ [0, 1] du segment à laquelle on entre dans le rectangle,
 * 0 si le départ est déjà dedans, ou null s'il n'y a pas d'intersection.
 */
export function segmentRectIntersection(from: Point, to: Point, rect: Rectangle): number | null {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let tMin = 0;
    let tMax = 1;

    const axes: [number, number, number, number][] = [
        [from.x, dx, rect.x, rect.x + rect.width],
        [from.y, dy, rect.y, rect.y + rect.height]
    ];

    for (const [origin, delta, min, max] of axes) {
        if (Math.abs(delta) < 1e-9) {
            if (origin < min || origin > max) return null; // Parallèle et en dehors
        } else {
            let t1 = (min - origin) / delta;
            let t2 = (max - origin) / delta;
            if (t1 > t2) [t1, t2] = [t2, t1];
            tMin = Math.max(tMin, t1);
            tMax = Math.min(tMax, t2);
            if (tMin > tMax) return null;
        }
    }
    return tMin;
}

/** Première intersection du segment avec un mur, ou null si la ligne est dégagée */
export function firstWallHit(from: Point, to: Point, obstacles: Rectangle[]): number | null {
    let closest: number | null = null;
    for (const wall of obstacles) {
        const t = segmentRectIntersection(from, to, wall);
        if (t !== null && (closest === null || t < closest)) closest = t;
    }
    return closest;
}

export function hasLineOfSight(from: Point, to: Point, obstacles: Rectangle[]): boolean {
    const t = firstWallHit(from, to, obstacles);
    return t === null || t >= 0.999;
}

/** Point du rectangle le plus proche d'un point donné */
export function closestPointOnRect(p: Point, rect: Rectangle): Point {
    return {
        x: Math.max(rect.x, Math.min(p.x, rect.x + rect.width)),
        y: Math.max(rect.y, Math.min(p.y, rect.y + rect.height))
    };
}

/** Point de départ d'une attaque (l'arme dans la main du chasseur) */
export function getAttackOrigin(attacker: Player): Point {
    return { x: attacker.x, y: attacker.y - WEAPON_HOLD_OFFSET_Y };
}

/** Joueurs qu'un chasseur peut blesser : les props vivants (pas de tir allié) */
function getDamageableTargets(players: Iterable<Player>, attackerId: string): Player[] {
    const targets: Player[] = [];
    for (const p of players) {
        if (p.id !== attackerId && p.role === PlayerRole.PROP && isAlive(p)) targets.push(p);
    }
    return targets;
}

function hurtboxOf(p: Player): Rectangle {
    const prop = 'currentProp' in p ? p.currentProp : undefined;
    const variantIndex = 'variantIndex' in p ? p.variantIndex ?? 0 : 0;
    return getPlayerHurtbox(p.x, p.y, prop, variantIndex);
}

export interface AttackResult {
    origin: Point;
    impact: Point;
    hits: { playerId: string; damage: number }[];
}

/**
 * PISTOLET : tir instantané en ligne droite (hitscan).
 * Touche le premier prop sur la trajectoire, sauf si un mur est plus proche.
 */
export function resolvePistolShot(attacker: Player, aim: Point, players: Iterable<Player>, obstacles: Rectangle[]): AttackResult {
    const weapon = WEAPONS[WeaponType.PISTOL];
    const origin = getAttackOrigin(attacker);
    const dist = Math.hypot(aim.x - origin.x, aim.y - origin.y) || 1;
    const end = {
        x: origin.x + ((aim.x - origin.x) / dist) * weapon.range,
        y: origin.y + ((aim.y - origin.y) / dist) * weapon.range
    };

    const wallT = firstWallHit(origin, end, obstacles);
    let bestT = wallT ?? 1;
    let hitId: string | null = null;

    for (const target of getDamageableTargets(players, attacker.id)) {
        const t = segmentRectIntersection(origin, end, hurtboxOf(target));
        if (t !== null && t < bestT) {
            bestT = t;
            hitId = target.id;
        }
    }

    return {
        origin,
        impact: { x: origin.x + (end.x - origin.x) * bestT, y: origin.y + (end.y - origin.y) * bestT },
        hits: hitId ? [{ playerId: hitId, damage: weapon.damage }] : []
    };
}

/**
 * PIED DE BICHE : coup au corps à corps dans un arc devant le chasseur.
 * Frappe le prop le plus proche dans l'arc et à portée, si aucun mur ne s'interpose.
 */
export function resolveMeleeHit(attacker: Player, aim: Point, players: Iterable<Player>, obstacles: Rectangle[]): AttackResult {
    const weapon = WEAPONS[WeaponType.CROWBAR];
    const origin = getAttackOrigin(attacker);
    const aimAngle = Math.atan2(aim.y - origin.y, aim.x - origin.x);
    const halfArc = ((weapon.arcDegrees ?? 90) * Math.PI) / 360;

    let best: { id: string; dist: number; point: Point } | null = null;
    for (const target of getDamageableTargets(players, attacker.id)) {
        const point = closestPointOnRect(origin, hurtboxOf(target));
        const dist = Math.hypot(point.x - origin.x, point.y - origin.y);
        if (dist > weapon.range) continue;

        // Si on est collé au prop (distance quasi nulle), l'angle n'a plus de sens : on le touche
        if (dist > 4) {
            const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
            let diff = Math.abs(angle - aimAngle);
            if (diff > Math.PI) diff = 2 * Math.PI - diff;
            if (diff > halfArc) continue;
        }
        if (!hasLineOfSight(origin, point, obstacles)) continue;
        if (!best || dist < best.dist) best = { id: target.id, dist, point };
    }

    const swingPoint = {
        x: origin.x + Math.cos(aimAngle) * weapon.range,
        y: origin.y + Math.sin(aimAngle) * weapon.range
    };
    return {
        origin,
        impact: best ? best.point : swingPoint,
        hits: best ? [{ playerId: best.id, damage: weapon.damage }] : []
    };
}

/**
 * GRENADE : calcule le point d'atterrissage (limité par la portée et arrêté par les murs).
 */
export function computeGrenadeLanding(attacker: Player, aim: Point, obstacles: Rectangle[]): { origin: Point; landing: Point } {
    const weapon = WEAPONS[WeaponType.GRENADE];
    const origin = getAttackOrigin(attacker);
    const dist = Math.hypot(aim.x - origin.x, aim.y - origin.y);
    const travel = Math.min(dist, weapon.range);
    const dirX = dist > 0 ? (aim.x - origin.x) / dist : 0;
    const dirY = dist > 0 ? (aim.y - origin.y) / dist : 0;
    let landing = { x: origin.x + dirX * travel, y: origin.y + dirY * travel };

    const wallT = firstWallHit(origin, landing, obstacles);
    if (wallT !== null) {
        // La grenade rebondit sur le mur : on la pose juste devant (4 px de marge)
        const stopDist = Math.max(0, travel * wallT - 4);
        landing = { x: origin.x + dirX * stopDist, y: origin.y + dirY * stopDist };
    }
    return { origin, landing };
}

/**
 * GRENADE : dégâts de zone, dégressifs avec la distance, bloqués par les murs.
 */
export function resolveExplosion(center: Point, attackerId: string, players: Iterable<Player>, obstacles: Rectangle[]): { playerId: string; damage: number }[] {
    const weapon = WEAPONS[WeaponType.GRENADE];
    const radius = weapon.blastRadius ?? 80;
    const edgeRatio = weapon.edgeDamageRatio ?? 0.35;
    const hits: { playerId: string; damage: number }[] = [];

    for (const target of getDamageableTargets(players, attackerId)) {
        const point = closestPointOnRect(center, hurtboxOf(target));
        const dist = Math.hypot(point.x - center.x, point.y - center.y);
        if (dist > radius) continue;
        if (!hasLineOfSight(center, point, obstacles)) continue;
        const falloff = 1 - (1 - edgeRatio) * (dist / radius);
        hits.push({ playerId: target.id, damage: Math.round(weapon.damage * falloff) });
    }
    return hits;
}

// =========================================================================
// ARSENAL D'UN CHASSEUR : munitions, rechargement et délais entre deux attaques
// =========================================================================

export type UseRefusal = 'COOLDOWN' | 'RELOADING' | 'NO_AMMO';

export class HunterArsenal {
    private ammo: number;
    private reloadEndsAt = 0;
    private readonly nextUseAt = new Map<WeaponType, number>();

    constructor() {
        this.ammo = WEAPONS[WeaponType.PISTOL].magazineSize ?? 0;
    }

    /** Termine un rechargement si son délai est écoulé. Retourne true si l'état a changé. */
    public update(now: number): boolean {
        if (this.reloadEndsAt > 0 && now >= this.reloadEndsAt) {
            this.ammo = WEAPONS[WeaponType.PISTOL].magazineSize ?? 0;
            this.reloadEndsAt = 0;
            return true;
        }
        return false;
    }

    public getAmmo(): number {
        return this.ammo;
    }

    public isReloading(now: number): boolean {
        return this.reloadEndsAt > now;
    }

    /** Vérifie si l'arme peut être utilisée maintenant (null = autorisé) */
    public checkUse(weapon: WeaponType, now: number): UseRefusal | null {
        this.update(now);
        if (now < (this.nextUseAt.get(weapon) ?? 0)) return 'COOLDOWN';
        if (weapon === WeaponType.PISTOL) {
            if (this.isReloading(now)) return 'RELOADING';
            if (this.ammo <= 0) return 'NO_AMMO';
        }
        return null;
    }

    /** Consomme une utilisation (à appeler après checkUse). Recharge automatiquement un chargeur vide. */
    public consume(weapon: WeaponType, now: number): void {
        this.nextUseAt.set(weapon, now + WEAPONS[weapon].cooldownMs);
        if (weapon === WeaponType.PISTOL) {
            this.ammo = Math.max(0, this.ammo - 1);
            if (this.ammo === 0) this.startReload(now);
        }
    }

    /** Lance un rechargement du pistolet. Retourne false s'il est déjà plein ou en cours. */
    public startReload(now: number): boolean {
        const magazine = WEAPONS[WeaponType.PISTOL].magazineSize ?? 0;
        if (this.isReloading(now) || this.ammo >= magazine) return false;
        this.reloadEndsAt = now + (WEAPONS[WeaponType.PISTOL].reloadMs ?? 0);
        return true;
    }

    public getState(now: number): WeaponStatePayload {
        this.update(now);
        return {
            weapons: WEAPON_ORDER.map(weapon => {
                const def = WEAPONS[weapon];
                return {
                    weapon,
                    ammo: def.magazineSize !== undefined ? this.ammo : undefined,
                    magazineSize: def.magazineSize,
                    cooldownRemainingMs: Math.max(0, (this.nextUseAt.get(weapon) ?? 0) - now),
                    reloadRemainingMs: weapon === WeaponType.PISTOL ? Math.max(0, this.reloadEndsAt - now) : 0
                };
            })
        };
    }
}
