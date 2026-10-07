import { switchView } from './viewManager';

export function renderLobby(): string {
  return `
    <!-- Vue 3 : Lobby Hébergé / En ligne (Salon) -->
    <div id="view-lobby" class="view modal-view hidden">
      <div class="lobby-header">
        <h2 class="view-title blue-text">SALON DE JEU</h2>
        <div class="room-key-box">
          <span>CLÉ : <span id="lobby-room-key" class="room-key">LOCAL-XYZ9</span></span>
          <button id="btn-copy-key" class="copy-key-btn" title="Copier la clé">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span id="copy-tooltip" class="copy-tooltip">Copié !</span>
          </button>
        </div>
      </div>

      <div class="lobby-content">
        <div class="players-list">
          <h3 id="lobby-players-count">JOUEURS (2/12)</h3>
          <div id="lobby-players-list">
            <div class="player-item ready">
              <span class="player-name">Hôte (Toi)</span>
              <div class="player-controls">
                <span class="player-status">PRÊT</span>
              </div>
            </div>
            <div class="player-item not-ready">
              <span class="player-name">Joueur 2</span>
              <div class="player-controls">
                <span class="player-status">EN ATTENTE...</span>
                <button class="kick-player-btn" title="Expulser ce joueur">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="lobby-actions">
          <button class="btn primary" id="btn-start-game">LANCER LA PARTIE</button>
          <button class="btn secondary" id="btn-toggle-ready">SE DÉCLARER PRÊT</button>
          <button class="btn back" id="btn-back-main-from-online">QUITTER LE SALON</button>
        </div>
      </div>
    </div>
  `;
}

export function initLobby(): void {
  const viewMain = document.getElementById('view-main');
  const viewLobby = document.getElementById('view-lobby');
  const btnBackMainFromOnline = document.getElementById('btn-back-main-from-online');
  const btnCopyKey = document.getElementById('btn-copy-key');
  const lobbyRoomKey = document.getElementById('lobby-room-key');
  const copyTooltip = document.getElementById('copy-tooltip');
  const btnToggleReady = document.getElementById('btn-toggle-ready');
  const lobbyPlayersList = document.getElementById('lobby-players-list');
  const lobbyPlayersCount = document.getElementById('lobby-players-count');

  if (btnBackMainFromOnline) {
    btnBackMainFromOnline.addEventListener('click', () => switchView(viewLobby, viewMain));
  }

  // Copier la clé du lobby
  if (btnCopyKey && lobbyRoomKey) {
    btnCopyKey.addEventListener('click', async () => {
      const key = lobbyRoomKey.textContent?.trim() || '';
      if (key) {
        try {
          await navigator.clipboard.writeText(key);
        } catch {
          const tempInput = document.createElement('input');
          tempInput.value = key;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
        }

        if (copyTooltip) {
          copyTooltip.classList.add('show');
          setTimeout(() => {
            copyTooltip.classList.remove('show');
          }, 1500);
        }
      }
    });
  }

  // Basculer l'état Prêt / Pas prêt (pour la démo / local)
  let isReady = false;
  if (btnToggleReady) {
    btnToggleReady.addEventListener('click', () => {
      isReady = !isReady;
      const hostItem = lobbyPlayersList?.querySelector('.player-item');
      const hostStatus = hostItem?.querySelector('.player-status');

      if (isReady) {
        btnToggleReady.textContent = 'ANNULER PRÊT';
        btnToggleReady.classList.remove('secondary');
        btnToggleReady.classList.add('primary');
        if (hostStatus && hostItem) {
          hostStatus.textContent = 'PRÊT';
          hostItem.classList.remove('not-ready');
          hostItem.classList.add('ready');
        }
      } else {
        btnToggleReady.textContent = 'SE DÉCLARER PRÊT';
        btnToggleReady.classList.remove('primary');
        btnToggleReady.classList.add('secondary');
        if (hostStatus && hostItem) {
          hostStatus.textContent = 'EN ATTENTE...';
          hostItem.classList.remove('ready');
          hostItem.classList.add('not-ready');
        }
      }
    });
  }

  // Expulser un joueur du lobby (action hôte)
  if (lobbyPlayersList) {
    lobbyPlayersList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const kickBtn = target.closest('.kick-player-btn');
      if (kickBtn) {
        const playerItem = kickBtn.closest('.player-item');
        if (playerItem) {
          const playerName = playerItem.querySelector('.player-name')?.textContent || 'ce joueur';
          if (confirm(`Voulez-vous vraiment expulser ${playerName} du salon ?`)) {
            playerItem.remove();
            const currentCount = lobbyPlayersList.querySelectorAll('.player-item').length;
            if (lobbyPlayersCount) {
              lobbyPlayersCount.textContent = `JOUEURS (${currentCount}/12)`;
            }
          }
        }
      }
    });
  }
}
