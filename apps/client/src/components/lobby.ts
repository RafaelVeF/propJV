import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import {
  MessageType,
  type LobbyStatePayload,
  type StartCountdownPayload,
  type RoundStartPayload
} from '@prop-hunt/shared';

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

      <div id="lobby-countdown-banner" style="display: none; margin-bottom: 12px; padding: 10px 16px; background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 8px; color: #38bdf8; text-align: center; font-weight: bold;">
        ⏱️ LA PARTIE COMMENCE DANS <span id="lobby-countdown-sec">5</span>s...
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
  const viewGame = document.getElementById('view-game');
  const btnBackMainFromOnline = document.getElementById('btn-back-main-from-online');
  const btnCopyKey = document.getElementById('btn-copy-key');
  const lobbyRoomKey = document.getElementById('lobby-room-key');
  const copyTooltip = document.getElementById('copy-tooltip');
  const btnToggleReady = document.getElementById('btn-toggle-ready');
  const lobbyPlayersList = document.getElementById('lobby-players-list');
  const lobbyPlayersCount = document.getElementById('lobby-players-count');
  const countdownBanner = document.getElementById('lobby-countdown-banner');
  const countdownSec = document.getElementById('lobby-countdown-sec');

  let countdownInterval: ReturnType<typeof setInterval> | null = null;

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

  // Basculer l'état Prêt / Pas prêt via WebSocket
  if (btnToggleReady) {
    btnToggleReady.addEventListener('click', () => {
      networkManager.send(MessageType.PLAYER_TOGGLE_READY, {});
    });
  }

  // Synchronisation de la liste des joueurs du salon via WebSocket
  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, (payload) => {
    if (!lobbyPlayersList || !lobbyPlayersCount) return;

    lobbyPlayersCount.textContent = `JOUEURS (${payload.players.length}/12)`;

    const me = payload.players.find(p => p.id === networkManager.localPlayerId);
    const amIHost = me?.isHost ?? false;

    lobbyPlayersList.innerHTML = payload.players.map(p => {
      const isMe = p.id === networkManager.localPlayerId;
      const statusClass = p.isReady ? 'ready' : 'not-ready';
      const statusText = p.isReady ? 'PRÊT' : 'EN ATTENTE...';
      const hostTag = p.isHost ? ' (Hôte)' : '';
      const meTag = isMe ? ' (Toi)' : '';

      const kickButtonHtml = (amIHost && !isMe)
        ? `<button class="kick-player-btn" title="Expulser ce joueur">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
               <line x1="18" y1="6" x2="6" y2="18"></line>
               <line x1="6" y1="6" x2="18" y2="18"></line>
             </svg>
           </button>`
        : '';

      return `
        <div class="player-item ${statusClass}" data-player-id="${p.id}">
          <span class="player-name">${p.name}${hostTag}${meTag}</span>
          <div class="player-controls">
            <span class="player-status">${statusText}</span>
            ${kickButtonHtml}
          </div>
        </div>
      `;
    }).join('');

    if (btnToggleReady && me) {
      if (me.isReady) {
        btnToggleReady.textContent = 'ANNULER PRÊT';
        btnToggleReady.classList.remove('secondary');
        btnToggleReady.classList.add('primary');
      } else {
        btnToggleReady.textContent = 'SE DÉCLARER PRÊT';
        btnToggleReady.classList.remove('primary');
        btnToggleReady.classList.add('secondary');
      }
    }

    if (!payload.canStart && countdownBanner && countdownBanner.style.display !== 'none') {
      countdownBanner.style.display = 'none';
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }
  });

  // Compte à rebours avant lancement de la manche
  networkManager.on<StartCountdownPayload>(MessageType.START_COUNTDOWN, (payload) => {
    if (!countdownBanner || !countdownSec) return;

    let remaining = payload.countdownSeconds;
    countdownSec.textContent = remaining.toString();
    countdownBanner.style.display = 'block';

    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        countdownSec.textContent = remaining.toString();
      } else if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);
  });

  // Lancement de la manche : basculer vers l'écran de jeu
  networkManager.on<RoundStartPayload>(MessageType.ROUND_START, () => {
    if (countdownBanner) {
      countdownBanner.style.display = 'none';
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }
    if (viewLobby && viewGame) {
      switchView(viewLobby, viewGame);
    }
  });

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
