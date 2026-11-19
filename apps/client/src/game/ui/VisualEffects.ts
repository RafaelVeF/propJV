/**
 * VisualEffects — Effets visuels et "Game Feel" légers (particules, dégâts flottants, vignette).
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface FloatingText {
  x: number;
  y: number;
  text: string;
  life: number;
  maxLife: number;
  color: string;
}

export class VisualEffectsManager {
  private particles: Particle[] = [];
  private floatingTexts: FloatingText[] = [];
  private damageFlashAlpha: number = 0;

  /** Effet "Poof !" lors d'une transformation en Prop. */
  public spawnTransformPoof(x: number, y: number, color: string = '#e2e8f0'): void {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.35;
      const speed = 30 + Math.random() * 55;
      const maxLife = 0.28 + Math.random() * 0.16;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 3 + Math.random() * 3.5,
        life: maxLife,
        maxLife,
        color: i % 3 === 0 ? '#38bdf8' : color
      });
    }
  }

  /** Nombre de dégâts flottant (-15) au-dessus du joueur touché. */
  public spawnFloatingDamage(x: number, y: number, damage: number): void {
    this.floatingTexts.push({
      x: x + (Math.random() - 0.5) * 12,
      y: y - 24,
      text: `-${Math.round(damage)}`,
      life: 0.75,
      maxLife: 0.75,
      color: '#f87171'
    });
  }

  /** Déclenche un léger flash rouge sur les bords de l'écran. */
  public triggerDamageFlash(): void {
    this.damageFlashAlpha = 0.45;
  }

  /** Met à jour et dessine les effets en espace monde (particules + dégâts flottants). */
  public updateAndDrawWorld(ctx: CanvasRenderingContext2D, dt: number): void {
    // 1. Particules
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;

      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * (0.6 + 0.4 * alpha), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. Textes de dégâts flottants
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.life -= dt;
      if (ft.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }
      ft.y -= 28 * dt;

      const alpha = Math.max(0, ft.life / ft.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  /** Dessine la vignette d'ambiance et le flash de dégâts en espace écran. */
  public updateAndDrawScreen(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dt: number
  ): void {
    // Vignette douce sur les bords
    const cx = width / 2;
    const cy = height / 2;
    const outerR = Math.hypot(cx, cy);
    const vignette = ctx.createRadialGradient(cx, cy, outerR * 0.45, cx, cy, outerR);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.42)');

    ctx.save();
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // Flash rouge d'impact
    if (this.damageFlashAlpha > 0) {
      const flash = ctx.createRadialGradient(cx, cy, outerR * 0.35, cx, cy, outerR);
      flash.addColorStop(0, 'rgba(239, 68, 68, 0)');
      flash.addColorStop(1, `rgba(239, 68, 68, ${this.damageFlashAlpha.toFixed(3)})`);
      ctx.fillStyle = flash;
      ctx.fillRect(0, 0, width, height);
      this.damageFlashAlpha = Math.max(0, this.damageFlashAlpha - dt * 1.4);
    }

    ctx.restore();
  }
}

