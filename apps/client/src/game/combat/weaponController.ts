import {
  GamePhase,
  MessageType,
  PlayerRole,
  WeaponType,
  WEAPONS,
  WEAPON_ORDER,
  type HunterShootPayload,
  type WeaponStatePayload
} from '@prop-hunt/shared';
import { networkManager } from '../../network/networkManager';
import { isLocalHunterArmed, screenToWorld, type GameState } from '../state';
import type { CombatEffects } from './combatEffects';
import { drawHeldWeapon, HOLD_OFFSET_Y } from './weaponSprites';

/** Copie locale de l'état officiel d'une arme (échéances converties en heure locale) */
interface WeaponView {
  ammo?: number;
  magazineSize?: number;
  cooldownEndsAt: number;
  reloadEndsAt: number;
}

/**
 * Armes du chasseur local : sélection, munitions, envoi des attaques et barre d'armes.
 * Le client envoie seulement son intention de tir, le serveur décide du résultat.
 */
export class WeaponController {
  public selectedWeapon: WeaponType = WeaponType.PISTOL;
  private readonly weaponView = new Map<WeaponType, WeaponView>();
  private readonly weaponSlots = new Map<WeaponType, { root: HTMLElement; info: HTMLElement; progress: HTMLElement }>();

  constructor(
    private readonly state: GameState,
    private readonly canvas: HTMLCanvasElement,
    private readonly weaponHud: HTMLElement | null,
    private readonly weaponImages: Map<WeaponType, HTMLImageElement>
  ) {
    weaponHud?.querySelectorAll<HTMLElement>('.weapon-slot').forEach(el => {
      this.weaponSlots.set(el.dataset.weapon as WeaponType, {
        root: el,
        info: el.querySelector('.weapon-slot-info') as HTMLElement,
        progress: el.querySelector('.weapon-slot-progress') as HTMLElement
      });
    });
    this.resetView();
  }

  /** Chargeurs pleins et aucun délai (début de manche) */
  public resetView(): void {
    WEAPON_ORDER.forEach(type => {
      this.weaponView.set(type, {
        ammo: WEAPONS[type].magazineSize,
        magazineSize: WEAPONS[type].magazineSize,
        cooldownEndsAt: 0,
        reloadEndsAt: 0
      });
    });
  }

  /** Applique l'état officiel envoyé par le serveur (durées relatives -> heure locale) */
  public applyServerState(payload: WeaponStatePayload): void {
    const now = Date.now();
    payload.weapons.forEach(w => {
      this.weaponView.set(w.weapon, {
        ammo: w.ammo,
        magazineSize: w.magazineSize,
        cooldownEndsAt: now + w.cooldownRemainingMs,
        reloadEndsAt: now + w.reloadRemainingMs
      });
    });
    this.updateHud();
  }

  public select(type: WeaponType): void {
    this.selectedWeapon = type;
    this.updateHud();
  }

  public cycle(direction: 1 | -1): void {
    const idx = WEAPON_ORDER.indexOf(this.selectedWeapon);
    this.select(WEAPON_ORDER[(idx + direction + WEAPON_ORDER.length) % WEAPON_ORDER.length]);
  }

  /** Arme associée à une touche (1, 2, 3...) */
  public static weaponForKey(key: string): WeaponType | undefined {
    return WEAPON_ORDER.find(type => String(WEAPONS[type].slot) === key);
  }

  /** Vérification locale, uniquement pour éviter d'envoyer des tirs inutiles (le serveur revérifie tout) */
  public isReady(type: WeaponType, now = Date.now()): boolean {
    const view = this.weaponView.get(type);
    if (!view) return false;
    if (now < view.cooldownEndsAt) return false;
    if (type === WeaponType.PISTOL && (now < view.reloadEndsAt || (view.ammo ?? 0) <= 0)) return false;
    return true;
  }

  /** Progression du rechargement du pistolet (0 à 1), ou null s'il ne recharge pas */
  public getReloadProgress(now = Date.now()): number | null {
    const pistol = this.weaponView.get(WeaponType.PISTOL);
    if (!pistol || now >= pistol.reloadEndsAt) return null;
    return 1 - (pistol.reloadEndsAt - now) / (WEAPONS[WeaponType.PISTOL].reloadMs ?? 1);
  }

  /** Attaque avec l'arme sélectionnée vers la position de la souris */
  public tryAttack(): void {
    if (!isLocalHunterArmed(this.state) || this.state.currentPhase !== GamePhase.HUNTING) return;
    if (!networkManager.localPlayerId) return;
    const now = Date.now();
    if (!this.isReady(this.selectedWeapon, now)) return;

    const target = screenToWorld(this.state, this.canvas, this.state.mouse.x, this.state.mouse.y);
    networkManager.send<HunterShootPayload>(MessageType.HUNTER_SHOOT, {
      weapon: this.selectedWeapon,
      targetX: target.x,
      targetY: target.y
    });

    // Prédiction locale du délai (corrigée par le WEAPON_STATE du serveur)
    const view = this.weaponView.get(this.selectedWeapon)!;
    view.cooldownEndsAt = now + WEAPONS[this.selectedWeapon].cooldownMs;
    if (this.selectedWeapon === WeaponType.PISTOL && view.ammo !== undefined) {
      view.ammo = Math.max(0, view.ammo - 1);
      if (view.ammo === 0) view.reloadEndsAt = now + (WEAPONS[WeaponType.PISTOL].reloadMs ?? 0);
    }
    this.updateHud();
  }

  public requestReload(): void {
    const view = this.weaponView.get(WeaponType.PISTOL);
    if (!isLocalHunterArmed(this.state) || !view) return;
    if (view.ammo === view.magazineSize || Date.now() < view.reloadEndsAt) return;
    networkManager.send(MessageType.HUNTER_RELOAD, { weapon: WeaponType.PISTOL });
  }

  /** Met à jour la barre d'armes (bas droite) : arme sélectionnée, munitions, rechargement, délais */
  public updateHud(): void {
    if (!this.weaponHud) return;
    const { currentPhase } = this.state;
    const visible = isLocalHunterArmed(this.state) && currentPhase !== GamePhase.LOBBY && currentPhase !== GamePhase.ROUND_END;
    this.weaponHud.style.display = visible ? 'flex' : 'none';
    this.canvas.style.cursor = visible ? 'none' : 'default';
    if (!visible) return;

    const now = Date.now();
    WEAPON_ORDER.forEach(type => {
      const slot = this.weaponSlots.get(type);
      const view = this.weaponView.get(type);
      if (!slot || !view) return;
      const def = WEAPONS[type];
      const isSelected = type === this.selectedWeapon;
      slot.root.style.borderColor = isSelected ? '#fbbf24' : 'rgba(255,255,255,0.15)';
      slot.root.style.transform = isSelected ? 'translateY(-4px)' : 'none';

      const reloadLeft = view.reloadEndsAt - now;
      const cooldownLeft = view.cooldownEndsAt - now;
      if (type === WeaponType.PISTOL && reloadLeft > 0) {
        slot.info.textContent = 'RECHARGE...';
        slot.info.style.color = '#38bdf8';
        slot.progress.style.width = `${100 * (1 - reloadLeft / (def.reloadMs ?? 1))}%`;
      } else if (cooldownLeft > 1000) {
        // Long délai (grenade) : on affiche le compte à rebours
        slot.info.textContent = `${Math.ceil(cooldownLeft / 1000)}s`;
        slot.info.style.color = '#f87171';
        slot.progress.style.width = `${100 * (1 - cooldownLeft / def.cooldownMs)}%`;
      } else {
        slot.info.textContent = view.magazineSize !== undefined ? `${view.ammo} / ${view.magazineSize}` : 'PRÊT';
        slot.info.style.color = view.ammo === 0 ? '#f87171' : '#fbbf24';
        slot.progress.style.width = '0%';
      }
    });
  }

  /** Armes tenues par les chasseurs vivants, et aides à la visée du chasseur local (coordonnées monde) */
  public drawHeldWeapons(ctx: CanvasRenderingContext2D, effects: CombatEffects): void {
    const { player, mouse, currentPhase } = this.state;

    if (isLocalHunterArmed(this.state)) {
      const aim = screenToWorld(this.state, this.canvas, mouse.x, mouse.y);
      const angle = Math.atan2(aim.y - (player.y - HOLD_OFFSET_Y), aim.x - player.x);
      drawHeldWeapon(ctx, this.weaponImages, player.x, player.y, angle, this.selectedWeapon);

      if (mouse.inside && currentPhase === GamePhase.HUNTING) {
        this.drawAimAssist(ctx, player.x, player.y - HOLD_OFFSET_Y, aim, angle);
      }
    }

    this.state.otherPlayers.forEach((op, id) => {
      if (op.role !== PlayerRole.HUNTER || op.health <= 0) return;
      const aim = effects.hunterAim.get(id) ?? { angle: 0, weapon: WeaponType.PISTOL };
      drawHeldWeapon(ctx, this.weaponImages, op.x, op.y, aim.angle, aim.weapon);
    });
  }

  /** Zone d'explosion de la grenade, ou arc de frappe du pied de biche */
  private drawAimAssist(ctx: CanvasRenderingContext2D, ox: number, oy: number, aim: { x: number; y: number }, angle: number): void {
    ctx.save();
    if (this.selectedWeapon === WeaponType.GRENADE) {
      const def = WEAPONS[WeaponType.GRENADE];
      const dist = Math.min(def.range, Math.hypot(aim.x - ox, aim.y - oy));
      const lx = ox + Math.cos(angle) * dist;
      const ly = oy + Math.sin(angle) * dist;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = this.isReady(WeaponType.GRENADE) ? 'rgba(251, 191, 36, 0.8)' : 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(lx, ly, def.blastRadius ?? 80, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(lx, ly);
      ctx.stroke();
    } else if (this.selectedWeapon === WeaponType.CROWBAR) {
      const def = WEAPONS[WeaponType.CROWBAR];
      const half = ((def.arcDegrees ?? 90) * Math.PI) / 360;
      ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.arc(ox, oy, def.range, angle - half, angle + half);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
