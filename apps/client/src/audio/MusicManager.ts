/**
 * MusicManager — Gestionnaire audio global (menus & en jeu).
 *
 * - Hors partie (tous les écrans de menus/salon) : joue `/assets/audio/tracks/lobby.mp3` en boucle.
 * - En partie (`#view-game` active) : coupe `lobby.mp3` et enchaîne aléatoirement les pistes de gameplay
 *   (`track_01.mp3`, `track_02.mp3`, `track_03.mp3`) sans répéter 2 fois de suite la même.
 * - Synchronise en temps réel le volume (0..100%) et l'état Mute avec `localStorage` et l'écran Paramètres.
 * - Débloque automatiquement la lecture dès la première interaction souris si l'autoplay initial est bloqué.
 */

const STORAGE_KEY_MUTED = 'propjv:music:muted';
const STORAGE_KEY_VOLUME = 'propjv:music:volume';
const MAX_EFFECTIVE_GAIN = 0.5;

export const LOBBY_MUSIC_TRACK = '/assets/audio/tracks/lobby.mp3';

export const DEFAULT_MUSIC_TRACKS: string[] = [
  '/assets/audio/tracks/track_01.mp3',
  '/assets/audio/tracks/track_02.mp3',
  '/assets/audio/tracks/track_03.mp3',
];

export class MusicManager {
  private audio: HTMLAudioElement;
  private lobbyAudio: HTMLAudioElement;
  private availableTracks: string[];
  private currentTrack: string | null = null;
  private isMuted: boolean;
  private volumePercent: number;
  private volume: number;

  private isPlayingWanted = false;
  private isPlayPending = false;

  private isLobbyWanted = false;
  private isLobbyPlayPending = false;
  private lobbyTrackMissing = false;

  private muteListeners: Set<(muted: boolean) => void> = new Set();
  private volumeListeners: Set<(volumePercent: number) => void> = new Set();

  constructor(tracks: string[] = DEFAULT_MUSIC_TRACKS, defaultVolumePercent = 80) {
    this.availableTracks = [...tracks];
    this.volumePercent = this.loadVolumePercent(defaultVolumePercent);
    this.volume = this.computeEffectiveVolume(this.volumePercent);
    this.isMuted = this.loadMuteState();

    // 1. Lecteur pour les pistes aléatoires en partie (#view-game)
    this.audio = new Audio();
    this.audio.volume = this.volume;
    this.audio.muted = this.isMuted;

    this.audio.addEventListener('ended', () => {
      if (this.isPlayingWanted) {
        this.playRandomTrack();
      }
    });

    this.audio.addEventListener('error', () => {
      this.isPlayPending = false;
      if (this.currentTrack) {
        this.availableTracks = this.availableTracks.filter((t) => t !== this.currentTrack);
        this.currentTrack = null;
      }
      if (this.isPlayingWanted && this.availableTracks.length > 0) {
        this.playRandomTrack();
      } else if (this.availableTracks.length === 0) {
        console.info('[MusicManager] Aucune piste musicale trouvée dans /assets/audio/tracks/.');
      }
    });

    // 2. Lecteur dédié en boucle pour lobby.mp3 sur tous les écrans hors partie
    this.lobbyAudio = new Audio(LOBBY_MUSIC_TRACK);
    this.lobbyAudio.loop = true;
    this.lobbyAudio.preload = 'auto';
    this.lobbyAudio.volume = this.volume;
    this.lobbyAudio.muted = this.isMuted;

    this.lobbyAudio.addEventListener('error', () => {
      this.isLobbyPlayPending = false;
      this.lobbyTrackMissing = true;
      console.info('[MusicManager] Piste lobby.mp3 introuvable dans /assets/audio/tracks/.');
    });

    // 3. Déblocage autoplay au premier clic / interaction utilisateur
    const unlockAutoplay = () => {
      if (this.isPlayingWanted) {
        if (!this.isPlayPending && this.audio.paused && this.availableTracks.length > 0) {
          this.safePlay();
        }
        return;
      }

      const viewGame = document.getElementById('view-game');
      const inGame = Boolean(viewGame && viewGame.classList.contains('active'));
      if (!inGame && this.isLobbyWanted && !this.isLobbyPlayPending && this.lobbyAudio.paused) {
        this.safePlayLobby();
      }
    };

    window.addEventListener('pointerdown', unlockAutoplay, { passive: true });
    window.addEventListener('click', unlockAutoplay, { passive: true });
    window.addEventListener('keydown', unlockAutoplay, { passive: true });
  }

  private computeEffectiveVolume(percent: number): number {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return Number(((clamped / 100) * MAX_EFFECTIVE_GAIN).toFixed(4));
  }

  private safePlay(): void {
    if (this.isPlayPending) return;
    this.isPlayPending = true;
    this.audio
      .play()
      .then(() => {
        this.isPlayPending = false;
      })
      .catch(() => {
        this.isPlayPending = false;
      });
  }

  private safePlayLobby(): void {
    if (this.isLobbyPlayPending || this.lobbyTrackMissing || this.isPlayingWanted) return;
    this.isLobbyPlayPending = true;
    this.lobbyAudio.volume = this.volume;
    this.lobbyAudio.muted = this.isMuted;
    this.lobbyAudio
      .play()
      .then(() => {
        this.isLobbyPlayPending = false;
      })
      .catch(() => {
        this.isLobbyPlayPending = false;
      });
  }

  private loadMuteState(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY_MUTED) === 'true';
    } catch {
      return false;
    }
  }

  private saveMuteState(muted: boolean): void {
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, muted ? 'true' : 'false');
    } catch {
      // Ignore si localStorage indisponible
    }
  }

  private loadVolumePercent(fallback: number): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_VOLUME);
      if (raw === null) return fallback;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return fallback;
      return Math.max(0, Math.min(100, Math.round(parsed)));
    } catch {
      return fallback;
    }
  }

  private saveVolumePercent(percent: number): void {
    try {
      localStorage.setItem(STORAGE_KEY_VOLUME, String(percent));
    } catch {
      // Ignore si localStorage indisponible
    }
  }

  /**
   * Lance la musique d'ambiance `lobby.mp3` en boucle (uniquement hors `#view-game`).
   */
  public startLobbyMusic(): void {
    const viewGame = document.getElementById('view-game');
    if (viewGame && viewGame.classList.contains('active')) {
      return;
    }

    // Coupe la musique de partie si elle tournait encore
    if (this.isPlayingWanted || !this.audio.paused) {
      this.isPlayingWanted = false;
      this.isPlayPending = false;
      this.audio.pause();
      this.audio.currentTime = 0;
    }

    this.isLobbyWanted = true;
    if (this.lobbyAudio.paused) {
      this.safePlayLobby();
    }
  }

  /**
   * Coupe immédiatement `lobby.mp3`.
   */
  public stopLobbyMusic(): void {
    this.isLobbyWanted = false;
    this.isLobbyPlayPending = false;
    this.lobbyAudio.pause();
    this.lobbyAudio.currentTime = 0;
  }

  /**
   * Démarre la musique de partie (`#view-game`) et coupe immédiatement `lobby.mp3`.
   */
  public start(): void {
    this.stopLobbyMusic();

    if (this.isPlayingWanted) return;
    this.isPlayingWanted = true;

    if (this.availableTracks.length === 0) return;

    if (this.audio.src && this.audio.paused && this.currentTrack) {
      this.safePlay();
    } else {
      this.playRandomTrack();
    }
  }

  /**
   * Arrête la musique de partie (`#view-game`) et relance `lobby.mp3` si on est revenu dans les menus/salon.
   */
  public stop(resumeLobby = true): void {
    this.isPlayingWanted = false;
    this.isPlayPending = false;
    this.audio.pause();
    this.audio.currentTime = 0;

    if (resumeLobby) {
      const viewGame = document.getElementById('view-game');
      const inGame = Boolean(viewGame && viewGame.classList.contains('active'));
      if (!inGame) {
        this.startLobbyMusic();
      }
    }
  }

  public playRandomTrack(): void {
    if (this.availableTracks.length === 0) return;

    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlayPending = false;

    const candidates =
      this.availableTracks.length > 1
        ? this.availableTracks.filter((t) => t !== this.currentTrack)
        : this.availableTracks;

    const nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
    this.currentTrack = nextTrack;
    this.audio.src = nextTrack;
    this.audio.volume = this.volume;
    this.audio.muted = this.isMuted;

    this.safePlay();
  }

  public setVolumePercent(percent: number): number {
    const clamped = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    this.volumePercent = clamped;
    this.volume = this.computeEffectiveVolume(clamped);

    this.audio.volume = this.volume;
    this.lobbyAudio.volume = this.volume;
    this.saveVolumePercent(clamped);

    if (clamped === 0 && !this.isMuted) {
      this.setMuted(true);
    } else if (clamped > 0 && this.isMuted) {
      this.setMuted(false);
    }

    this.volumeListeners.forEach((cb) => cb(this.volumePercent));
    return this.volumePercent;
  }

  public getVolumePercent(): number {
    return this.volumePercent;
  }

  public setMuted(muted: boolean): boolean {
    this.isMuted = Boolean(muted);
    this.audio.muted = this.isMuted;
    this.lobbyAudio.muted = this.isMuted;
    this.saveMuteState(this.isMuted);
    this.muteListeners.forEach((cb) => cb(this.isMuted));
    return this.isMuted;
  }

  public toggleMute(): boolean {
    return this.setMuted(!this.isMuted);
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public onMuteChange(cb: (muted: boolean) => void): () => void {
    this.muteListeners.add(cb);
    return () => this.muteListeners.delete(cb);
  }

  public onVolumeChange(cb: (volumePercent: number) => void): () => void {
    this.volumeListeners.add(cb);
    return () => this.volumeListeners.delete(cb);
  }
}

export const musicManager = new MusicManager();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    musicManager.stopLobbyMusic();
    musicManager.stop(false);
  });
}
