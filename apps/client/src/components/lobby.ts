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
          <span>SERVEUR : <span id="lobby-room-key" class="room-key">LOCAL-8080</span></span>
          <button id="btn-copy-key" class="copy-key-btn" title="Copier la clé">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span id="copy-tooltip" class="copy-tooltip">Copié !</span>
          </button>
        </div>
      </div>

      <!-- Compte à rebours avant démarrage -->
      <div id="lobby-countdown-banner" class="hidden" style="margin-bottom: 12px; padding: 12px 16px; background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 8px; color: #38bdf8; text-align: center; font-weight: bold; font-size: 1.1rem; box-shadow: 0 0 15px rgba(56, 189, 248, 0.4);">
        ⏱️ LA PARTIE COMMENCE DANS <span id="lobby-countdown-sec">5</span>s...
      </div>

      <div class="lobby-content">
        <div class="players-list">
          <h3 id="lobby-players-count">JOUEURS (0/12)</h3>
          <div id="lobby-players-list">
            <div style="color: #94a3b8; font-style: italic; padding: 12px;">Connexion au serveur...</div>
          </div>
        </div>

        <div class="lobby-actions">
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

  // Retour au menu principal
  if (btnBackMainFromOnline) {
    btnBackMainFromOnline.addEventListener('click', () => {
      switchView(viewLobby, viewMain);
    });
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

  // Clic sur "Se déclarer prêt"
  if (btnToggleReady) {
    btnToggleReady.addEventListener('click', () => {
      networkManager.send(MessageType.PLAYER_TOGGLE_READY, {});
    });
  }

  // 1. Réception de l'état du salon (liste des joueurs & statuts)
  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, (payload) => {
    if (!lobbyPlayersList || !lobbyPlayersCount) return;

    lobbyPlayersCount.textContent = `JOUEURS (${payload.players.length}/12)`;

    // Rendu dynamique de la liste des joueurs
    lobbyPlayersList.innerHTML = payload.players.map(p => {
      const isMe = p.id === networkManager.localPlayerId;
      const statusClass = p.isReady ? 'ready' : 'not-ready';
      const statusText = p.isReady ? 'PRÊT' : 'EN ATTENTE...';
      const hostBadge = p.isHost ? '<span style="color: #facc15; font-size: 0.85em; margin-left: 6px;">★ HÔTE</span>' : '';
      const meBadge = isMe ? '<span style="color: #38bdf8; font-size: 0.85em; margin-left: 4px;">(Toi)</span>' : '';

      return `
        <div class="player-item ${statusClass}" data-player-id="${p.id}">
          <span class="player-name">${escapeHtml(p.name)} ${hostBadge} ${meBadge}</span>
          <div class="player-controls">
            <span class="player-status">${statusText}</span>
          </div>
        </div>
      `;
    }).join('');

    // Mise à jour de l'état du bouton "Prêt" pour le joueur local
    const me = payload.players.find(p => p.id === networkManager.localPlayerId);
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

    // Si le compte à rebours était affiché mais qu'un joueur a annulé son statut prêt
    if (!payload.canStart && countdownBanner && !countdownBanner.classList.contains('hidden')) {
      countdownBanner.classList.add('hidden');
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }
  });

  // 2. Réception du lancement du compte à rebours
  networkManager.on<StartCountdownPayload>(MessageType.START_COUNTDOWN, (payload) => {
    if (!countdownBanner || !countdownSec) return;

    let remaining = payload.countdownSeconds;
    countdownSec.textContent = remaining.toString();
    countdownBanner.classList.remove('hidden');

    if (countdownInterval) clearInterval(countdownInterval);

    countdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        countdownSec.textContent = remaining.toString();
      } else {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }, 1000);
  });

  // 3. Début de la partie : basculer automatiquement sur la vue de jeu !
  networkManager.on<RoundStartPayload>(MessageType.ROUND_START, () => {
    if (countdownBanner) {
      countdownBanner.classList.add('hidden');
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
    }

    // Bascule automatique du salon vers le jeu
    if (viewLobby && viewGame) {
      console.log('[Lobby] Lancement de la partie ! Bascule vers la vue de jeu.');
      switchView(viewLobby, viewGame);
    }
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
