import { WeaponType } from '@prop-hunt/shared';
import { networkManager } from '../../network/networkManager';
import { forEachActiveHunter, type GameState } from '../state';

export interface DroneState {
  x: number;
  y: number;
  drawY: number;
  bobPhase: number;
  recoil: number;
  lastDirX: number;
  lastDirY: number;
}

const DRONE_MUZZLE_OFFSET: Record<WeaponType, number> = {
  [WeaponType.PISTOL]: 14,
  [WeaponType.CROWBAR]: 11,
  [WeaponType.GRENADE]: 10,
  [WeaponType.ZAP]: 13,
  [WeaponType.MINE]: 11
};

/**
 * Gère les drones accompagnants des Chasseurs : suivi fluide en retrait (type compagnon),
 * lévitation sinusoïdale, recul au tir et calcul de la position de la bouche d'arme.
 */
export class DroneController {
  private readonly drones = new Map<string, DroneState>();

  public get(hunterId: string): DroneState | undefined {
    return this.drones.get(hunterId);
  }

  public getOrigin(hunterId: string, fallbackX: number, fallbackY: number): { x: number; y: number } {
    const d = this.drones.get(hunterId);
    return d ? { x: d.x, y: d.drawY } : { x: fallbackX, y: fallbackY };
  }

  public getMuzzle(dx: number, dy: number, angle: number, weapon: WeaponType): { x: number; y: number } {
    const dist = DRONE_MUZZLE_OFFSET[weapon] ?? 12;
    return {
      x: dx + Math.cos(angle) * dist,
      y: dy + Math.sin(angle) * dist
    };
  }

  public triggerRecoil(hunterId: string, amount = 3.5): void {
    const drone = this.drones.get(hunterId);
    if (drone) drone.recoil = amount;
  }

  public delete(hunterId: string): void {
    this.drones.delete(hunterId);
  }

  public clear(): void {
    this.drones.clear();
  }

  /** Met à jour tous les drones actifs et supprime ceux des joueurs morts / non-chasseurs */
  public sync(state: GameState, localVx: number, localVy: number, remoteVelocities: Map<string, { dx: number; dy: number }>, now = Date.now()): void {
    const activeIds = forEachActiveHunter(state, networkManager.localPlayerId, localVx, localVy, remoteVelocities, (id, x, y, vx, vy) => {
      this.updateOne(id, x, y, vx, vy, now);
    });

    this.drones.forEach((_, id) => {
      if (!activeIds.has(id)) this.drones.delete(id);
    });
  }

  private updateOne(id: string, hx: number, hy: number, moveX: number, moveY: number, now: number): void {
    let drone = this.drones.get(id);
    if (!drone) {
      drone = {
        x: hx - 28,
        y: hy - 34,
        drawY: hy - 34,
        bobPhase: (id.charCodeAt(0) || 0) * 0.7,
        recoil: 0,
        lastDirX: 0.75,
        lastDirY: 0.4
      };
      this.drones.set(id, drone);
    }

    const moveLen = Math.hypot(moveX, moveY);
    if (moveLen > 0.15) {
      drone.lastDirX = moveX / moveLen;
      drone.lastDirY = moveY / moveLen;
    }

    const targetX = hx - drone.lastDirX * 36;
    const targetY = hy - 28 - drone.lastDirY * 22;

    if (Math.hypot(targetX - drone.x, targetY - drone.y) > 200) {
      drone.x = targetX;
      drone.y = targetY;
    } else {
      drone.x += (targetX - drone.x) * 0.14;
      drone.y += (targetY - drone.y) * 0.14;
    }

    drone.recoil *= 0.8;
    if (drone.recoil < 0.05) drone.recoil = 0;
    drone.drawY = drone.y + Math.sin(now * 0.0055 + drone.bobPhase) * 2.5;
  }
}
