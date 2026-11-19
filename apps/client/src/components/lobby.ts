import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import {
  MessageType,
  type LobbyPlayerInfo,
  type LobbyStatePayload,
  type StartCountdownPayload,
  type RoundStartPayload,
  type KickedPayload
} from '@prop-hunt/shared';

export function renderLobby(): string {
  return `
    <!-- Vue 3 : Lobby Hébergé / Local (Scène 2.5D) -->
    <div id="view-lobby" class="view modal-view lobby-stage-view hidden">
      <!-- Bandeau supérieur en 3 colonnes -->
      <div class="lobby-top-grid">
        <!-- Haut Gauche : Compteur + Actions -->
        <div class="lobby-top-left">
          <h3 id="lobby-players-count" class="lobby-count-title">JOUEURS (0/12)</h3>
          <button class="btn back" id="btn-back-main-from-online">QUITTER LE SALON</button>
          <button class="btn secondary" id="btn-toggle-ready">SE DÉCLARER PRÊT</button>
          <button class="btn primary" id="btn-open-players-list">LISTE DES JOUEURS</button>
        </div>

        <!-- Haut Centre : Titre + Clé + Compte à rebours -->
        <div class="lobby-top-center">
          <h2 class="view-title blue-text">SALON DE JEU</h2>
          <div class="room-key-box">
            <span>CLÉ : <span id="lobby-room-key" class="room-key">LOCAL-XXXX</span></span>
            <button id="btn-copy-key" class="copy-key-btn" title="Copier la clé">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span id="copy-tooltip" class="copy-tooltip">Copié !</span>
            </button>
          </div>

          <div id="lobby-countdown-banner" style="display: none; padding: 8px 16px; background: rgba(56, 189, 248, 0.2); border: 1px solid #38bdf8; border-radius: 8px; color: #38bdf8; text-align: center; font-weight: bold;">
            ⏱️ LA PARTIE COMMENCE DANS <span id="lobby-countdown-sec">5</span>s...
          </div>
        </div>

        <!-- Haut Droite : Futur Chat Textuel -->
        <div class="lobby-chat-box">
          <div class="lobby-chat-title">CHAT TEXTUEL</div>
          <div class="lobby-chat-placeholder">Futur chat textuel du salon</div>
        </div>
      </div>

      <!-- Scène centrale : 4 joueurs max sur socles (dont joueur local au premier plan) -->
      <div id="lobby-stage" class="lobby-stage">
        <div style="color: #94a3b8; font-style: italic;">Connexion au salon...</div>
      </div>

      <!-- Modal : Liste complète des joueurs (1 à 12) -->
      <div id="lobby-players-modal" class="lobby-players-modal" style="display: none;">
        <div class="lobby-players-modal-card">
          <div class="lobby-players-modal-header">
            <h3 id="lobby-modal-title" class="view-title blue-text" style="font-size: 1.4rem; margin: 0;">LISTE DES JOUEURS</h3>
            <button id="btn-close-players-modal" class="btn back" style="width: auto; padding: 0.4rem 0.9rem; font-size: 0.85rem;">FERMER</button>
          </div>
          <div id="lobby-players-list" class="lobby-players-modal-list"></div>
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
  const btnOpenPlayersList = document.getElementById('btn-open-players-list');
  const btnClosePlayersModal = document.getElementById('btn-close-players-modal');
  const playersModal = document.getElementById('lobby-players-modal');
  const lobbyPlayersList = document.getElementById('lobby-players-list');
  const lobbyPlayersCount = document.getElementById('lobby-players-count');
  const lobbyModalTitle = document.getElementById('lobby-modal-title');
  const lobbyStage = document.getElementById('lobby-stage');
  const countdownBanner = document.getElementById('lobby-countdown-banner');
  const countdownSec = document.getElementById('lobby-countdown-sec');

  let countdownInterval: ReturnType<typeof setInterval> | null = null;
  let currentPlayers: LobbyPlayerInfo[] = [];
  let animFrame = 0;

  // Chargement du spritesheet IdleHuntLeft (grille 3x3, 8 frames actives + 9e case vide)
  const hunterSprite = new Image();
  hunterSprite.src = '/assets/characters/Hunter/IdleHuntLeft.png';

  function drawLobbyAvatars(): void {
    if (!hunterSprite.complete || hunterSprite.naturalWidth === 0) return;
    const frameW = hunterSprite.width / 3;
    const frameH = hunterSprite.height / 3;

    const canvases = document.querySelectorAll<HTMLCanvasElement>('.lobby-avatar-canvas');
    canvases.forEach((canvas, idx) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const frameIndex = (animFrame + idx * 2) % 8; // 8 frames valides (0..7)
      const col = frameIndex % 3;
      const row = Math.floor(frameIndex / 3);

      ctx.drawImage(
        hunterSprite,
        col * frameW,
        row * frameH,
        frameW,
        frameH,
        0,
        0,
        canvas.width,
        canvas.height
      );
    });
  }

  // Animation à 6 frames par seconde (1000 / 6 ≈ 167ms)
  setInterval(() => {
    if (viewLobby && !viewLobby.classList.contains('hidden')) {
      animFrame = (animFrame + 1) % 8;
      drawLobbyAvatars();
    }
  }, 1000 / 6);

  if (btnBackMainFromOnline) {
    btnBackMainFromOnline.addEventListener('click', () => {
      if (playersModal) playersModal.style.display = 'none';
      networkManager.send(MessageType.LEAVE_ROOM, {});
      switchView(viewLobby, viewMain);
    });
  }

  // Ouvrir / Fermer le modal "Liste des joueurs"
  if (btnOpenPlayersList && playersModal) {
    btnOpenPlayersList.addEventListener('click', () => {
      playersModal.style.display = 'flex';
    });
  }
  if (btnClosePlayersModal && playersModal) {
    btnClosePlayersModal.addEventListener('click', () => {
      playersModal.style.display = 'none';
    });
  }
  if (playersModal) {
    playersModal.addEventListener('click', (e) => {
      if (e.target === playersModal) {
        playersModal.style.display = 'none';
      }
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

  // Basculer l'état Prêt / Pas prêt via WebSocket
  if (btnToggleReady) {
    btnToggleReady.addEventListener('click', () => {
      networkManager.send(MessageType.PLAYER_TOGGLE_READY, {});
    });
  }

  // Action Kick autoritaire (déléguée sur la scène ET sur le modal liste des joueurs)
  function handleKickClick(target: HTMLElement): void {
    const kickBtn = target.closest('.kick-player-btn, .lobby-slot-kick-btn') as HTMLElement | null;
    if (!kickBtn) return;

    const targetPlayerId = kickBtn.dataset.playerId;
    const playerName = kickBtn.dataset.playerName || 'ce joueur';
    if (!targetPlayerId) return;

    if (confirm(`Voulez-vous vraiment expulser ${playerName} du salon ?`)) {
      networkManager.send(MessageType.KICK_PLAYER, { targetPlayerId });
    }
  }

  lobbyStage?.addEventListener('click', (e) => handleKickClick(e.target as HTMLElement));
  lobbyPlayersList?.addEventListener('click', (e) => handleKickClick(e.target as HTMLElement));

  // Rendu de la scène (4 joueurs max : moi au premier plan + 3 autres)
  function renderStage(players: LobbyPlayerInfo[]): void {
    if (!lobbyStage) return;

    const myId = networkManager.localPlayerId;
    const me = players.find(p => p.id === myId);
    const amIHost = me?.isHost ?? false;
    const others = players.filter(p => p.id !== myId);

    const visibleOthers = others.slice(0, 3);
    const extraCount = Math.max(0, others.length - 3);
    const otherPositions = ['pos-left', 'pos-far-right', 'pos-far-left'];

    const slotsHtml: string[] = [];

    if (me) {
      slotsHtml.push(buildStageSlotHtml(me, 'pos-center', true, false));
    }

    visibleOthers.forEach((other, idx) => {
      slotsHtml.push(buildStageSlotHtml(other, otherPositions[idx], false, amIHost));
    });

    const extraPillHtml = extraCount > 0
      ? `<div class="lobby-extra-players-pill">+ ${extraCount} autre(s) joueur(s) — voir "Liste des joueurs"</div>`
      : '';

    lobbyStage.innerHTML = slotsHtml.join('') + extraPillHtml;
    drawLobbyAvatars();
  }

  function buildStageSlotHtml(
    p: LobbyPlayerInfo,
    posClass: string,
    isMe: boolean,
    showKick: boolean
  ): string {
    const crownHtml = p.isHost ? '<span title="Hôte du salon">👑</span>' : '';
    const statusIcon = p.isReady
      ? '<span class="lobby-status-icon ready" title="Prêt">✔</span>'
      : '<span class="lobby-status-icon not-ready" title="En attente">✖</span>';
    const kickHtml = showKick
      ? `<button class="lobby-slot-kick-btn" data-player-id="${p.id}" data-player-name="${escapeHtml(p.name)}" title="Expulser ${escapeHtml(p.name)}">✕</button>`
      : '';

    return `
      <div class="lobby-slot ${posClass} ${isMe ? 'is-me' : ''}">
        <div class="lobby-slot-header">
          <div class="lobby-nameplate">${crownHtml}<span>${escapeHtml(p.name)}${isMe ? ' (Toi)' : ''}</span></div>
          ${statusIcon}
          ${kickHtml}
        </div>
        <canvas class="lobby-avatar-canvas" width="144" height="144"></canvas>
        <div class="lobby-pedestal"></div>
      </div>
    `;
  }

  // Rendu de la liste complète (1 à 12 joueurs) dans le modal
  function renderPlayersModalList(players: LobbyPlayerInfo[]): void {
    if (!lobbyPlayersList) return;

    const myId = networkManager.localPlayerId;
    const me = players.find(p => p.id === myId);
    const amIHost = me?.isHost ?? false;

    if (lobbyModalTitle) {
      lobbyModalTitle.textContent = `LISTE DES JOUEURS (${players.length}/12)`;
    }

    lobbyPlayersList.innerHTML = players.map(p => {
      const isMe = p.id === myId;
      const statusClass = p.isReady ? 'ready' : 'not-ready';
      const statusText = p.isReady ? 'PRÊT' : 'EN ATTENTE...';
      const crownTag = p.isHost ? '👑 ' : '';
      const meTag = isMe ? ' (Toi)' : '';

      const kickButtonHtml = (amIHost && !isMe)
        ? `<button class="kick-player-btn" data-player-id="${p.id}" data-player-name="${escapeHtml(p.name)}" title="Expulser ce joueur">
             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
               <line x1="18" y1="6" x2="6" y2="18"></line>
               <line x1="6" y1="6" x2="18" y2="18"></line>
             </svg>
           </button>`
        : '';

      return `
        <div class="player-item ${statusClass}" data-player-id="${p.id}">
          <span class="player-name">${crownTag}${escapeHtml(p.name)}${meTag}</span>
          <div class="player-controls">
            <span class="player-status">${statusText}</span>
            ${kickButtonHtml}
          </div>
        </div>
      `;
    }).join('');
  }

  // Synchronisation de la liste des joueurs du salon via WebSocket
  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, (payload) => {
    currentPlayers = payload.players;
    if (payload.roomKey && lobbyRoomKey) {
      lobbyRoomKey.textContent = payload.roomKey;
    }
    if (lobbyPlayersCount) {
      lobbyPlayersCount.textContent = `JOUEURS (${currentPlayers.length}/12)`;
    }

    renderStage(currentPlayers);
    renderPlayersModalList(currentPlayers);

    const me = currentPlayers.find(p => p.id === networkManager.localPlayerId);
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

  // Notification si le joueur local est expulsé par l'hôte depuis le salon
  networkManager.on<KickedPayload>(MessageType.KICKED, (payload) => {
    if (!viewLobby?.classList.contains('active')) return;
    if (playersModal) playersModal.style.display = 'none';
    if (countdownBanner) countdownBanner.style.display = 'none';
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    switchView(viewLobby, viewMain);
    alert(payload.reason || "Vous avez été expulsé du salon par l'hôte.");
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
    if (playersModal) playersModal.style.display = 'none';
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
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
