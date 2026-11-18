import {
  GamePhase,
  PlayerRole,
  type RoundEndPayload,
  type RoundStartPayload
} from '@prop-hunt/shared';

/**
 * Interface de la manche : badge de phase, chronomètre, badge de rôle,
 * aveuglement du chasseur pendant la cache et écran de fin de manche.
 */
export class RoundHud {
  private readonly phaseBadge = document.getElementById('game-phase-badge');
  private readonly timer = document.getElementById('game-timer');
  private readonly roleBadge = document.getElementById('game-role-badge');
  private readonly hunterBlindfold = document.getElementById('hunter-blindfold');
  private readonly hunterCountdown = document.getElementById('hunter-countdown');
  private readonly roundEndOverlay = document.getElementById('round-end-overlay');
  private readonly roundEndWinner = document.getElementById('round-end-winner');
  private readonly roundEndReason = document.getElementById('round-end-reason');
  private readonly roundEndScores = document.getElementById('round-end-scores');
  private readonly roundEndCountdown = document.getElementById('round-end-countdown');

  public showRoundStart(payload: RoundStartPayload): void {
    this.hideRoundEnd();

    if (this.roleBadge) {
      const isHunter = payload.role === PlayerRole.HUNTER;
      this.roleBadge.textContent = isHunter ? 'RÔLE : CHASSEUR' : 'RÔLE : PROP';
      this.roleBadge.style.background = isHunter ? 'rgba(239, 68, 68, 0.25)' : 'rgba(168, 85, 247, 0.25)';
      this.roleBadge.style.color = isHunter ? '#f87171' : '#c084fc';
      this.roleBadge.style.borderColor = isHunter ? 'rgba(239, 68, 68, 0.5)' : 'rgba(168, 85, 247, 0.5)';
    }

    if (this.hunterBlindfold && this.hunterCountdown) {
      if (payload.role === PlayerRole.HUNTER) {
        this.hunterBlindfold.style.display = 'flex';
        this.hunterCountdown.textContent = payload.hidingDuration.toString();
      } else {
        this.hunterBlindfold.style.display = 'none';
      }
    }
  }

  public showTimer(phase: GamePhase, timeRemaining: number, localRole: PlayerRole): void {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    if (this.timer) {
      this.timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    if (this.phaseBadge) {
      switch (phase) {
        case GamePhase.COUNTDOWN:
          this.phaseBadge.textContent = 'DÉMARRAGE IMMINENT';
          this.phaseBadge.style.color = '#fbbf24';
          break;
        case GamePhase.HIDING:
          this.phaseBadge.textContent = 'CACHE-CACHE (30s)';
          this.phaseBadge.style.color = '#38bdf8';
          break;
        case GamePhase.HUNTING:
          this.phaseBadge.textContent = 'CHASSE EN COURS';
          this.phaseBadge.style.color = '#f87171';
          break;
        case GamePhase.ROUND_END:
          this.phaseBadge.textContent = 'MANCHE TERMINÉE';
          this.phaseBadge.style.color = '#c084fc';
          break;
      }
    }

    if (this.hunterBlindfold && this.hunterCountdown) {
      if (phase === GamePhase.HIDING && localRole === PlayerRole.HUNTER) {
        this.hunterBlindfold.style.display = 'flex';
        this.hunterCountdown.textContent = timeRemaining.toString();
      } else {
        this.hunterBlindfold.style.display = 'none';
      }
    }

    if (phase === GamePhase.ROUND_END && this.roundEndCountdown) {
      this.roundEndCountdown.textContent = timeRemaining.toString();
    }
  }

  public showRoundEnd(payload: RoundEndPayload): void {
    this.hideBlindfold();
    const { roundEndOverlay, roundEndWinner, roundEndReason, roundEndScores, roundEndCountdown } = this;
    if (!roundEndOverlay || !roundEndWinner || !roundEndReason || !roundEndScores) return;

    roundEndOverlay.style.display = 'flex';
    if (roundEndCountdown) roundEndCountdown.textContent = '10';

    const isHunterWin = payload.winner === PlayerRole.HUNTER;
    roundEndWinner.textContent = isHunterWin ? 'VICTOIRE DES CHASSEURS !' : 'VICTOIRE DES PROPS !';
    roundEndWinner.style.color = isHunterWin ? '#f87171' : '#38bdf8';

    roundEndReason.textContent = payload.reason === 'ALL_PROPS_ELIMINATED'
      ? 'Tous les Props ont été débusqués et éliminés !'
      : 'Temps écoulé ! Les Props survivants remportent la manche !';

    roundEndScores.innerHTML = `
      <h4 style="margin: 0 0 10px 0; color: #94a3b8; font-size: 0.9rem; text-transform: uppercase;">Scores de la manche</h4>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        ${payload.scores.map((s, idx) => `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255, 255, 255, 0.04); border-radius: 6px;">
            <span>#${idx + 1} <strong>${s.name}</strong> ${s.survived ? '🟢 (Survivant)' : ''}</span>
            <span style="color: #fbbf24; font-family: monospace; font-weight: bold;">${s.score} pts</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  /** Mode Freeplay : pas de manche, pas de chrono */
  public showFreeplay(): void {
    this.hideBlindfold();
    this.hideRoundEnd();
    if (this.phaseBadge) {
      this.phaseBadge.textContent = 'MODE FREEPLAY';
      this.phaseBadge.style.color = '#38bdf8';
    }
    if (this.timer) this.timer.textContent = '∞';
    if (this.roleBadge) {
      this.roleBadge.textContent = 'RÔLE : PROP (LIBRE)';
      this.roleBadge.style.color = '#c084fc';
    }
  }

  public hideRoundEnd(): void {
    if (this.roundEndOverlay) this.roundEndOverlay.style.display = 'none';
  }

  public hideBlindfold(): void {
    if (this.hunterBlindfold) this.hunterBlindfold.style.display = 'none';
  }
}
