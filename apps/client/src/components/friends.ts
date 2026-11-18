import type { FriendEntry, FriendRequestEntry, FriendsOverviewResponse } from '@prop-hunt/shared';
import { isAuthenticated, onAuthChange } from '../services/authService';
import {
  acceptFriendRequest,
  blockUser,
  fetchFriendsOverview,
  FriendsServiceError,
  rejectFriendRequest,
  removeFriend,
  sendFriendRequest,
} from '../services/friendsService';
import { switchView } from './viewManager';

type AlertKind = 'error' | 'success' | 'info';

const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/;
const RECENT_ACTIVITY_MS = 15 * 60 * 1000;

function setAlert(el: HTMLElement | null, kind: AlertKind | null, message = ''): void {
  if (!el) return;
  el.classList.remove('error', 'success', 'info');
  el.textContent = message;
  if (kind && message) {
    el.classList.add(kind);
  }
}

function isRecentlyActive(lastConnection: string | Date | null | undefined): boolean {
  if (!lastConnection) return false;
  const timestamp = new Date(lastConnection).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= RECENT_ACTIVITY_MS;
}

function createEmptyNotice(text: string): HTMLElement {
  const el = document.createElement('p');
  el.className = 'friends-empty-state';
  el.textContent = text;
  return el;
}

function createActionButton(
  label: string,
  className: string,
  action: string,
  relationshipId: number,
  username?: string
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = label;
  btn.dataset.friendAction = action;
  btn.dataset.relationshipId = String(relationshipId);
  if (username) {
    btn.dataset.username = username;
  }
  return btn;
}

function createFriendRow(friend: FriendEntry): HTMLElement {
  const active = isRecentlyActive(friend.lastConnection);
  const row = document.createElement('div');
  row.className = `player-item ${active ? 'ready' : 'not-ready'}`;

  const info = document.createElement('div');
  info.className = 'friend-info';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = friend.username;

  const statusSpan = document.createElement('span');
  statusSpan.className = 'player-status';
  statusSpan.textContent = active ? 'Actif récemment' : 'Hors ligne';

  info.append(nameSpan, statusSpan);

  const actions = document.createElement('div');
  actions.className = 'request-actions';
  actions.append(
    createActionButton('Bloquer', 'btn secondary friend-muted-btn', 'block', friend.relationshipId, friend.username),
    createActionButton('Supprimer', 'btn secondary reject-btn', 'remove', friend.relationshipId, friend.username)
  );

  row.append(info, actions);
  return row;
}

function createIncomingRequestRow(request: FriendRequestEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'player-item request-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = request.username;

  const actions = document.createElement('div');
  actions.className = 'request-actions';
  actions.append(
    createActionButton('Accepter', 'btn primary accept-btn', 'accept', request.relationshipId),
    createActionButton('Refuser', 'btn secondary reject-btn', 'reject', request.relationshipId)
  );

  row.append(nameSpan, actions);
  return row;
}

function createOutgoingRequestRow(request: FriendRequestEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'player-item request-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = request.username;

  const actions = document.createElement('div');
  actions.className = 'request-actions';
  actions.append(
    createActionButton('Annuler', 'btn secondary reject-btn', 'reject', request.relationshipId)
  );

  row.append(nameSpan, actions);
  return row;
}

function createBlockedRow(blocked: FriendEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'player-item not-ready';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = blocked.username;

  const actions = document.createElement('div');
  actions.className = 'request-actions';
  actions.append(
    createActionButton('Débloquer', 'btn secondary friend-muted-btn', 'unblock', blocked.relationshipId)
  );

  row.append(nameSpan, actions);
  return row;
}

export function renderFriends(): string {
  return `
    <!-- Vue 7 : Amis -->
    <div id="view-friends" class="view modal-view hidden">
      <h2 class="view-title purple-text">AMIS</h2>
      <div class="menu-container friends-container">
        <div id="friends-alert" class="auth-alert" role="alert" aria-live="polite"></div>

        <!-- Invité (non connecté) -->
        <div id="friends-guest-notice" class="friends-guest-box hidden">
          <p class="friends-guest-text">Connectez-vous pour retrouver vos amis et gérer vos demandes.</p>
          <button type="button" class="btn primary" id="btn-friends-open-auth">SE CONNECTER</button>
        </div>

        <!-- Contenu connecté -->
        <div id="friends-authenticated-content">
          <!-- Liste des Amis -->
          <div class="players-list">
            <div class="list-header">
              <h3>LISTE D'AMIS <span id="friends-count" class="friends-count-badge">0</span></h3>
              <div class="friends-header-actions">
                <button type="button" class="icon-btn-inline purple-text" id="btn-refresh-friends" title="Actualiser">↻</button>
                <button type="button" class="icon-btn-inline purple-text" id="btn-open-add-friend" title="Ajouter un ami">+</button>
              </div>
            </div>
            <div id="friends-items-list" class="scrollable-friends-items"></div>
          </div>

          <!-- Section Demandes Reçues -->
          <div class="players-list requests-list">
            <h3>DEMANDES REÇUES <span id="incoming-requests-count" class="friends-count-badge">0</span></h3>
            <div id="requests-items-list" class="scrollable-friends-items"></div>
          </div>

          <!-- Section Demandes Envoyées -->
          <div id="outgoing-requests-section" class="players-list requests-list hidden">
            <h3>DEMANDES ENVOYÉES <span id="outgoing-requests-count" class="friends-count-badge">0</span></h3>
            <div id="outgoing-requests-list" class="scrollable-friends-items"></div>
          </div>

          <!-- Section Utilisateurs Bloqués -->
          <div id="blocked-users-section" class="players-list requests-list hidden">
            <h3>UTILISATEURS BLOQUÉS <span id="blocked-users-count" class="friends-count-badge">0</span></h3>
            <div id="blocked-users-list" class="scrollable-friends-items"></div>
          </div>
        </div>

        <button type="button" class="btn back" id="btn-back-main-from-friends">RETOUR</button>
      </div>
    </div>

    <!-- Vue 7b : Ajouter un Ami -->
    <div id="view-add-friend" class="view modal-view hidden">
      <h2 class="view-title purple-text">AJOUTER UN AMI</h2>
      <form id="form-add-friend" class="menu-container" novalidate>
        <div id="add-friend-alert" class="auth-alert" role="alert" aria-live="polite"></div>
        <div class="join-container">
          <label class="input-label" for="input-add-friend">PSEUDO DE L'AMI</label>
          <input
            type="text"
            id="input-add-friend"
            class="input-field"
            maxlength="30"
            autocomplete="off"
            placeholder="Entrez le pseudo..."
          />
        </div>
        <button type="submit" class="btn primary" id="btn-add-friend">
          <span>+ ENVOYER LA DEMANDE</span>
        </button>
        <button type="button" class="btn back" id="btn-back-friends-from-add-friend">RETOUR</button>
      </form>
    </div>
  `;
}

export function initFriends(): void {
  const viewMain = document.getElementById('view-main');
  const viewAuth = document.getElementById('view-auth');
  const viewFriends = document.getElementById('view-friends');
  const viewAddFriend = document.getElementById('view-add-friend');

  const btnOpenFriends = document.getElementById('btn-friends');
  const btnFriendsOpenAuth = document.getElementById('btn-friends-open-auth');
  const btnBackMainFromFriends = document.getElementById('btn-back-main-from-friends');
  const btnRefreshFriends = document.getElementById('btn-refresh-friends');
  const btnOpenAddFriend = document.getElementById('btn-open-add-friend');
  const btnBackFriendsFromAddFriend = document.getElementById('btn-back-friends-from-add-friend');

  const formAddFriend = document.getElementById('form-add-friend') as HTMLFormElement | null;
  const btnAddFriend = document.getElementById('btn-add-friend') as HTMLButtonElement | null;
  const inputAddFriend = document.getElementById('input-add-friend') as HTMLInputElement | null;

  const friendsAlert = document.getElementById('friends-alert');
  const addFriendAlert = document.getElementById('add-friend-alert');
  const guestNotice = document.getElementById('friends-guest-notice');
  const authenticatedContent = document.getElementById('friends-authenticated-content');

  const friendsItemsList = document.getElementById('friends-items-list');
  const requestsItemsList = document.getElementById('requests-items-list');
  const outgoingSection = document.getElementById('outgoing-requests-section');
  const outgoingList = document.getElementById('outgoing-requests-list');
  const blockedSection = document.getElementById('blocked-users-section');
  const blockedList = document.getElementById('blocked-users-list');

  const friendsCount = document.getElementById('friends-count');
  const incomingCount = document.getElementById('incoming-requests-count');
  const outgoingCount = document.getElementById('outgoing-requests-count');
  const blockedCount = document.getElementById('blocked-users-count');

  const renderOverview = (data: FriendsOverviewResponse): void => {
    const friends = data.friends ?? [];
    const incoming = data.incomingRequests ?? [];
    const outgoing = data.outgoingRequests ?? [];
    const blocked = data.blockedUsers ?? [];

    if (friendsCount) friendsCount.textContent = String(friends.length);
    if (incomingCount) incomingCount.textContent = String(incoming.length);
    if (outgoingCount) outgoingCount.textContent = String(outgoing.length);
    if (blockedCount) blockedCount.textContent = String(blocked.length);

    if (friendsItemsList) {
      friendsItemsList.replaceChildren(
        ...(friends.length > 0
          ? friends.map(createFriendRow)
          : [createEmptyNotice('Aucun ami pour le moment.')])
      );
    }

    if (requestsItemsList) {
      requestsItemsList.replaceChildren(
        ...(incoming.length > 0
          ? incoming.map(createIncomingRequestRow)
          : [createEmptyNotice('Aucune demande reçue.')])
      );
    }

    if (outgoingSection && outgoingList) {
      outgoingSection.classList.toggle('hidden', outgoing.length === 0);
      outgoingList.replaceChildren(...outgoing.map(createOutgoingRequestRow));
    }

    if (blockedSection && blockedList) {
      blockedSection.classList.toggle('hidden', blocked.length === 0);
      blockedList.replaceChildren(...blocked.map(createBlockedRow));
    }
  };

  const syncAuthVisibility = (): boolean => {
    const loggedIn = isAuthenticated();
    guestNotice?.classList.toggle('hidden', loggedIn);
    authenticatedContent?.classList.toggle('hidden', !loggedIn);
    return loggedIn;
  };

  const loadFriends = async (silentAlert = false): Promise<void> => {
    if (!silentAlert) {
      setAlert(friendsAlert, null);
    }
    if (!syncAuthVisibility()) {
      return;
    }

    try {
      const overview = await fetchFriendsOverview();
      renderOverview(overview);
    } catch (error) {
      const message =
        error instanceof FriendsServiceError
          ? error.message
          : 'Impossible de charger votre liste d’amis.';
      setAlert(friendsAlert, 'error', message);
    }
  };

  const executeRowAction = async (btn: HTMLButtonElement): Promise<void> => {
    const action = btn.dataset.friendAction;
    const relationshipId = Number.parseInt(btn.dataset.relationshipId ?? '', 10);
    const username = btn.dataset.username;

    if (!action || Number.isNaN(relationshipId)) return;

    btn.disabled = true;
    setAlert(friendsAlert, null);

    try {
      let responseMessage = '';
      if (action === 'accept') {
        responseMessage = (await acceptFriendRequest(relationshipId)).message;
      } else if (action === 'reject') {
        responseMessage = (await rejectFriendRequest(relationshipId)).message;
      } else if (action === 'remove' || action === 'unblock') {
        responseMessage = (await removeFriend(relationshipId)).message;
      } else if (action === 'block' && username) {
        responseMessage = (await blockUser(username)).message;
      }

      if (responseMessage) {
        setAlert(friendsAlert, 'success', responseMessage);
      }
      await loadFriends(true);
    } catch (error) {
      const message =
        error instanceof FriendsServiceError ? error.message : 'Action impossible pour le moment.';
      setAlert(friendsAlert, 'error', message);
      btn.disabled = false;
    }
  };

  // Navigation
  btnOpenFriends?.addEventListener('click', () => {
    void loadFriends();
  });

  btnFriendsOpenAuth?.addEventListener('click', () => {
    switchView(viewFriends, viewAuth);
  });

  btnBackMainFromFriends?.addEventListener('click', () => {
    setAlert(friendsAlert, null);
    switchView(viewFriends, viewMain);
  });

  btnRefreshFriends?.addEventListener('click', () => {
    void loadFriends();
  });

  btnOpenAddFriend?.addEventListener('click', () => {
    setAlert(addFriendAlert, null);
    if (inputAddFriend) inputAddFriend.value = '';
    switchView(viewFriends, viewAddFriend);
    inputAddFriend?.focus();
  });

  btnBackFriendsFromAddFriend?.addEventListener('click', () => {
    setAlert(addFriendAlert, null);
    switchView(viewAddFriend, viewFriends);
  });

  // Délégation des actions sur les listes (accepter, refuser, annuler, supprimer, bloquer, débloquer)
  authenticatedContent?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const actionBtn = target?.closest<HTMLButtonElement>('button[data-friend-action]');
    if (actionBtn) {
      void executeRowAction(actionBtn);
    }
  });

  // Envoi d'une demande d'ami
  formAddFriend?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!inputAddFriend || !btnAddFriend) return;

    const pseudo = inputAddFriend.value.trim();
    if (!USERNAME_PATTERN.test(pseudo)) {
      setAlert(
        addFriendAlert,
        'error',
        'Pseudo invalide (3 à 30 caractères : lettres, chiffres, - et _).'
      );
      return;
    }

    btnAddFriend.disabled = true;
    setAlert(addFriendAlert, 'info', 'Envoi de la demande...');

    try {
      const result = await sendFriendRequest(pseudo);
      inputAddFriend.value = '';
      setAlert(addFriendAlert, null);
      switchView(viewAddFriend, viewFriends);
      setAlert(friendsAlert, 'success', result.message);
      await loadFriends(true);
    } catch (error) {
      const message =
        error instanceof FriendsServiceError
          ? error.message
          : "Impossible d'envoyer la demande d'ami.";
      setAlert(addFriendAlert, 'error', message);
    } finally {
      btnAddFriend.disabled = false;
    }
  });

  // Synchronisation automatique lors d'une connexion / déconnexion
  onAuthChange(() => {
    if (viewFriends?.classList.contains('active')) {
      void loadFriends();
    } else {
      syncAuthVisibility();
    }
  });

  syncAuthVisibility();
}
