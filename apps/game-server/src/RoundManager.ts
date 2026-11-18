import {
  GamePhase,
  PlayerRole,
  LobbyPlayerInfo,
  LobbyStatePayload,
  RoundEndPayload,
  RoundScoreItem
} from '@prop-hunt/shared';

export interface PlayerSession {
  id: string;
  name: string;
  isReady: boolean;
  isHost: boolean;
  role: PlayerRole;
  health: number;
  maxHealth: number;
  score: number;
  kills: number;
}

export interface RoundManagerEvents {
  onLobbyStateChanged?: (state: LobbyStatePayload) => void;
  onCountdownStarted?: (seconds: number) => void;
  onCountdownCancelled?: () => void;
  onPhaseChanged?: (phase: GamePhase, timeRemaining: number) => void;
  onTimerTick?: (phase: GamePhase, timeRemaining: number) => void;
  onRoundStarted?: (assignments: Map<string, PlayerRole>) => void;
  onRoundEnded?: (results: RoundEndPayload) => void;
}

export interface RoundManagerConfig {
  minPlayers?: number;
  countdownDuration?: number; // secondes (défaut: 5)
  hidingDuration?: number;    // secondes (défaut: 30)
  huntingDuration?: number;   // secondes (défaut: 210 -> 3min30, total = 4min)
  roundEndDuration?: number;  // secondes (défaut: 10)
  autoStartTimer?: boolean;   // true en prod (setInterval), false en test unitaire
}

export class RoundManager {
  private phase: GamePhase = GamePhase.LOBBY;
  private timeRemaining: number = 0;
  private roundNumber: number = 0;
  private timerInterval: NodeJS.Timeout | null = null;

  public readonly players: Map<string, PlayerSession> = new Map();
  public readonly config: Required<RoundManagerConfig>;
  public readonly events: RoundManagerEvents;

  constructor(events: RoundManagerEvents = {}, config: RoundManagerConfig = {}) {
    this.events = events;
    this.config = {
      minPlayers: config.minPlayers ?? 2,
      countdownDuration: config.countdownDuration ?? 5,
      hidingDuration: config.hidingDuration ?? 30,
      huntingDuration: config.huntingDuration ?? 210,
      roundEndDuration: config.roundEndDuration ?? 10,
      autoStartTimer: config.autoStartTimer ?? true
    };

    if (this.config.autoStartTimer) {
      this.timerInterval = setInterval(() => this.tick(), 1000);
    }
  }

  public destroy(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  // --- GETTERS D'ÉTAT ---

  public getPhase(): GamePhase {
    return this.phase;
  }

  public getTimeRemaining(): number {
    return this.timeRemaining;
  }

  public getRoundNumber(): number {
    return this.roundNumber;
  }

  public getLobbyState(): LobbyStatePayload {
    const playerInfos: LobbyPlayerInfo[] = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      isReady: p.isReady,
      isHost: p.isHost
    }));

    return {
      players: playerInfos,
      canStart: this.canStartGame()
    };
  }

  // --- GESTION DU LOBBY ---

  public addPlayer(id: string, name: string): void {
    const isFirst = this.players.size === 0;
    const player: PlayerSession = {
      id,
      name,
      isReady: false,
      isHost: isFirst,
      role: PlayerRole.PROP,
      health: 100,
      maxHealth: 100,
      score: 0,
      kills: 0
    };

    this.players.set(id, player);
    this.events.onLobbyStateChanged?.(this.getLobbyState());
  }

  public removePlayer(id: string): void {
    const player = this.players.get(id);
    if (!player) return;

    const wasHost = player.isHost;
    this.players.delete(id);

    // Si l'hôte part, promouvoir le premier joueur restant
    if (wasHost && this.players.size > 0) {
      const nextHost = this.players.values().next().value;
      if (nextHost) nextHost.isHost = true;
    }

    // Si un joueur part pendant le compte à rebours et que les conditions ne sont plus remplies
    if (this.phase === GamePhase.COUNTDOWN) {
      if (!this.canStartGame()) {
        this.cancelCountdown();
      }
    }

    // Si on était en jeu, vérifier si l'une des équipes n'a plus aucun joueur
    if (this.phase === GamePhase.HIDING || this.phase === GamePhase.HUNTING) {
      const aliveProps = Array.from(this.players.values()).filter(
        p => p.role === PlayerRole.PROP && p.health > 0
      );
      const hunters = Array.from(this.players.values()).filter(
        p => p.role === PlayerRole.HUNTER
      );

      if (this.players.size < 2) {
        // Moins de 2 joueurs au total, retour direct au salon
        this.resetToLobby();
      } else if (aliveProps.length === 0) {
        this.endRound(PlayerRole.HUNTER, 'ALL_PROPS_ELIMINATED');
      } else if (hunters.length === 0) {
        this.endRound(PlayerRole.PROP, 'TIME_EXPIRED');
      }
    }

    this.events.onLobbyStateChanged?.(this.getLobbyState());
  }

  public toggleReady(id: string): boolean {
    const player = this.players.get(id);
    if (!player) return false;

    // Le switch "prêt" n'est permis qu'en LOBBY ou COUNTDOWN
    if (this.phase !== GamePhase.LOBBY && this.phase !== GamePhase.COUNTDOWN) {
      return player.isReady;
    }

    player.isReady = !player.isReady;

    if (this.canStartGame()) {
      if (this.phase === GamePhase.LOBBY) {
        this.startCountdown();
      }
    } else {
      if (this.phase === GamePhase.COUNTDOWN) {
        this.cancelCountdown();
      }
    }

    this.events.onLobbyStateChanged?.(this.getLobbyState());
    return player.isReady;
  }

  public canStartGame(): boolean {
    if (this.players.size < this.config.minPlayers) return false;
    for (const p of this.players.values()) {
      if (!p.isReady) return false;
    }
    return true;
  }

  // --- TRANSITIONS DE PHASES ---

  private startCountdown(): void {
    this.phase = GamePhase.COUNTDOWN;
    this.timeRemaining = this.config.countdownDuration;
    this.events.onCountdownStarted?.(this.timeRemaining);
    this.events.onPhaseChanged?.(GamePhase.COUNTDOWN, this.timeRemaining);
  }

  private cancelCountdown(): void {
    this.phase = GamePhase.LOBBY;
    this.timeRemaining = 0;
    this.events.onCountdownCancelled?.();
    this.events.onPhaseChanged?.(GamePhase.LOBBY, 0);
  }

  public startRound(): void {
    this.roundNumber += 1;
    this.phase = GamePhase.HIDING;
    this.timeRemaining = this.config.hidingDuration;

    // 1. Affectation des rôles : 50% Hunters, 50% Props
    const assignments = this.assignRoles();

    // 2. Réinitialisation de la vie des joueurs
    this.players.forEach(p => {
      p.health = 100;
      p.maxHealth = 100;
    });

    this.events.onRoundStarted?.(assignments);
    this.events.onPhaseChanged?.(GamePhase.HIDING, this.timeRemaining);
  }

  public endRound(winner: PlayerRole.HUNTER | PlayerRole.PROP, reason: 'ALL_PROPS_ELIMINATED' | 'TIME_EXPIRED'): RoundEndPayload {
    this.phase = GamePhase.ROUND_END;
    this.timeRemaining = this.config.roundEndDuration;

    // Attribution des points de victoire
    this.players.forEach(p => {
      if (p.role === winner) {
        p.score += 250;
      }
    });

    const scores: RoundScoreItem[] = Array.from(this.players.values()).map(p => ({
      playerId: p.id,
      name: p.name,
      score: p.score,
      kills: p.kills,
      survived: p.role === PlayerRole.PROP && p.health > 0
    }));

    const payload: RoundEndPayload = {
      winner,
      reason,
      scores
    };

    this.events.onRoundEnded?.(payload);
    this.events.onPhaseChanged?.(GamePhase.ROUND_END, this.timeRemaining);
    return payload;
  }

  public resetToLobby(): void {
    this.phase = GamePhase.LOBBY;
    this.timeRemaining = 0;

    // Remise à zéro des états "Prêt" pour le prochain round
    this.players.forEach(p => {
      p.isReady = false;
      p.role = PlayerRole.PROP;
      p.health = 100;
    });

    this.events.onPhaseChanged?.(GamePhase.LOBBY, 0);
    this.events.onLobbyStateChanged?.(this.getLobbyState());
  }

  // --- RÉPARTITION ÉQUILIBRÉE DES RÔLES (50% / 50%) ---

  public assignRoles(): Map<string, PlayerRole> {
    const playerIds = Array.from(this.players.keys());

    // Mélange de Fisher-Yates
    for (let i = playerIds.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [playerIds[i], playerIds[j]] = [playerIds[j], playerIds[i]];
    }

    // 50% Hunters, le reste Props (minimum 1 Hunter)
    const hunterCount = Math.max(1, Math.floor(playerIds.length * 0.5));
    const assignments = new Map<string, PlayerRole>();

    playerIds.forEach((id, index) => {
      const role = index < hunterCount ? PlayerRole.HUNTER : PlayerRole.PROP;
      const player = this.players.get(id);
      if (player) {
        player.role = role;
      }
      assignments.set(id, role);
    });

    return assignments;
  }

  // --- CONTRÔLES AUTORITAIRES ---

  /**
   * Vérifie si un joueur a le droit de se déplacer.
   * Règle stricte : Les Hunters sont totalement immobilisés pendant la phase HIDING (30s).
   */
  public canPlayerMove(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    // Pendant la phase de cachette, les chasseurs sont strictement bloqués
    if (this.phase === GamePhase.HIDING && player.role === PlayerRole.HUNTER) {
      return false;
    }

    // Pendant l'affichage des scores de fin de partie, tout le monde est bloqué
    if (this.phase === GamePhase.ROUND_END) {
      return false;
    }

    return true;
  }

  /**
   * Vérifie si un joueur a le droit de tirer.
   * Règle stricte : Seuls les Hunters peuvent tirer, et uniquement en phase HUNTING.
   */
  public canPlayerShoot(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    return this.phase === GamePhase.HUNTING && player.role === PlayerRole.HUNTER;
  }

  /**
   * Gère la mort d'un joueur et vérifie instantanément si la partie est terminée.
   */
  public handlePlayerDeath(victimId: string, attackerId?: string): RoundEndPayload | null {
    const victim = this.players.get(victimId);
    if (!victim) return null;

    victim.health = 0;

    if (attackerId && this.players.has(attackerId)) {
      const attacker = this.players.get(attackerId)!;
      attacker.kills += 1;
      attacker.score += 100;
    }

    // Si un Prop meurt en phase HUNTING, on vérifie s'il reste des Props vivants
    if (this.phase === GamePhase.HUNTING && victim.role === PlayerRole.PROP) {
      const aliveProps = Array.from(this.players.values()).filter(
        p => p.role === PlayerRole.PROP && p.health > 0
      );

      if (aliveProps.length === 0) {
        return this.endRound(PlayerRole.HUNTER, 'ALL_PROPS_ELIMINATED');
      }
    }

    return null;
  }

  /**
   * Prolonge ou raccourcit le chronomètre de la manche en cours (en secondes).
   */
  public adjustTime(deltaSeconds: number): { phase: GamePhase; timeRemaining: number } | null {
    if (this.phase !== GamePhase.HIDING && this.phase !== GamePhase.HUNTING && this.phase !== GamePhase.COUNTDOWN) {
      return null;
    }

    this.timeRemaining = Math.max(0, this.timeRemaining + Math.round(deltaSeconds));

    if (this.timeRemaining <= 0) {
      if (this.phase === GamePhase.COUNTDOWN) {
        this.startRound();
      } else if (this.phase === GamePhase.HIDING) {
        this.phase = GamePhase.HUNTING;
        this.timeRemaining = this.config.huntingDuration;
        this.events.onPhaseChanged?.(GamePhase.HUNTING, this.timeRemaining);
      } else if (this.phase === GamePhase.HUNTING) {
        this.endRound(PlayerRole.PROP, 'TIME_EXPIRED');
      }
    } else {
      this.events.onTimerTick?.(this.phase, this.timeRemaining);
    }

    return { phase: this.phase, timeRemaining: this.timeRemaining };
  }

  // --- HORLOGE SECONDE PAR SECONDE (TICK) ---

  public tick(): void {
    if (this.phase === GamePhase.LOBBY) {
      return;
    }

    this.timeRemaining -= 1;

    switch (this.phase) {
      case GamePhase.COUNTDOWN: {
        if (this.timeRemaining <= 0) {
          this.startRound();
        } else {
          this.events.onTimerTick?.(this.phase, this.timeRemaining);
        }
        break;
      }

      case GamePhase.HIDING: {
        if (this.timeRemaining <= 0) {
          // Fin des 30s de cachette -> début de la chasse (3min30s)
          this.phase = GamePhase.HUNTING;
          this.timeRemaining = this.config.huntingDuration;
          this.events.onPhaseChanged?.(GamePhase.HUNTING, this.timeRemaining);
        } else {
          this.events.onTimerTick?.(this.phase, this.timeRemaining);
        }
        break;
      }

      case GamePhase.HUNTING: {
        if (this.timeRemaining <= 0) {
          // Temps écoulé (4 min au total) -> Les Props survivants gagnent !
          this.endRound(PlayerRole.PROP, 'TIME_EXPIRED');
        } else {
          this.events.onTimerTick?.(this.phase, this.timeRemaining);
        }
        break;
      }

      case GamePhase.ROUND_END: {
        if (this.timeRemaining <= 0) {
          // Fin de l'affichage des scores -> Retour au salon
          this.resetToLobby();
        } else {
          this.events.onTimerTick?.(this.phase, this.timeRemaining);
        }
        break;
      }
    }
  }
}
