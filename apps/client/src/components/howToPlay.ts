import { switchView } from './viewManager';

export function renderHowToPlay(): string {
  return `
    <!-- Vue 6 : Comment Jouer -->
    <div id="view-how-to-play" class="view modal-view hidden">
      <h2 class="view-title purple-text">COMMENT JOUER ?</h2>
      <div class="menu-container">
        <div class="info-card">
          <p><strong>Objectifs : </strong><br>
          <p style="margin-top: 10px;"><strong>Props : </strong>Cachez-vous ou débusquez les accessoires avant la fin
            du temps imparti !</p>
          <p style="margin-top: 10px;"><strong>Hunter : </strong>Trouvez tous les props avant la fin du temps imparti
            !</p>
          </p>
          <p style="margin-top: 10px;"><strong>Touches :</strong> Utilisez ZQSD pour vous déplacer et la Souris pour
            interagir avec les éléments du décor ou votre arme.</p>
        </div>
        <button class="btn back" id="btn-back-main-from-how-to-play">RETOUR</button>
      </div>
    </div>
  `;
}

export function initHowToPlay(): void {
  const viewMain = document.getElementById('view-main');
  const viewHowToPlay = document.getElementById('view-how-to-play');
  const btnBackMainFromHowToPlay = document.getElementById('btn-back-main-from-how-to-play');

  if (btnBackMainFromHowToPlay) {
    btnBackMainFromHowToPlay.addEventListener('click', () => switchView(viewHowToPlay, viewMain));
  }
}
