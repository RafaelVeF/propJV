import { WeaponType, WEAPONS } from '@prop-hunt/shared';

/**
 * Effets visuels éphémères du combat et des morts.
 * Ils sont purement cosmétiques : le résultat des attaques est décidé par le serveur.
 */

export const DEATH_EFFECT_DURATION = 1600;

interface Tracer { x1: number; y1: number; x2: number; y2: number; hit: boolean; at: number; }
interface Swing { x: number; y: number; angle: number; hit: boolean; at: number; }
interface FlyingGrenade { id: string; x1: number; y1: number; x2: number; y2: number; at: number; fuseMs: number; }
interface Explosion { x: number; y: number; radius: number; at: number; }
interface DamageNumber { x: number; y: number; text: string; at: number; color: string; }
interface DeathEffect { x: number; y: number; at: number; name: string; particles: { vx: number; vy: number; size: number; color: string }[]; }

export class CombatEffects {
  readonly tracers: Tracer[] = [];
  readonly swings: Swing[] = [];
  readonly grenades: FlyingGrenade[] = [];
  readonly explosions: Explosion[] = [];
  readonly damageNumbers: DamageNumber[] = [];
  readonly deathEffects: DeathEffect[] = [];
  /** Dernière arme / direction connue de chaque chasseur (pour orienter le canon du drone) */
  readonly hunterAim = new Map<string, { angle: number; weapon: WeaponType; readyAt: number }>();
  /** Heure de la dernière touche confirmée par le serveur pour le joueur local (hit marker) */
  hitMarkerAt = 0;

  /** Une attaque a été validée par le serveur : on lance l'effet correspondant depuis la bouche du drone */
  public addShot(shot: {
    hunterId: string; weapon: WeaponType;
    originX: number; originY: number; impactX: number; impactY: number;
    angle?: number;
    hit: boolean; grenadeId?: string; fuseMs?: number;
  }): void {
    const now = Date.now();
    const angle = shot.angle ?? Math.atan2(shot.impactY - shot.originY, shot.impactX - shot.originX);
    const readyAt = now + WEAPONS[shot.weapon].cooldownMs;
    this.hunterAim.set(shot.hunterId, { angle, weapon: shot.weapon, readyAt });

    if (shot.weapon === WeaponType.PISTOL) {
      this.tracers.push({ x1: shot.originX, y1: shot.originY, x2: shot.impactX, y2: shot.impactY, hit: shot.hit, at: now });
    } else if (shot.weapon === WeaponType.CROWBAR) {
      this.swings.push({ x: shot.originX, y: shot.originY, angle, hit: shot.hit, at: now });
    } else if (shot.weapon === WeaponType.GRENADE) {
      this.grenades.push({
        id: shot.grenadeId ?? `${shot.hunterId}-${now}`,
        x1: shot.originX, y1: shot.originY, x2: shot.impactX, y2: shot.impactY,
        at: now, fuseMs: shot.fuseMs ?? 1200
      });
    }
  }

  public addExplosion(grenadeId: string, x: number, y: number, radius: number): void {
    const idx = this.grenades.findIndex(g => g.id === grenadeId);
    if (idx >= 0) this.grenades.splice(idx, 1);
    this.explosions.push({ x, y, radius, at: Date.now() });
  }

  public addDamageNumber(x: number, y: number, damage: number, color = '#fca5a5'): void {
    this.damageNumbers.push({ x: x + (Math.random() - 0.5) * 10, y, text: `-${damage}`, at: Date.now(), color });
  }

  public spawnDeathEffect(x: number, y: number, name: string): void {
    const colors = ['#a3a3a3', '#78716c', '#d6d3d1', '#ef4444', '#57534e'];
    const particles = Array.from({ length: 18 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 45;
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25, size: 2 + Math.random() * 3, color: colors[Math.floor(Math.random() * colors.length)] };
    });
    this.deathEffects.push({ x, y, at: Date.now(), name, particles });
  }

  /** Nouvelle manche : on oublie les grenades et les armes en main de la manche précédente */
  public resetRound(): void {
    this.hunterAim.clear();
    this.grenades.length = 0;
  }

  /** Dessine tous les effets en coordonnées monde (et supprime ceux qui sont terminés) */
  public draw(ctx: CanvasRenderingContext2D): void {
    const now = Date.now();
    const { tracers, swings, grenades, explosions, deathEffects, damageNumbers } = this;

    // B. Traînées de balles du pistolet
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      const life = (now - t.at) / 260;
      if (life >= 1) { tracers.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = 1 - life;
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(t.x1, t.y1);
      ctx.lineTo(t.x2, t.y2);
      ctx.stroke();
      // Flash au canon et impact
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(t.x1, t.y1, 4 * (1 - life), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = t.hit ? '#ef4444' : '#a3a3a3';
      ctx.beginPath();
      ctx.arc(t.x2, t.y2, 3 + life * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // C. Onde rouge en arc de cercle qui se propage (Canon à ondes / KAK)
    for (let i = swings.length - 1; i >= 0; i--) {
      const sw = swings[i];
      const life = (now - sw.at) / 260;
      if (life >= 1) { swings.splice(i, 1); continue; }
      const def = WEAPONS[WeaponType.CROWBAR];
      const maxR = def.range;
      const half = ((def.arcDegrees ?? 100) * Math.PI) / 360;
      const start = sw.angle - half;
      const end = sw.angle + half;

      ctx.save();
      const coneR = 10 + (maxR - 10) * Math.min(1, life * 1.15);
      ctx.fillStyle = `rgba(239, 68, 68, ${0.16 * (1 - life)})`;
      ctx.beginPath();
      ctx.moveTo(sw.x, sw.y);
      ctx.arc(sw.x, sw.y, coneR, start, end);
      ctx.closePath();
      ctx.fill();

      const waveOffsets = [0, 0.22, 0.44];
      waveOffsets.forEach((off, idx) => {
        if (life <= off) return;
        const p = Math.min(1, (life - off) / (1 - off));
        const r = 8 + (maxR - 8) * p;
        ctx.globalAlpha = (1 - p) * (idx === 0 ? 0.95 : 0.7);
        ctx.strokeStyle = idx === 0 ? '#ef4444' : '#fca5a5';
        ctx.lineWidth = idx === 0 ? 3.2 : 2;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, r, start, end);
        ctx.stroke();
      });
      ctx.restore();
    }

    // D. Grenades en vol puis au sol (clignotement avant explosion)
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      const elapsed = now - g.at;
      if (elapsed > g.fuseMs + 1000) { grenades.splice(i, 1); continue; } // Sécurité si l'explosion est perdue
      const flight = Math.min(1, elapsed / 350);
      const gx = g.x1 + (g.x2 - g.x1) * flight;
      const gy = g.y1 + (g.y2 - g.y1) * flight - Math.sin(flight * Math.PI) * 24; // Petite parabole
      ctx.save();
      if (flight >= 1) {
        const blink = Math.floor(elapsed / Math.max(60, 200 - elapsed / 8)) % 2 === 0;
        ctx.fillStyle = blink ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.08)';
        ctx.beginPath();
        ctx.arc(g.x2, g.y2, WEAPONS[WeaponType.GRENADE].blastRadius ?? 80, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#3f6212';
      ctx.strokeStyle = '#1a2e05';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(gx, gy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // E. Explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
      const ex = explosions[i];
      const life = (now - ex.at) / 600;
      if (life >= 1) { explosions.splice(i, 1); continue; }
      ctx.save();
      const r = ex.radius * (0.3 + 0.7 * Math.min(1, life * 2.5));
      const gradient = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r);
      gradient.addColorStop(0, `rgba(255, 237, 160, ${0.9 * (1 - life)})`);
      gradient.addColorStop(0.4, `rgba(251, 146, 60, ${0.75 * (1 - life)})`);
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - life)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius * life, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // F. Effets de mort (débris + nom qui s'envole)
    for (let i = deathEffects.length - 1; i >= 0; i--) {
      const fx = deathEffects[i];
      const elapsed = now - fx.at;
      if (elapsed > DEATH_EFFECT_DURATION) { deathEffects.splice(i, 1); continue; }
      const t = elapsed / 1000;
      const progress = elapsed / DEATH_EFFECT_DURATION;
      ctx.save();
      ctx.globalAlpha = 1 - progress;
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, 6 + progress * 34, 0, Math.PI * 2);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2 * (1 - progress) + 0.5;
      ctx.stroke();
      fx.particles.forEach(pt => {
        const px = fx.x + pt.vx * t;
        const py = fx.y + pt.vy * t + 40 * t * t;
        ctx.fillStyle = pt.color;
        ctx.fillRect(px - pt.size / 2, py - pt.size / 2, pt.size, pt.size);
      });
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      const textY = fx.y - 30 - progress * 20;
      ctx.strokeText(`✝ ${fx.name}`, fx.x, textY);
      ctx.fillStyle = '#fca5a5';
      ctx.fillText(`✝ ${fx.name}`, fx.x, textY);
      ctx.restore();
    }

    // G. Chiffres de dégâts
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      const life = (now - dn.at) / 900;
      if (life >= 1) { damageNumbers.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = 1 - life * life;
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      const y = dn.y - life * 22;
      ctx.strokeText(dn.text, dn.x, y);
      ctx.fillStyle = dn.color;
      ctx.fillText(dn.text, dn.x, y);
      ctx.restore();
    }
  }
}
