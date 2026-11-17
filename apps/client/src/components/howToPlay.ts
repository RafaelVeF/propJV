import { switchView } from './viewManager';

export function renderHowToPlay(): string {
  return `
    <!-- Vue 6 : Comment Jouer -->
    <div id="view-how-to-play" class="view modal-view hidden">
      <h2 class="view-title purple-text">COMMENT JOUER ?</h2>
      <div class="menu-container">
        <div class="info-card">
          <p><strong>Objectifs :</strong></p>
          <p style="margin-top: 10px;"><strong>Props : </strong>Transformez-vous en élément du décor et cachez-vous avant la fin du temps imparti !</p>
          <p style="margin-top: 10px;"><strong>Hunters : </strong>Trouvez et éliminez tous les props avant la fin du temps imparti !</p>
          <p style="margin-top: 10px;"><strong>Touches :</strong> Utilisez ZQSD pour vous déplacer et la souris pour interagir avec les éléments du décor ou votre arme.</p>
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
