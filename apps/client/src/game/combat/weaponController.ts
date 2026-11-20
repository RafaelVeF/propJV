import {
  GamePhase,
  MessageType,
  PlayerRole,
  WeaponType,
  WEAPONS,
  WEAPON_ORDER,
  type HunterShootPayload,
  type HunterZapAimPayload,
  type WeaponStatePayload
} from '@prop-hunt/shared';
import { networkManager } from '../../network/networkManager';
import type { DroneImages } from '../assets';
import { isLocalHunterArmed, screenToWorld, type GameState } from '../state';
import type { CombatEffects } from './combatEffects';
import type { DroneController } from './droneController';
import { drawHunterDrone, HOLD_OFFSET_Y } from './weaponSprites';

/** Copie locale de l'état officiel d'une arme (échéances converties en heure locale) */
interface WeaponView {
  ammo?: number;
  magazineSize?: number;
  deployedCount?: number;
  maxDeployed?: number;
  activeEndsAt: number;
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
  private lastZapAimSentAt = 0;

  constructor(
    private readonly state: GameState,
    private readonly canvas: HTMLCanvasElement,
    private readonly weaponHud: HTMLElement | null,
    private readonly weaponImages: Map<WeaponType, HTMLImageElement>,
    private readonly droneImages: DroneImages
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
      const def = WEAPONS[type];
      this.weaponView.set(type, {
        ammo: def.magazineSize,
        magazineSize: def.magazineSize,
        deployedCount: def.maxDeployed !== undefined ? 0 : undefined,
        maxDeployed: def.maxDeployed,
        activeEndsAt: 0,
        cooldownEndsAt: 0,
        reloadEndsAt: 0
      });
    });
  }

  /** Applique l'état officiel envoyé par le serveur (durées relatives -> heure locale) */
  public applyServerState(payload: WeaponStatePayload): void {
    const now = Date.now();
    payload.weapons.forEach(w => {
      const activeMs = w.activeRemainingMs ?? 0;
      const activeEndsAt = activeMs > 0 ? now + activeMs : 0;
      this.weaponView.set(w.weapon, {
        ammo: w.ammo,
        magazineSize: w.magazineSize,
        deployedCount: w.deployedCount,
        maxDeployed: w.maxDeployed,
        activeEndsAt,
        cooldownEndsAt: (activeEndsAt || now) + w.cooldownRemainingMs,
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

  /** Arme associée à une touche (1..5, compatible AZERTY et QWERTY via event.code) */
  public static weaponForKey(key: string, code?: string): WeaponType | undefined {
    return WEAPON_ORDER.find(type => {
      const slot = String(WEAPONS[type].slot);
      return slot === key || code === `Digit${slot}` || code === `Numpad${slot}`;
    });
  }

  /** Vérification locale, uniquement pour éviter d'envoyer des tirs inutiles (le serveur revérifie tout) */
  public isReady(type: WeaponType, now = Date.now()): boolean {
    const view = this.weaponView.get(type);
    if (!view) return false;
    if (now < view.activeEndsAt) return false;
    if (now < view.cooldownEndsAt) return false;
    if (type === WeaponType.PISTOL && (now < view.reloadEndsAt || (view.ammo ?? 0) <= 0)) return false;
    if (type === WeaponType.MINE && (view.deployedCount ?? 0) >= (view.maxDeployed ?? 5)) return false;
    return true;
  }

  public isZapActive(now = Date.now()): boolean {
    const view = this.weaponView.get(WeaponType.ZAP);
    return Boolean(view && now < view.activeEndsAt);
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
    if (this.selectedWeapon === WeaponType.ZAP) {
      const duration = WEAPONS[WeaponType.ZAP].durationMs ?? 3000;
      view.activeEndsAt = now + duration;
      view.cooldownEndsAt = view.activeEndsAt + WEAPONS[WeaponType.ZAP].cooldownMs;
    } else {
      view.cooldownEndsAt = now + WEAPONS[this.selectedWeapon].cooldownMs;
      if (this.selectedWeapon === WeaponType.PISTOL && view.ammo !== undefined) {
        view.ammo = Math.max(0, view.ammo - 1);
        if (view.ammo === 0) view.reloadEndsAt = now + (WEAPONS[WeaponType.PISTOL].reloadMs ?? 0);
      } else if (this.selectedWeapon === WeaponType.MINE && view.deployedCount !== undefined) {
        view.deployedCount = Math.min(view.maxDeployed ?? 5, view.deployedCount + 1);
      }
    }
    this.updateHud();
  }

  /** Met à jour la visée du Zap continu vers le curseur pendant l'émission (max ~22 Hz) */
  public syncActiveZap(now = Date.now()): void {
    if (!this.isZapActive(now)) return;
    if (!isLocalHunterArmed(this.state) || this.state.currentPhase !== GamePhase.HUNTING) return;
    if (now - this.lastZapAimSentAt < 45) return;
    this.lastZapAimSentAt = now;

    const target = screenToWorld(this.state, this.canvas, this.state.mouse.x, this.state.mouse.y);
    networkManager.send<HunterZapAimPayload>(MessageType.HUNTER_ZAP_AIM, {
      targetX: target.x,
      targetY: target.y
    });
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
      const activeLeft = view.activeEndsAt - now;
      const cooldownLeft = view.cooldownEndsAt - now;

      if (type === WeaponType.ZAP && activeLeft > 0) {
        slot.info.textContent = `ACTIF ${(activeLeft / 1000).toFixed(1)}s`;
        slot.info.style.color = '#fb923c';
        slot.progress.style.width = `${100 * (activeLeft / (def.durationMs ?? 3000))}%`;
      } else if (type === WeaponType.PISTOL && reloadLeft > 0) {
        slot.info.textContent = 'RECHARGE...';
        slot.info.style.color = '#38bdf8';
        slot.progress.style.width = `${100 * (1 - reloadLeft / (def.reloadMs ?? 1))}%`;
      } else if (cooldownLeft > 1000) {
        // Long délai (grenade / zap) : on affiche le compte à rebours
        slot.info.textContent = `${Math.ceil(cooldownLeft / 1000)}s`;
        slot.info.style.color = '#f87171';
        slot.progress.style.width = `${100 * (1 - cooldownLeft / def.cooldownMs)}%`;
      } else if (type === WeaponType.MINE && view.maxDeployed !== undefined) {
        const remaining = Math.max(0, view.maxDeployed - (view.deployedCount ?? 0));
        slot.info.textContent = `${remaining} / ${view.maxDeployed}`;
        slot.info.style.color = remaining === 0 ? '#f87171' : '#fbbf24';
        slot.progress.style.width = '0%';
      } else {
        slot.info.textContent = view.magazineSize !== undefined ? `${view.ammo} / ${view.magazineSize}` : 'PRÊT';
        slot.info.style.color = view.ammo === 0 ? '#f87171' : '#fbbf24';
        slot.progress.style.width = '0%';
      }
    });
  }

  /** Drones accompagnants et aides à la visée du chasseur local (coordonnées monde) */
  public drawHeldWeapons(ctx: CanvasRenderingContext2D, effects: CombatEffects, drones: DroneController): void {
    const { player, mouse, currentPhase } = this.state;
    const now = Date.now();

    if (isLocalHunterArmed(this.state) && networkManager.localPlayerId) {
      const localDrone = drones.get(networkManager.localPlayerId);
      const dx = localDrone ? localDrone.x : player.x - 28;
      const dy = localDrone ? localDrone.drawY : player.y - 34;
      const baseY = localDrone ? localDrone.y : dy;
      const recoil = localDrone ? localDrone.recoil : 0;

      const aim = screenToWorld(this.state, this.canvas, mouse.x, mouse.y);
      const aimDist = Math.hypot(aim.x - dx, aim.y - dy);
      const angle = aimDist > 0.5 ? Math.atan2(aim.y - dy, aim.x - dx) : 0;
      const ready = this.isReady(this.selectedWeapon, now);

      if (mouse.inside && currentPhase === GamePhase.HUNTING) {
        const muzzle = drones.getMuzzle(dx, dy, angle, this.selectedWeapon);
        this.drawAimAssist(ctx, dx, dy, muzzle.x, muzzle.y, aim, angle, ready);
      }

      drawHunterDrone(ctx, this.droneImages, this.weaponImages, dx, dy, baseY, angle, this.selectedWeapon, ready, recoil);
    }

    this.state.otherPlayers.forEach((op, id) => {
      if (op.role !== PlayerRole.HUNTER || op.health <= 0) return;
      const aim = effects.hunterAim.get(id) ?? { angle: 0, weapon: WeaponType.PISTOL, readyAt: 0 };
      const drone = drones.get(id);
      const dx = drone ? drone.x : op.x - 28;
      const dy = drone ? drone.drawY : op.y - 34;
      const baseY = drone ? drone.y : dy;
      const recoil = drone ? drone.recoil : 0;
      const ready = now >= aim.readyAt;
      drawHunterDrone(ctx, this.droneImages, this.weaponImages, dx, dy, baseY, aim.angle, aim.weapon, ready, recoil);
    });
  }

  /** Prévisualisations de tir et portées depuis le drone / sa bouche d'arme */
  private drawAimAssist(
    ctx: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    muzzleX: number,
    muzzleY: number,
    aim: { x: number; y: number },
    angle: number,
    ready: boolean
  ): void {
    const serverOx = this.state.player.x;
    const serverOy = this.state.player.y - HOLD_OFFSET_Y;
    const cursorDistFromOrigin = Math.hypot(aim.x - serverOx, aim.y - serverOy);
    const dirX = cursorDistFromOrigin > 0 ? (aim.x - serverOx) / cursorDistFromOrigin : Math.cos(angle);
    const dirY = cursorDistFromOrigin > 0 ? (aim.y - serverOy) / cursorDistFromOrigin : Math.sin(angle);

    ctx.save();
    if (this.selectedWeapon === WeaponType.PISTOL || this.selectedWeapon === WeaponType.ZAP) {
      const isZap = this.selectedWeapon === WeaponType.ZAP;
      const def = WEAPONS[this.selectedWeapon];
      const clampedDist = Math.min(def.range, cursorDistFromOrigin);
      const endX = serverOx + dirX * clampedDist;
      const endY = serverOy + dirY * clampedDist;

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isZap
        ? (ready ? 'rgba(251, 146, 60, 0.7)' : 'rgba(148, 163, 184, 0.35)')
        : (ready ? 'rgba(251, 191, 36, 0.55)' : 'rgba(148, 163, 184, 0.35)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    } else if (this.selectedWeapon === WeaponType.GRENADE || this.selectedWeapon === WeaponType.MINE) {
      const isMine = this.selectedWeapon === WeaponType.MINE;
      const def = WEAPONS[this.selectedWeapon];
      const travel = Math.min(def.range, cursorDistFromOrigin);
      const lx = serverOx + dirX * travel;
      const ly = serverOy + dirY * travel;

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isMine
        ? (ready ? 'rgba(249, 115, 22, 0.8)' : 'rgba(148, 163, 184, 0.45)')
        : (ready ? 'rgba(251, 191, 36, 0.8)' : 'rgba(148, 163, 184, 0.45)');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(lx, ly, def.blastRadius ?? 80, 0, Math.PI * 2);
      ctx.stroke();
      if (isMine && def.triggerRadius) {
        ctx.strokeStyle = ready ? 'rgba(239, 68, 68, 0.9)' : 'rgba(148, 163, 184, 0.45)';
        ctx.beginPath();
        ctx.arc(lx, ly, def.triggerRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(muzzleX, muzzleY);
      ctx.lineTo(lx, ly);
      ctx.stroke();
    } else if (this.selectedWeapon === WeaponType.CROWBAR) {
      const def = WEAPONS[WeaponType.CROWBAR];
      const half = ((def.arcDegrees ?? 100) * Math.PI) / 360;
      ctx.fillStyle = ready ? 'rgba(239, 68, 68, 0.14)' : 'rgba(148, 163, 184, 0.1)';
      ctx.strokeStyle = ready ? 'rgba(239, 68, 68, 0.45)' : 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.arc(dx, dy, def.range, angle - half, angle + half);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(dx, dy, def.range, angle - half, angle + half);
      ctx.stroke();
    }
    ctx.restore();
  }
}
