/**
 * MusicManager — Gestionnaire de musique aléatoire en jeu.
 *
 * - Pioche aléatoirement une piste dans la liste configurée (sans rejouer 2 fois de suite la même).
 * - Enchaîne automatiquement sur une autre piste à la fin du morceau.
 * - Gère le bouton Mute + raccourci 'M' avec persistance localStorage.
 * - Gère proprement les politiques d'autoplay des navigateurs et les fichiers manquants.
 */

const STORAGE_KEY_MUTED = 'propjv:music:muted';

export const DEFAULT_MUSIC_TRACKS: string[] = [
  '/assets/audio/tracks/track_01.mp3',
  '/assets/audio/tracks/track_02.mp3',
  '/assets/audio/tracks/track_03.mp3'
];

export class MusicManager {
  private audio: HTMLAudioElement;
  private availableTracks: string[];
  private currentTrack: string | null = null;
  private isMuted: boolean;
  private isPlayingWanted: boolean = false;
  private isPlayPending: boolean = false;
  private volume: number;
  private muteListeners: Set<(muted: boolean) => void> = new Set();

  constructor(tracks: string[] = DEFAULT_MUSIC_TRACKS, volume: number = 0.35) {
    this.availableTracks = [...tracks];
    this.volume = volume;
    this.isMuted = this.loadMuteState();

    this.audio = new Audio();
    this.audio.volume = this.volume;
    this.audio.muted = this.isMuted;

    // Enchaîner sur une autre piste aléatoire dès que la piste courante est terminée
    this.audio.addEventListener('ended', () => {
      if (this.isPlayingWanted) {
        this.playRandomTrack();
      }
    });

    // Si une piste configurée n'existe pas encore sur le disque, on la retire sans bloquer
    this.audio.addEventListener('error', () => {
      this.isPlayPending = false;
      if (this.currentTrack) {
        this.availableTracks = this.availableTracks.filter(t => t !== this.currentTrack);
        this.currentTrack = null;
      }
      if (this.isPlayingWanted && this.availableTracks.length > 0) {
        this.playRandomTrack();
      } else if (this.availableTracks.length === 0) {
        console.info('[MusicManager] Aucune piste musicale trouvée dans /assets/audio/tracks/.');
      }
    });

    // Déblocage autoplay si le navigateur a bloqué le premier play()
    const unlockAutoplay = () => {
      if (this.isPlayingWanted && !this.isPlayPending && this.audio.paused && this.availableTracks.length > 0) {
        this.safePlay();
      }
    };
    window.addEventListener('pointerdown', unlockAutoplay);
    window.addEventListener('keydown', unlockAutoplay);
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

  public start(): void {
    if (this.isPlayingWanted) return;
    this.isPlayingWanted = true;

    if (this.availableTracks.length === 0) return;

    if (this.audio.src && this.audio.paused && this.currentTrack) {
      this.safePlay();
    } else {
      this.playRandomTrack();
    }
  }

  public stop(): void {
    this.isPlayingWanted = false;
    this.isPlayPending = false;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  public playRandomTrack(): void {
    if (this.availableTracks.length === 0) return;

    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlayPending = false;

    const candidates =
      this.availableTracks.length > 1
        ? this.availableTracks.filter(t => t !== this.currentTrack)
        : this.availableTracks;

    const nextTrack = candidates[Math.floor(Math.random() * candidates.length)];
    this.currentTrack = nextTrack;
    this.audio.src = nextTrack;
    this.audio.volume = this.volume;
    this.audio.muted = this.isMuted;

    this.safePlay();
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    this.audio.muted = this.isMuted;
    this.saveMuteState(this.isMuted);
    this.muteListeners.forEach(cb => cb(this.isMuted));
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public onMuteChange(cb: (muted: boolean) => void): () => void {
    this.muteListeners.add(cb);
    return () => this.muteListeners.delete(cb);
  }
}

export const musicManager = new MusicManager();

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    musicManager.stop();
  });
}

