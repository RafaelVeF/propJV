import { switchView } from './viewManager';

export function renderProfile(): string {
  return `
    <!-- Vue 5 : Profil -->
    <div id="view-profile" class="view modal-view hidden">
      <h2 class="view-title blue-text">PROFIL JOUEUR</h2>
      <div class="menu-container">
        <div class="join-container">
          <label class="input-label">PSEUDO</label>
          <input type="text" class="input-field" value="Joueur1" placeholder="Entrez votre pseudo" />
        </div>
        <button class="btn back" id="btn-back-main-from-profile">RETOUR</button>
      </div>
    </div>
  `;
}

export function initProfile(): void {
  const viewMain = document.getElementById('view-main');
  const viewProfile = document.getElementById('view-profile');
  const btnBackMainFromProfile = document.getElementById('btn-back-main-from-profile');

  if (btnBackMainFromProfile) {
    btnBackMainFromProfile.addEventListener('click', () => switchView(viewProfile, viewMain));
  }
}
