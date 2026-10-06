import { switchView } from './viewManager';

export function renderStats(): string {
  return `
    <!-- Vue 8 : Statistiques -->
    <div id="view-stats" class="view modal-view hidden">
      <h2 class="view-title purple-text">STATISTIQUES</h2>
      <div class="menu-container">
        <div class="info-card">
          <div class="stat-row"><span>Parties Jouées :</span> <strong>?</strong></div>
          <div class="stat-row"><span>Victoires :</span> <strong>?</strong></div>
          <div class="stat-row"><span>Ratio V/D :</span> <strong>?</strong></div>
        </div>
        <button class="btn back" id="btn-back-main-from-stats">RETOUR</button>
      </div>
    </div>
  `;
}

export function initStats(): void {
  const viewMain = document.getElementById('view-main');
  const viewStats = document.getElementById('view-stats');
  const btnBackMainFromStats = document.getElementById('btn-back-main-from-stats');

  if (btnBackMainFromStats) {
    btnBackMainFromStats.addEventListener('click', () => switchView(viewStats, viewMain));
  }
}
