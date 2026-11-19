import { getNextSpectateTarget, PlayerRole, type PlayerDiedPayload } from '@prop-hunt/shared';
import { getAlivePlayerIds, type GameState } from '../state';

const DEATH_SCREEN_DURATION = 3000;  // Durée de l'écran "Vous êtes mort" (ms)
const FREE_CAM_SPEED = 8;            // Vitesse de la caméra libre (px monde / frame)
const MIN_SPECTATOR_ZOOM = 0.4;
const MAX_SPECTATOR_ZOOM = 1.5;
const FOLLOW_SMOOTHING = 0.15;       // Douceur de la caméra quand elle change de joueur suivi

interface SpectatorDom {
  deathOverlay: HTMLElement | null;
  deathOverlayKiller: HTMLElement | null;
  deathOverlayProp: HTMLElement | null;
  spectatorHud: HTMLElement | null;
  spectatorTarget: HTMLElement | null;
  spectatorHelp: HTMLElement | null;
}

/**
 * MODE SPECTATEUR : activé quand le joueur local meurt, jusqu'à la fin de la manche.
 * Le joueur ne contrôle plus que la caméra : suivre un joueur vivant ou caméra libre.
 */
export class SpectatorController {
  private readonly dom: SpectatorDom;
  private deathOverlayTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param onModeChange appelé à l'entrée et à la sortie du mode (pour mettre à jour le reste de l'interface)
   */
  constructor(private readonly state: GameState, private readonly onModeChange: () => void) {
    this.dom = {
      deathOverlay: document.getElementById('death-overlay'),
      deathOverlayKiller: document.getElementById('death-overlay-killer'),
      deathOverlayProp: document.getElementById('death-overlay-prop'),
      spectatorHud: document.getElementById('spectator-hud'),
      spectatorTarget: document.getElementById('spectator-target'),
      spectatorHelp: document.getElementById('spectator-help')
    };
  }

  public get isActive(): boolean {
    return this.state.spectator.active;
  }

  public enter(death?: PlayerDiedPayload): void {
    const { spectator, player, camera } = this.state;
    if (spectator.active) return;
    spectator.active = true;
    spectator.freeCam = false;
    spectator.zoom = 1;
    camera.x = player.x;
    camera.y = player.y;
    player.health = 0;
    Object.keys(this.state.keys).forEach(k => { this.state.keys[k] = false; }); // Évite qu'une touche reste "appuyée"
    this.onModeChange();
    this.showDeathScreen(death);

    // On commence par suivre le tueur s'il est encore en vie
    const killer = death?.killerId ? this.state.otherPlayers.get(death.killerId) : undefined;
    if (death?.killerId && killer && killer.role !== PlayerRole.SPECTATOR && killer.health > 0) {
      spectator.targetId = death.killerId;
      this.updateHud();
    } else {
      spectator.targetId = null;
      this.cycleTarget(1);
    }
  }

  /** Fin de manche / nouvelle manche : on redevient un joueur normal */
  public exit(): void {
    const { spectator } = this.state;
    if (this.deathOverlayTimeout) clearTimeout(this.deathOverlayTimeout);
    if (this.dom.deathOverlay) this.dom.deathOverlay.style.display = 'none';
    spectator.active = false;
    spectator.targetId = null;
    spectator.freeCam = false;
    this.updateHud();
    this.onModeChange();
  }

  public cycleTarget(direction: 1 | -1): void {
    const { spectator } = this.state;
    const next = getNextSpectateTarget(getAlivePlayerIds(this.state), spectator.targetId, direction);
    spectator.targetId = next;
    spectator.freeCam = next === null; // Plus personne à suivre : caméra libre
    this.updateHud();
  }

  /** Espace : bascule entre caméra libre et suivi d'un joueur */
  public toggleFreeCam(): void {
    if (this.state.spectator.freeCam) {
      this.cycleTarget(1);
    } else {
      this.state.spectator.freeCam = true;
      this.updateHud();
    }
  }

  public zoomBy(wheelDeltaY: number): void {
    const factor = wheelDeltaY > 0 ? 0.9 : 1.1;
    const { spectator } = this.state;
    spectator.zoom = Math.max(MIN_SPECTATOR_ZOOM, Math.min(MAX_SPECTATOR_ZOOM, spectator.zoom * factor));
  }

  /** Un autre joueur est mort : s'il était suivi, on passe au suivant */
  public onOtherPlayerGone(playerId: string): void {
    if (!this.state.spectator.active) return;
    if (playerId === this.state.spectator.targetId) {
      this.cycleTarget(1);
    } else {
      this.updateHud();
    }
  }

  /** Le joueur suivi a disparu ou est mort entre deux messages : on change de cible */
  public ensureValidTarget(): void {
    const { spectator, otherPlayers } = this.state;
    if (!spectator.active || spectator.freeCam) return;
    const target = spectator.targetId ? otherPlayers.get(spectator.targetId) : undefined;
    if (!target || target.role === PlayerRole.SPECTATOR || target.health <= 0) this.cycleTarget(1);
  }

  /** Déplace la caméra : libre (ZQSD) ou en suivant le joueur ciblé. À appeler à chaque frame. */
  public updateCamera(vx: number, vy: number): void {
    const { spectator, camera, otherPlayers } = this.state;
    if (spectator.freeCam) {
      const len = Math.hypot(vx, vy) || 1;
      camera.x += (vx / len) * FREE_CAM_SPEED / spectator.zoom;
      camera.y += (vy / len) * FREE_CAM_SPEED / spectator.zoom;
    } else if (spectator.targetId) {
      const target = otherPlayers.get(spectator.targetId);
      if (target) {
        camera.x += (target.x - camera.x) * FOLLOW_SMOOTHING;
        camera.y += (target.y - camera.y) * FOLLOW_SMOOTHING;
      }
    }
  }

  private showDeathScreen(death?: PlayerDiedPayload): void {
    const { deathOverlay, deathOverlayKiller, deathOverlayProp } = this.dom;
    if (!deathOverlay) return;
    if (deathOverlayKiller) {
      deathOverlayKiller.innerText = death?.killerName ? `Éliminé par ${death.killerName}` : 'Vous avez été éliminé';
    }
    if (deathOverlayProp) {
      deathOverlayProp.innerText = death?.propDisplayName ? `Vous étiez caché en : ${death.propDisplayName}` : '';
    }
    deathOverlay.style.display = 'flex';
    deathOverlay.style.opacity = '1';
    if (this.deathOverlayTimeout) clearTimeout(this.deathOverlayTimeout);
    this.deathOverlayTimeout = setTimeout(() => {
      deathOverlay.style.opacity = '0';
      this.deathOverlayTimeout = setTimeout(() => { deathOverlay.style.display = 'none'; }, 600);
    }, DEATH_SCREEN_DURATION);
  }

  public updateHud(): void {
    const { spectatorHud, spectatorTarget, spectatorHelp } = this.dom;
    if (!spectatorHud || !spectatorTarget || !spectatorHelp) return;
    const { spectator, otherPlayers } = this.state;
    if (!spectator.active) {
      spectatorHud.style.display = 'none';
      return;
    }
    spectatorHud.style.display = 'flex';
    const target = spectator.targetId ? otherPlayers.get(spectator.targetId) : undefined;
    if (spectator.freeCam || !target) {
      spectatorTarget.innerText = 'Caméra libre';
      spectatorHelp.innerText = getAlivePlayerIds(this.state).length > 0
        ? 'ZQSD : déplacer | Molette : zoom | Espace / Clic : suivre un joueur'
        : 'ZQSD : déplacer | Molette : zoom | Aucun joueur en vie à suivre';
    } else {
      const roleTag = target.role === PlayerRole.HUNTER ? 'Chasseur' : (target.currentProp?.displayName ?? 'Prop');
      spectatorTarget.innerText = `Vous suivez : ${target.name || 'Joueur'} (${roleTag})`;
      spectatorHelp.innerText = '← / → ou Clic G / D : changer de joueur | Espace : caméra libre | Molette : zoom';
    }
  }
}
