import { switchView } from './viewManager';
import { musicManager } from '../audio/MusicManager';

export function renderSettings(): string {
  const initialVolume = musicManager.getVolumePercent();
  const initialMuted = musicManager.getIsMuted();

  return `
    <!-- Vue 4 : Paramètres -->
    <div id="view-settings" class="view modal-view hidden">
      <h2 class="view-title purple-text">PARAMÈTRES</h2>
      <div class="menu-container">
        <div class="join-container">
          <div class="settings-audio-header">
            <label class="input-label" for="settings-volume-range">VOLUME AUDIO</label>
            <span class="settings-volume-readout" id="settings-volume-value">${initialMuted ? 'MUET' : `${initialVolume}%`}</span>
          </div>
          <div class="settings-audio-controls">
            <input
              type="range"
              id="settings-volume-range"
              min="0"
              max="100"
              value="${initialVolume}"
              class="range-input"
            />
            <button
              type="button"
              class="btn secondary settings-mute-btn"
              id="btn-settings-mute"
              aria-pressed="${initialMuted}"
            >
              ${initialMuted ? 'ACTIVER LE SON' : 'COUPER LE SON'}
            </button>
          </div>
        </div>
        <div class="join-container">
          <label class="input-label">CLAVIER</label>
          <select class="input-field">
            <option value="AZERTY" selected>Azerty</option>
            <option value="QWERTY">Qwerty</option>
          </select>
        </div>
        <div class="join-container">
          <label class="input-label">LANGUE</label>
          <select class="input-field">
            <option value="FR" selected>Français</option>
            <option value="EN">English</option>
          </select>
        </div>
        <button class="btn back" id="btn-back-main-from-settings">RETOUR</button>
      </div>
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

  const syncAudioUi = (): void => {
    const vol = musicManager.getVolumePercent();
    const muted = musicManager.getIsMuted();

    if (volumeSlider && document.activeElement !== volumeSlider) {
      volumeSlider.value = String(vol);
    }
    if (volumeValue) {
      volumeValue.textContent = muted ? `MUET (${vol}%)` : `${vol}%`;
    }
    if (btnMute) {
      btnMute.textContent = muted ? 'ACTIVER LE SON' : 'COUPER LE SON';
      btnMute.setAttribute('aria-pressed', String(muted));
    }
  };

  volumeSlider?.addEventListener('input', () => {
    const val = Number(volumeSlider.value);
    musicManager.setVolumePercent(val);
    syncAudioUi();
  });

  btnMute?.addEventListener('click', () => {
    musicManager.toggleMute();
    syncAudioUi();
  });

  musicManager.onMuteChange(() => syncAudioUi());
  musicManager.onVolumeChange(() => syncAudioUi());
  syncAudioUi();

  if (btnBackMainFromSettings) {
    btnBackMainFromSettings.addEventListener('click', () => switchView(viewSettings, viewMain));
  }
}
