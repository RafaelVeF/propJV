import { switchView } from './viewManager';
import { musicManager } from '../audio/MusicManager';
import { getCurrentUser, onAuthChange } from '../services/authService';

const STORAGE_KEY_SFX_VOLUME = 'propjv:sfx:volume';

function loadSfxVolume(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SFX_VOLUME);
    if (raw === null) return 80;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed))) : 80;
  } catch {
    return 80;
  }
}

function saveSfxVolume(val: number): void {
  try {
    localStorage.setItem(
      STORAGE_KEY_SFX_VOLUME,
      String(Math.max(0, Math.min(100, Math.round(val))))
    );
  } catch {
    // Ignore si localStorage indisponible
  }
}

export function renderSettings(): string {
  const initialVolume = musicManager.getVolumePercent();
  const initialMuted = musicManager.getIsMuted();
  const initialSfx = loadSfxVolume();

  return `
    <!-- Vue 4 : Paramètres — Feuille de réglages centrée (max-width: 760px - 100vh - 100% Souris) -->
    <div id="view-settings" class="view settings-fullscreen-view hidden">
      <!-- 1. En-tête unifié (top-bar) -->
      <header class="local-top-bar">
        <div class="local-top-inner">
          <div class="local-top-left">
            <button type="button" class="local-back-btn" id="btn-back-main-from-settings">
              ← RETOUR
            </button>
          </div>

          <h1 class="local-brand-title">
            <span class="purple-text">PARAMÈTRES</span>
          </h1>

          <div class="local-top-right">
            <span class="local-player-tag" id="settings-account-pill">MODE INVITÉ</span>
          </div>
        </div>
      </header>

      <!-- 2. Colonne unique centrée (max-width: 760px) structurée par filets horizontaux -->
      <main class="settings-sheet-stage">
        <div class="settings-sheet-container">
          <!-- Bloc 1 : AUDIO -->
          <section class="settings-sheet-block" aria-label="Réglages audio">
            <div class="settings-sheet-block-head">
              <span class="local-kicker">01 · MIXAGE AUDIO</span>
              <h2 class="local-section-title">AUDIO</h2>
            </div>

            <div class="settings-control-row join-container">
              <div class="settings-audio-header">
                <label class="local-input-label" for="settings-volume-range">MUSIQUE D'AMBIANCE (LOBBY.MP3 &amp; PISTES EN JEU)</label>
                <span class="settings-volume-readout" id="settings-volume-value">${
                  initialMuted ? `MUET (${initialVolume}%)` : `${initialVolume}%`
                }</span>
              </div>
              <div class="settings-slider-line">
                <input
                  type="range"
                  id="settings-volume-range"
                  min="0"
                  max="100"
                  value="${initialVolume}"
                  class="range-input settings-flat-range"
                />
                <button
                  type="button"
                  class="friends-flat-btn settings-mute-btn"
                  id="btn-settings-mute"
                  aria-pressed="${initialMuted}"
                >
                  ${initialMuted ? 'ACTIVER LE SON' : 'COUPER LE SON'}
                </button>
              </div>
            </div>

            <div class="settings-control-row join-container">
              <div class="settings-audio-header">
                <label class="local-input-label" for="settings-sfx-range">EFFETS SONORES &amp; TAUNTS (SFX)</label>
                <span class="settings-volume-readout" id="settings-sfx-value">${initialSfx}%</span>
              </div>
              <input
                type="range"
                id="settings-sfx-range"
                min="0"
                max="100"
                value="${initialSfx}"
                class="range-input settings-flat-range"
              />
            </div>
          </section>

          <!-- Bloc 2 : INTERFACE & JEU -->
          <section class="settings-sheet-block" aria-label="Interface et jeu">
            <div class="settings-sheet-block-head">
              <span class="local-kicker">02 · PRÉFÉRENCES</span>
              <h2 class="local-section-title">INTERFACE &amp; JEU</h2>
            </div>

            <div class="settings-two-cols">
              <div class="settings-control-row join-container">
                <label class="local-input-label" for="settings-keyboard-select">DISPOSITION CLAVIER</label>
                <select id="settings-keyboard-select" class="input-field settings-flat-select">
                  <option value="AZERTY" selected>AZERTY (Z Q S D)</option>
                  <option value="QWERTY">QWERTY (W A S D)</option>
                </select>
              </div>

              <div class="settings-control-row join-container">
                <label class="local-input-label" for="settings-lang-select">LANGUE DE L'INTERFACE</label>
                <select id="settings-lang-select" class="input-field settings-flat-select">
                  <option value="FR" selected>FRANÇAIS</option>
                  <option value="EN">ENGLISH</option>
                </select>
              </div>
            </div>

            <div class="settings-account-row">
              <div class="settings-account-meta">
                <span class="settings-account-name" id="settings-account-username">SESSION INVITÉ</span>
                <span class="settings-account-sub" id="settings-account-desc">Connectez-vous depuis l'accueil pour synchroniser vos statistiques et pièces d'or.</span>
              </div>
            </div>
          </section>

          <!-- Bloc 3 : RACCOURCIS CLAVIER (Touches <kbd> stylisées) -->
          <section class="settings-sheet-block settings-section-last" aria-label="Raccourcis clavier en partie">
            <div class="settings-sheet-block-head">
              <span class="local-kicker">03 · CONTRÔLES EN MANCHE</span>
              <h2 class="local-section-title">RACCOURCIS CLAVIER</h2>
            </div>

            <div class="settings-keycaps-grid">
              <div class="settings-keycap-row">
                <div class="keycap-row-info">
                  <span class="binding-action">Déplacement du personnage</span>
                  <span class="binding-camp">HUNTER &amp; PROP</span>
                </div>
                <div class="keycap-group">
                  <kbd class="keycap">Z</kbd>
                  <kbd class="keycap">Q</kbd>
                  <kbd class="keycap">S</kbd>
                  <kbd class="keycap">D</kbd>
                </div>
              </div>

              <div class="settings-keycap-row">
                <div class="keycap-row-info">
                  <span class="binding-action">Roue de transformation (Prop) / Emotes (Hunter)</span>
                  <span class="binding-camp purple-text">ACTION RADIALE</span>
                </div>
                <div class="keycap-group">
                  <kbd class="keycap">E</kbd>
                </div>
              </div>

              <div class="settings-keycap-row">
                <div class="keycap-row-info">
                  <span class="binding-action">Rechargement arme (Hunter) / Rotation &amp; Sifflet (Prop)</span>
                  <span class="binding-camp blue-text">TACTIQUE</span>
                </div>
                <div class="keycap-group">
                  <kbd class="keycap">R</kbd>
                </div>
              </div>

              <div class="settings-keycap-row">
                <div class="keycap-row-info">
                  <span class="binding-action">Sélection rapide d'arme (Fusil, Canon, Lanceur)</span>
                  <span class="binding-camp blue-text">HUNTER</span>
                </div>
                <div class="keycap-group">
                  <kbd class="keycap">1</kbd>
                  <kbd class="keycap">2</kbd>
                  <kbd class="keycap">3</kbd>
                </div>
              </div>

              <div class="settings-keycap-row">
                <div class="keycap-row-info">
                  <span class="binding-action">Ouvrir le chat textuel en partie</span>
                  <span class="binding-camp">COMMUNICATION</span>
                </div>
                <div class="keycap-group">
                  <kbd class="keycap">T</kbd>
                </div>
              </div>

              <div class="settings-keycap-row">
                <div class="keycap-row-info">
                  <span class="binding-action">Menu pause en cours de manche</span>
                  <span class="binding-camp">SYSTÈME</span>
                </div>
                <div class="keycap-group">
                  <kbd class="keycap keycap-wide">ÉCHAP</kbd>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  `;
}

export function initSettings(): void {
  const viewMain = document.getElementById('view-main');
  const viewSettings = document.getElementById('view-settings');
  const btnBackMainFromSettings = document.getElementById('btn-back-main-from-settings');
  const volumeSlider = document.getElementById('settings-volume-range') as HTMLInputElement | null;
  const volumeValue = document.getElementById('settings-volume-value');
  const btnMute = document.getElementById('btn-settings-mute') as HTMLButtonElement | null;
  const sfxSlider = document.getElementById('settings-sfx-range') as HTMLInputElement | null;
  const sfxValue = document.getElementById('settings-sfx-value');
  const accountPill = document.getElementById('settings-account-pill');
  const accountUsername = document.getElementById('settings-account-username');
  const accountDesc = document.getElementById('settings-account-desc');

  const updateRangeFill = (slider: HTMLInputElement | null, val: number) => {
    if (!slider) return;
    slider.style.setProperty('--range-pct', `${Math.max(0, Math.min(100, val))}%`);
  };

  const syncAudioUi = (): void => {
    const vol = musicManager.getVolumePercent();
    const muted = musicManager.getIsMuted();

    if (volumeSlider && document.activeElement !== volumeSlider) {
      volumeSlider.value = String(vol);
    }
    updateRangeFill(volumeSlider, muted ? 0 : vol);
    if (volumeValue) {
      volumeValue.textContent = muted ? `MUET (${vol}%)` : `${vol}%`;
    }
    if (btnMute) {
      btnMute.textContent = muted ? 'ACTIVER LE SON' : 'COUPER LE SON';
      btnMute.setAttribute('aria-pressed', String(muted));
    }
  };

  const syncAccountUi = (): void => {
    const user = getCurrentUser();
    if (accountPill) {
      accountPill.textContent = user ? user.username.toUpperCase() : 'MODE INVITÉ';
      accountPill.classList.toggle('is-auth', Boolean(user));
    }
    if (accountUsername) {
      accountUsername.textContent = user
        ? `CONNECTÉ EN TANT QUE ${user.username.toUpperCase()}`
        : 'SESSION INVITÉ';
    }
    if (accountDesc) {
      accountDesc.textContent = user
        ? `${user.email}`
        : "Connectez-vous depuis l'accueil pour synchroniser vos données";
    }
  };

  volumeSlider?.addEventListener('input', () => {
    const val = Number(volumeSlider.value);
    musicManager.setVolumePercent(val);
    syncAudioUi();
  });

  sfxSlider?.addEventListener('input', () => {
    const val = Number(sfxSlider.value);
    saveSfxVolume(val);
    updateRangeFill(sfxSlider, val);
    if (sfxValue) {
      sfxValue.textContent = `${val}%`;
    }
  });

  btnMute?.addEventListener('click', () => {
    musicManager.toggleMute();
    syncAudioUi();
  });

  musicManager.onMuteChange(() => syncAudioUi());
  musicManager.onVolumeChange(() => syncAudioUi());
  onAuthChange(() => syncAccountUi());

  updateRangeFill(sfxSlider, loadSfxVolume());
  syncAudioUi();
  syncAccountUi();

  if (btnBackMainFromSettings) {
    btnBackMainFromSettings.addEventListener('click', () => switchView(viewSettings, viewMain));
  }
}
