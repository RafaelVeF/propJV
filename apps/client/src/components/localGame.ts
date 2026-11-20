import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import { getCurrentUser, onAuthChange } from '../services/authService';
import {
  MessageType,
  type LobbyStatePayload,
  type PublicRoomInfo,
  type RoomErrorPayload,
  type RoomsListPayload,
} from '@prop-hunt/shared';

const MAP_DISPLAY_NAMES: Record<string, string> = {
  map_01_32p: 'Complexe 32J',
  map_01_16p: 'Complexe 16J',
  map_test: 'Carte de test',
};

let externalNoticeMessage: string | null = null;

/**
 * Permet à une autre vue (ex: lobby.ts lors d'une expulsion) d'afficher un message
 * d'alerte non bloquant dès le retour sur #view-local.
 */
export function showLocalRoomNotice(message: string): void {
  externalNoticeMessage = message;
  const errorBox = document.getElementById('local-room-error');
  if (errorBox) {
    errorBox.textContent = message;
    errorBox.classList.add('is-visible');
  }
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderLocalGame(): string {
  return `
    <!-- Vue 2 : Sélection / Hébergement de Partie (100vh - 100% Souris - Mise en page plate 2 colonnes) -->
    <div id="view-local" class="view local-fullscreen-view hidden">
      <!-- 1. Barre supérieure fixe -->
      <header class="local-top-bar">
        <div class="local-top-inner">
          <div class="local-top-left">
            <button type="button" class="local-back-btn" id="btn-back-main-from-local">
              ← RETOUR
            </button>
          </div>

          <h1 class="local-brand-title">
            <span class="purple-text">REJOINDRE</span>
            <span class="stats-header-sep">OU</span>
            <span class="blue-text">HÉBERGER</span>
          </h1>

          <div class="local-top-right">
            <span class="local-player-tag" id="local-player-tag">MODE INVITÉ</span>
          </div>
        </div>
      </header>

      <!-- 2. Corps 2 colonnes séparées par un filet vertical fin -->
      <main class="local-stage">
        <div class="local-grid">
          <!-- Colonne Gauche : Actions directes (Héberger & Code privé) -->
          <section class="local-col local-col-left" aria-label="Créer ou rejoindre un salon">
            <div class="local-host-block">
              <button type="button" class="mm-cta-play local-host-cta" id="btn-host">
                <span class="mm-cta-bar" aria-hidden="true"></span>
                <span class="mm-cta-content">
                  <span class="mm-cta-title">HÉBERGER UNE PARTIE</span>
                  <span class="mm-cta-sub">CRÉER UN NOUVEAU SALON</span>
                </span>
                <span class="mm-cta-arrow" aria-hidden="true">→</span>
              </button>
            </div>

            <div class="local-divider" role="separator">
              <span>OU REJOINDRE PAR CODE</span>
            </div>

            <div class="local-join-block">
              <div class="local-join-row join-container">
                <input
                  type="text"
                  id="input-room-key"
                  class="input-field local-code-input"
                  placeholder="EX: LOCAL-A1B2"
                  maxlength="24"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button type="button" class="local-join-btn" id="btn-join-local">
                  <span>REJOINDRE</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
              <div
                id="local-room-error"
                class="local-room-error"
                role="alert"
                aria-live="polite"
              ></div>
            </div>
          </section>

          <!-- Colonne Droite : Salons publics actuellement hébergés -->
          <section class="local-col local-col-right" aria-label="Salons publics">
            <div class="local-servers-header">
              <div class="local-servers-heading-row">
                <h2 class="local-section-title">SALONS PUBLICS</h2>
              </div>

            </div>

            <!-- En-tête de colonnes de la table plate -->
            <div class="local-servers-cols-head" aria-hidden="true">
              <span>HÔTE &amp; CODE</span>
              <span>CARTE</span>
              <span>STATUT</span>
              <span class="align-right">JOUEURS</span>
              <span class="align-right">ACTION</span>
            </div>

            <!-- Liste scrollable interne des salons publics -->
            <div class="local-servers-list" id="local-servers-list"></div>
          </section>
        </div>
      </main>
    </div>
  `;
}

export function initLocalGame(): void {
  const viewMain = document.getElementById('view-main');
  const viewLocal = document.getElementById('view-local');
  const viewLobby = document.getElementById('view-lobby');
  const btnHostLocal = document.getElementById('btn-host') as HTMLButtonElement | null;
  const btnJoinLocal = document.getElementById('btn-join-local') as HTMLButtonElement | null;
  const btnBackMainFromLocal = document.getElementById('btn-back-main-from-local');
  const btnRefreshRooms = document.getElementById('btn-refresh-servers') as HTMLButtonElement | null;
  const joinInput = (document.getElementById('input-room-key') ??
    document.querySelector('#view-local .input-field')) as HTMLInputElement | null;
  const errorBox = document.getElementById('local-room-error');
  const roomsListContainer = document.getElementById('local-servers-list');
  const playerTag = document.getElementById('local-player-tag');

  let pendingRoomEnter = false;
  let pendingUnlockTimer: ReturnType<typeof setTimeout> | null = null;
  let currentRooms: PublicRoomInfo[] = [];

  function setInlineError(message: string | null): void {
    if (!errorBox) return;
    if (!message) {
      errorBox.textContent = '';
      errorBox.classList.remove('is-visible');
      return;
    }
    errorBox.textContent = message;
    errorBox.classList.add('is-visible');
  }

  function setPendingRoomEnter(locked: boolean): void {
    pendingRoomEnter = locked;
    if (pendingUnlockTimer) {
      clearTimeout(pendingUnlockTimer);
      pendingUnlockTimer = null;
    }

    if (btnHostLocal) {
      btnHostLocal.disabled = locked;
    }
    if (btnJoinLocal) {
      btnJoinLocal.disabled = locked;
    }
    if (roomsListContainer) {
      roomsListContainer.classList.toggle('is-joining', locked);
      const joinBtns = roomsListContainer.querySelectorAll<HTMLButtonElement>(
        '.local-row-join-btn:not(.is-locked)'
      );
      joinBtns.forEach((btn) => {
        btn.disabled = locked;
      });
    }

    if (locked) {
      pendingUnlockTimer = setTimeout(() => {
        if (pendingRoomEnter) {
          setPendingRoomEnter(false);
        }
      }, 4500);
    }
  }

  function updateHeaderStatus(): void {
    const user = getCurrentUser();
    if (playerTag) {
      playerTag.textContent = user ? user.username.toUpperCase() : 'MODE INVITÉ';
      playerTag.classList.toggle('is-auth', Boolean(user));
    }
  }

  function renderPublicRooms(rooms: PublicRoomInfo[]): void {
    if (!roomsListContainer) return;
    currentRooms = [...rooms];

    if (currentRooms.length === 0) {
      roomsListContainer.innerHTML = `
        <div class="local-servers-empty">
          <span class="local-empty-title">Aucun salon disponible pour le moment — hébergez une partie !</span>
        </div>
      `;
      return;
    }

    roomsListContainer.innerHTML = currentRooms
      .map((room) => {
        const isFull = room.playersCount >= room.maxPlayers;
        const isJoinable = room.status === 'WAITING' && !isFull;
        const mapLabel = MAP_DISPLAY_NAMES[room.map] ?? room.map;
        const statusLabel = isFull
          ? 'COMPLET'
          : room.status === 'IN_GAME'
          ? 'EN PARTIE'
          : 'EN ATTENTE';
        const statusClass = isFull
          ? 'status-full'
          : room.status === 'IN_GAME'
          ? 'status-ingame'
          : 'status-waiting';

        const safeKey = escapeHtml(room.roomKey);
        const rowAttr = isJoinable
          ? `data-join-room="${safeKey}" role="button" tabindex="0"`
          : `aria-disabled="true"`;

        const actionBtnHtml = isJoinable
          ? `<button type="button" class="local-row-join-btn" data-join-room="${safeKey}" ${
              pendingRoomEnter ? 'disabled' : ''
            }>
               <span>REJOINDRE</span>
               <span class="local-row-join-arrow" aria-hidden="true">→</span>
             </button>`
          : `<button type="button" class="local-row-join-btn is-locked" disabled>
               ${statusLabel}
             </button>`;

        return `
          <div class="local-server-row ${isJoinable ? 'is-joinable' : 'is-disabled'}" ${rowAttr}>
            <div class="local-srv-main">
              <span class="local-srv-name">Salon de ${escapeHtml(room.hostName)}</span>
              <span class="local-srv-host">${safeKey}</span>
            </div>
            <div class="local-srv-map">${escapeHtml(mapLabel)}</div>
            <div class="local-srv-status">
              <span class="local-status-tag ${statusClass}">${statusLabel}</span>
            </div>
            <div class="local-srv-players align-right">
              <span class="local-srv-count">${room.playersCount} <small>/ ${room.maxPlayers}</small></span>
            </div>
            <div class="local-srv-action align-right">
              ${actionBtnHtml}
            </div>
          </div>
        `;
      })
      .join('');
  }

  function requestRoomsList(): void {
    if (networkManager.isConnected) {
      networkManager.send(MessageType.LIST_ROOMS, {});
    } else {
      renderPublicRooms([]);
    }
  }

  function attemptJoinRoom(rawKey: string): void {
    if (pendingRoomEnter) return;
    setInlineError(null);

    const roomKey = rawKey.replace(/\s+/g, '').toUpperCase();
    if (!roomKey) {
      setInlineError('Veuillez saisir une clé de salon (ex : LOCAL-A1B2).');
      joinInput?.focus();
      return;
    }

    if (!networkManager.isConnected) {
      setInlineError('Serveur de jeu hors ligne. Impossible de rejoindre le salon.');
      return;
    }

    setPendingRoomEnter(true);
    networkManager.send(MessageType.JOIN_ROOM, { roomKey });
  }

  // Retour au menu principal
  if (btnBackMainFromLocal) {
    btnBackMainFromLocal.addEventListener('click', () => {
      setPendingRoomEnter(false);
      setInlineError(null);
      switchView(viewLocal, viewMain);
    });
  }

  // Héberger une nouvelle partie
  if (btnHostLocal) {
    btnHostLocal.addEventListener('click', () => {
      if (pendingRoomEnter) return;
      setInlineError(null);
      if (!networkManager.isConnected) {
        setInlineError('Serveur de jeu hors ligne. Vérifiez que game-server est démarré.');
        return;
      }
      setPendingRoomEnter(true);
      networkManager.send(MessageType.CREATE_ROOM, {});
    });
  }

  // Normalisation majuscules + suppression des espaces superflus + nettoyage de l'erreur à la saisie/collage
  function sanitizeCodeInput(): void {
    if (!joinInput) return;
    const cleaned = joinInput.value.replace(/\s+/g, '').toUpperCase();
    if (joinInput.value !== cleaned) {
      joinInput.value = cleaned;
    }
    setInlineError(null);
  }

  joinInput?.addEventListener('input', sanitizeCodeInput);
  joinInput?.addEventListener('paste', () => {
    setTimeout(sanitizeCodeInput, 0);
  });

  // Rejoindre un salon par clé saisie
  if (btnJoinLocal) {
    btnJoinLocal.addEventListener('click', () => {
      attemptJoinRoom(joinInput?.value || '');
    });
  }

  // Délégation d'événements : clic sur le bouton REJOINDRE → ou sur toute la ligne du salon en attente
  roomsListContainer?.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    const trigger = target?.closest<HTMLElement>('[data-join-room]');
    if (!trigger) return;

    const roomKey = trigger.dataset.joinRoom || '';
    attemptJoinRoom(roomKey);
  });

  btnRefreshRooms?.addEventListener('click', () => {
    setInlineError(null);
    requestRoomsList();
  });

  // Réception de la liste des salons publics depuis game-server
  networkManager.on<RoomsListPayload>(MessageType.ROOMS_LIST, (payload) => {
    renderPublicRooms(Array.isArray(payload?.rooms) ? payload.rooms : []);
  });

  // Basculer vers le salon uniquement lorsque le serveur confirme l'entrée dans la room
  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, () => {
    if (pendingRoomEnter && viewLocal && viewLobby) {
      setPendingRoomEnter(false);
      setInlineError(null);
      switchView(viewLocal, viewLobby);
    }
  });

  // Afficher l'erreur inline si la clé de salon est invalide, complète ou déjà en partie
  networkManager.on<RoomErrorPayload>(MessageType.ROOM_ERROR, (payload) => {
    setPendingRoomEnter(false);
    setInlineError(payload.message || 'Impossible de rejoindre ce salon.');
    requestRoomsList();
  });

  networkManager.onOpen(() => {
    if (viewLocal?.classList.contains('active')) {
      requestRoomsList();
    }
  });

  networkManager.onClose(() => {
    setPendingRoomEnter(false);
    if (viewLocal?.classList.contains('active')) {
      renderPublicRooms([]);
    }
  });

  onAuthChange(() => {
    updateHeaderStatus();
  });

  // Rafraîchir automatiquement les salons publics à chaque arrivée ou retour sur #view-local
  if (viewLocal) {
    const observer = new MutationObserver(() => {
      if (viewLocal.classList.contains('active') && !viewLocal.classList.contains('hidden')) {
        setPendingRoomEnter(false);
        if (externalNoticeMessage) {
          setInlineError(externalNoticeMessage);
          externalNoticeMessage = null;
        } else {
          setInlineError(null);
        }
        updateHeaderStatus();
        requestRoomsList();
      }
    });
    observer.observe(viewLocal, { attributes: true, attributeFilter: ['class'] });
  }

  updateHeaderStatus();
  renderPublicRooms([]);
}
