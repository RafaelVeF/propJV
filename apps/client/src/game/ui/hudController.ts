import { GamePhase, PlayerRole } from '@prop-hunt/shared';
import { musicManager } from '../../audio/MusicManager';
import type { GameState } from '../state';

export interface HudControllerCallbacks {
  onLeaveGame: () => void;
}

/**
 * Contrôleur du HUD unifié en jeu :
 *  - Menu Pause (bouton engrenage, audio, quitter)
 *  - Carte de vie, rôle, compteur survivants (HUNTER / PROPS), barre d'actions Prop et rappel des touches
 */
export class HudController {
  private readonly pauseOverlay = document.getElementById('pause-menu-overlay');
  private readonly btnPauseMenu = document.getElementById('btn-pause-menu');
  private readonly btnResumeGame = document.getElementById('btn-resume-game');
  private readonly btnToggleMusic = document.getElementById('btn-toggle-music');
  private readonly btnLeaveGame = document.getElementById('btn-leave-game');

  private readonly hudHpText = document.getElementById('hud-hp-text');
  private readonly hudHpFill = document.getElementById('hud-hp-fill');
  private readonly gameRoleBadge = document.getElementById('game-role-badge');
  private readonly propActionsHud = document.getElementById('prop-actions-hud');
  private readonly gameSurvivorsBadge = document.getElementById('game-survivors-badge');
  private readonly gameControlsBar = document.getElementById('game-controls-bar');

  constructor(
    private readonly state: GameState,
    callbacks: HudControllerCallbacks
  ) {
    this.btnPauseMenu?.addEventListener('click', () => this.setPauseMenuOpen(!this.state.isPauseMenuOpen));
    this.btnResumeGame?.addEventListener('click', () => this.setPauseMenuOpen(false));
    this.pauseOverlay?.addEventListener('click', (e) => {
      if (e.target === this.pauseOverlay) this.setPauseMenuOpen(false);
    });
    this.btnLeaveGame?.addEventListener('click', () => {
      this.setPauseMenuOpen(false);
      callbacks.onLeaveGame();
    });

    const updateMusicButton = (muted: boolean) => {
      if (!this.btnToggleMusic) return;
      this.btnToggleMusic.textContent = muted ? 'MUSIQUE : OFF' : 'MUSIQUE : ON';
    };
    this.btnToggleMusic?.addEventListener('click', () => musicManager.toggleMute());
    musicManager.onMuteChange(updateMusicButton);
    updateMusicButton(musicManager.getIsMuted());
  }

  public setPauseMenuOpen(open: boolean): void {
    this.state.isPauseMenuOpen = open;
    if (this.pauseOverlay) {
      this.pauseOverlay.style.display = open ? 'flex' : 'none';
    }
  }

  public update(): void {
    const { player, otherPlayers, localPlayerRole, currentPhase, spectator } = this.state;

    if (this.hudHpText && this.hudHpFill) {
      const curHp = Math.max(0, Math.round(player.health));
      const maxHp = Math.max(1, Math.round(player.maxHealth));
      const hpRatio = Math.min(100, (curHp / maxHp) * 100);
      this.hudHpText.textContent = `${curHp} / ${maxHp} PV`;
      this.hudHpFill.style.width = `${hpRatio}%`;
      this.hudHpFill.style.background = hpRatio > 50
        ? 'linear-gradient(90deg, #22c55e, #4ade80)'
        : hpRatio > 25
          ? 'linear-gradient(90deg, #eab308, #facc15)'
          : 'linear-gradient(90deg, #dc2626, #ef4444)';
    }

    if (this.gameRoleBadge) {
      if (spectator.active) {
        this.gameRoleBadge.textContent = 'SPECTATEUR';
      } else if (localPlayerRole === PlayerRole.HUNTER) {
        this.gameRoleBadge.textContent = 'CHASSEUR';
      } else {
        this.gameRoleBadge.textContent = 'PROP';
      }
    }

    if (this.propActionsHud) {
      const showPropHud = !spectator.active && localPlayerRole === PlayerRole.PROP && currentPhase !== GamePhase.ROUND_END;
      this.propActionsHud.style.display = showPropHud ? 'flex' : 'none';
    }

    let huntersAlive = (!spectator.active && localPlayerRole === PlayerRole.HUNTER && player.health > 0) ? 1 : 0;
    let propsAlive = (!spectator.active && localPlayerRole === PlayerRole.PROP && player.health > 0) ? 1 : 0;
    otherPlayers.forEach(op => {
      if (op.health > 0) {
        if (op.role === PlayerRole.HUNTER) huntersAlive++;
        else if (op.role === PlayerRole.PROP) propsAlive++;
      }
    });
    if (this.gameSurvivorsBadge) {
      this.gameSurvivorsBadge.innerHTML = `<span>HUNTER ${huntersAlive}</span><span class="hud-survivors-sep">|</span><span>PROPS ${propsAlive}</span>`;
    }

    if (this.gameControlsBar) {
      if (spectator.active) {
        this.gameControlsBar.textContent = '[← / →] Cible • [Espace] Caméra libre • [T] Chat • [Échap] Menu';
      } else if (localPlayerRole === PlayerRole.HUNTER) {
        this.gameControlsBar.textContent = '[ZQSD] Bouger • [1/2/3] Armes • [Clic] Tirer • [T] Chat • [Échap] Menu';
      } else {
        this.gameControlsBar.textContent = '[ZQSD] Bouger • [T] Chat • [Échap] Menu • [Clic Minimap] Plan';
      }
    }
  }
}
