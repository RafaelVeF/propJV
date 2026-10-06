import { switchView } from './viewManager';

export function renderSettings(): string {
  return `
    <!-- Vue 4 : Paramètres -->
    <div id="view-settings" class="view modal-view hidden">
      <h2 class="view-title purple-text">PARAMÈTRES</h2>
      <div class="menu-container">
        <div class="join-container">
          <label class="input-label">VOLUME AUDIO</label>
          <input type="range" min="0" max="100" value="80" class="range-input" />
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

  if (btnBackMainFromSettings) {
    btnBackMainFromSettings.addEventListener('click', () => switchView(viewSettings, viewMain));
  }
}
