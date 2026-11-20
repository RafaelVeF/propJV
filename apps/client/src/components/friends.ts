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

function getInitialMonogram(username: string): string {
  const cleaned = username.trim();
  return cleaned ? cleaned.slice(0, 2).toUpperCase() : 'JV';
}

function createFriendRow(friend: FriendEntry): HTMLElement {
  const active = isRecentlyActive(friend.lastConnection);
  const row = document.createElement('div');
  row.className = `friends-flat-row friends-roster-row player-item ${
    active ? 'ready is-online' : 'not-ready is-offline'
  }`;

  const info = document.createElement('div');
  info.className = 'friend-info';

  const avatar = document.createElement('div');
  avatar.className = `friend-avatar-initial ${active ? 'is-online' : 'is-offline'}`;
  avatar.textContent = getInitialMonogram(friend.username);

  const statusDot = document.createElement('span');
  statusDot.className = `friend-status-dot ${active ? 'is-online' : 'is-offline'}`;
  statusDot.setAttribute('aria-hidden', 'true');
  avatar.appendChild(statusDot);

  const textGroup = document.createElement('div');
  textGroup.className = 'friend-text-group';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = friend.username;

  const statusSpan = document.createElement('span');
  statusSpan.className = 'player-status';
  statusSpan.textContent = active ? 'EN LIGNE · DISPONIBLE' : 'HORS LIGNE';

  textGroup.append(nameSpan, statusSpan);
  info.append(avatar, textGroup);

  const actions = document.createElement('div');
  actions.className = 'request-actions friends-row-actions';
  if (active) {
    actions.append(
      createActionButton(
        'REJOINDRE SALON',
        'friends-flat-btn friends-join-btn',
        'join',
        friend.relationshipId,
        friend.username
      )
    );
  }
  actions.append(
    createActionButton(
      'BLOQUER',
      'friends-flat-btn friend-muted-btn',
      'block',
      friend.relationshipId,
      friend.username
    ),
    createActionButton(
      'RETIRER',
      'friends-flat-btn reject-btn',
      'remove',
      friend.relationshipId,
      friend.username
    )
  );

  row.append(info, actions);
  return row;
}

function createIncomingRequestRow(request: FriendRequestEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'friends-flat-row player-item request-item';

  const info = document.createElement('div');
  info.className = 'friend-info';

  const avatar = document.createElement('div');
  avatar.className = 'friend-avatar-initial is-pending';
  avatar.textContent = getInitialMonogram(request.username);

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = request.username;

  info.append(avatar, nameSpan);

  const actions = document.createElement('div');
  actions.className = 'request-actions friends-row-actions';
  actions.append(
    createActionButton('ACCEPTER', 'friends-flat-btn accept-btn', 'accept', request.relationshipId),
    createActionButton('REFUSER', 'friends-flat-btn reject-btn', 'reject', request.relationshipId)
  );

  row.append(info, actions);
  return row;
}

function createOutgoingRequestRow(request: FriendRequestEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'friends-flat-row player-item request-item';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = `${request.username} (en attente)`;

  const actions = document.createElement('div');
  actions.className = 'request-actions friends-row-actions';
  actions.append(
    createActionButton('ANNULER', 'friends-flat-btn reject-btn', 'reject', request.relationshipId)
  );

  row.append(nameSpan, actions);
  return row;
}

function createBlockedRow(blocked: FriendEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'friends-flat-row player-item not-ready';

  const nameSpan = document.createElement('span');
  nameSpan.className = 'player-name';
  nameSpan.textContent = blocked.username;

  const actions = document.createElement('div');
  actions.className = 'request-actions friends-row-actions';
  actions.append(
    createActionButton(
      'DÉBLOQUER',
      'friends-flat-btn friend-muted-btn',
      'unblock',
      blocked.relationshipId
    )
  );

  row.append(nameSpan, actions);
  return row;
}

export function renderFriends(): string {
  return `
    <!-- Vue 7 : Amis — Hub Social Centré (max-width: 920px - 100vh - 100% Souris) -->
    <div id="view-friends" class="view friends-fullscreen-view hidden">
      <!-- 1. En-tête unifié (top-bar) -->
      <header class="local-top-bar">
        <div class="local-top-inner">
          <div class="local-top-left">
            <button type="button" class="local-back-btn" id="btn-back-main-from-friends">
              ← RETOUR
            </button>
          </div>

          <h1 class="local-brand-title">
            <span class="purple-text">AMIS</span>
          </h1>

          <div class="local-top-right">
            <span class="local-player-tag is-auth" id="friends-online-summary">0 EN LIGNE</span>
          </div>
        </div>
      </header>

      <!-- 2. Colonne centrale aérée (max-width: 920px) -->
      <main class="friends-hub-stage">
        <div class="friends-hub-container">
          <div id="friends-alert" class="auth-alert friends-top-alert" role="alert" aria-live="polite"></div>

          <div class="friends-panels-wrapper">
            <div id="friends-authenticated-content" class="friends-hub-content">
              <!-- Bandeau supérieur d'action rapide : Ajout d'ami par pseudo -->
              <section class="friends-hub-top-strip" aria-label="Ajouter un ami">
                <form id="form-add-friend" class="friends-hub-add-form" novalidate>
                  <div class="friends-hub-add-left">
                    <span class="local-kicker">INVITATION DIRECTE</span>
                    <label class="friends-hub-add-title" for="input-add-friend">AJOUTER UN JOUEUR</label>
                  </div>

                  <div class="friends-hub-add-controls join-container">
                    <input
                      type="text"
                      id="input-add-friend"
                      class="input-field local-code-input friends-pseudo-input"
                      maxlength="30"
                      autocomplete="off"
                      spellcheck="false"
                      placeholder="Entrez le pseudo exact..."
                    />
                    <button type="submit" class="local-join-btn" id="btn-add-friend">
                      <span>AJOUTER</span>
                      <span aria-hidden="true">+</span>
                    </button>
                  </div>
                </form>
                <div id="add-friend-alert" class="auth-alert" role="alert" aria-live="polite"></div>
              </section>

              <!-- Bandeau mis en valeur pour les demandes d'amis en attente -->
              <section class="friends-pending-banner requests-list" id="incoming-requests-banner" aria-label="Demandes reçues">
                <div class="friends-section-head">
                  <div class="local-servers-heading-row">
                    <h2 class="friends-sub-heading">DEMANDES D'AMIS EN ATTENTE</h2>
                    <span id="incoming-requests-count" class="friends-count-badge">0</span>
                  </div>
                </div>
                <div id="requests-items-list" class="friends-pending-grid"></div>
              </section>

              <!-- Roster Social Principal (Liste d'amis) -->
              <section class="friends-roster-section" aria-label="Roster social">
                <div class="local-servers-header">
                  <div class="local-servers-heading-row">
                    <h2 class="local-section-title">Liste d'amis</h2>
                    <span id="friends-count" class="friends-count-badge">0</span>
                  </div>
                </div>

                <div class="friends-cols-head" aria-hidden="true">
                  <span>JOUEUR &amp; PRÉSENCE EN DIRECT</span>
                  <span class="align-right">ACTIONS CONTEXTUELLES</span>
                </div>

                <div id="friends-items-list" class="friends-roster-list"></div>
              </section>

              <!-- Demandes envoyées & Utilisateurs bloqués (affichés uniquement si non vides) -->
              <div class="friends-secondary-strips">
                <div id="outgoing-requests-section" class="friends-section-block requests-list" hidden>
                  <div class="friends-section-head">
                    <h3 class="friends-sub-heading">INVITATIONS ENVOYÉES</h3>
                    <span id="outgoing-requests-count" class="friends-count-badge">0</span>
                  </div>
                  <div id="outgoing-requests-list" class="friends-flat-list"></div>
                </div>

                <div id="blocked-users-section" class="friends-section-block requests-list" hidden>
                  <div class="friends-section-head">
                    <h3 class="friends-sub-heading">COMPTES BLOQUÉS</h3>
                    <span id="blocked-users-count" class="friends-count-badge">0</span>
                  </div>
                  <div id="blocked-users-list" class="friends-flat-list"></div>
                </div>
              </div>
            </div>

            <!-- Voile bloquant si l'utilisateur n'est pas connecté -->
            <div id="friends-guest-notice" class="friends-guest-overlay" hidden>
              <div class="friends-guest-card">
                <span class="local-kicker">CONNEXION REQUISE</span>
                <h3 class="local-section-title">HUB SOCIAL VERROUILLÉ</h3>
                <p class="friends-guest-text">Connectez-vous à votre compte PropJV pour retrouver vos amis et rejoindre leurs salons.</p>
                <button type="button" class="local-join-btn friends-guest-login-btn" id="btn-friends-open-auth">
                  <span>SE CONNECTER</span>
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Vue 7b conservée pour compatibilité descendante des IDs -->
    <div id="view-add-friend" class="view hidden" aria-hidden="true">
      <button type="button" id="btn-back-friends-from-add-friend" hidden>RETOUR</button>
    </div>
  `;
}

export function initFriends(): void {
  const viewMain = document.getElementById('view-main');
  const viewLocal = document.getElementById('view-local');
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
  const incomingBanner = document.getElementById('incoming-requests-banner');

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
  const onlineSummary = document.getElementById('friends-online-summary');

  const renderOverview = (data: FriendsOverviewResponse): void => {
    const friends = data.friends ?? [];
    const incoming = data.incomingRequests ?? [];
    const outgoing = data.outgoingRequests ?? [];
    const blocked = data.blockedUsers ?? [];
    const onlineCount = friends.filter((f) => isRecentlyActive(f.lastConnection)).length;

    if (friendsCount) friendsCount.textContent = String(friends.length);
    if (incomingCount) incomingCount.textContent = String(incoming.length);
    if (outgoingCount) outgoingCount.textContent = String(outgoing.length);
    if (blockedCount) blockedCount.textContent = String(blocked.length);
    if (onlineSummary) {
      onlineSummary.textContent = `${onlineCount} EN LIGNE / ${friends.length} AMI${
        friends.length > 1 ? 'S' : ''
      }`;
    }

    if (incomingBanner) {
      incomingBanner.classList.toggle('has-requests', incoming.length > 0);
    }

    if (friendsItemsList) {
      friendsItemsList.replaceChildren(
        ...(friends.length > 0
          ? friends.map(createFriendRow)
          : [
              createEmptyNotice(
                'Votre roster social est vide — ajoutez un joueur par son pseudo ci-dessus.'
              ),
            ])
      );
    }

    if (requestsItemsList) {
      requestsItemsList.replaceChildren(
        ...(incoming.length > 0
          ? incoming.map(createIncomingRequestRow)
          : [createEmptyNotice('Aucune demande d’ami en attente.')])
      );
    }

    if (outgoingSection && outgoingList) {
      outgoingSection.hidden = outgoing.length === 0;
      outgoingList.replaceChildren(...outgoing.map(createOutgoingRequestRow));
    }

    if (blockedSection && blockedList) {
      blockedSection.hidden = blocked.length === 0;
      blockedList.replaceChildren(...blocked.map(createBlockedRow));
    }
  };

  const resetLockedPreview = (): void => {
    if (friendsCount) friendsCount.textContent = '0';
    if (incomingCount) incomingCount.textContent = '0';
    if (outgoingCount) outgoingCount.textContent = '0';
    if (blockedCount) blockedCount.textContent = '0';
    if (onlineSummary) onlineSummary.textContent = 'MODE INVITÉ';
    friendsItemsList?.replaceChildren(createEmptyNotice('Connexion requise.'));
    requestsItemsList?.replaceChildren(createEmptyNotice('Connexion requise.'));
    if (outgoingSection) outgoingSection.hidden = true;
    if (blockedSection) blockedSection.hidden = true;
  };

  const syncAuthVisibility = (): boolean => {
    const loggedIn = isAuthenticated();
    if (guestNotice) {
      guestNotice.hidden = loggedIn;
    }
    if (authenticatedContent) {
      authenticatedContent.classList.toggle('is-locked', !loggedIn);
      authenticatedContent.inert = !loggedIn;
      authenticatedContent.setAttribute('aria-hidden', String(!loggedIn));
    }
    if (!loggedIn) {
      resetLockedPreview();
    }
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
    if (!isAuthenticated()) return;

    const action = btn.dataset.friendAction;
    const relationshipId = Number.parseInt(btn.dataset.relationshipId ?? '', 10);
    const username = btn.dataset.username;

    if (!action || Number.isNaN(relationshipId)) return;

    if (action === 'join') {
      switchView(viewFriends, viewLocal ?? viewMain);
      return;
    }

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

  btnOpenFriends?.addEventListener('click', () => {
    void loadFriends();
  });

  btnFriendsOpenAuth?.addEventListener('click', () => {
    switchView(viewFriends, viewAuth);
  });

  btnBackMainFromFriends?.addEventListener('click', () => {
    setAlert(friendsAlert, null);
    setAlert(addFriendAlert, null);
    switchView(viewFriends, viewMain);
  });

  btnRefreshFriends?.addEventListener('click', () => {
    if (!isAuthenticated()) return;
    void loadFriends();
  });

  btnOpenAddFriend?.addEventListener('click', () => {
    if (!isAuthenticated()) return;
    setAlert(addFriendAlert, null);
    inputAddFriend?.focus();
  });

  btnBackFriendsFromAddFriend?.addEventListener('click', () => {
    setAlert(addFriendAlert, null);
    switchView(viewAddFriend, viewFriends);
  });

  authenticatedContent?.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const actionBtn = target?.closest<HTMLButtonElement>('button[data-friend-action]');
    if (actionBtn) {
      void executeRowAction(actionBtn);
    }
  });

  formAddFriend?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!inputAddFriend || !btnAddFriend || !isAuthenticated()) return;

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
      setAlert(addFriendAlert, 'success', result.message);
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

  if (viewFriends) {
    const observer = new MutationObserver(() => {
      if (viewFriends.classList.contains('active') && !viewFriends.classList.contains('hidden')) {
        void loadFriends(true);
      }
    });
    observer.observe(viewFriends, { attributes: true, attributeFilter: ['class'] });
  }

  onAuthChange(() => {
    if (viewFriends?.classList.contains('active')) {
      void loadFriends();
    } else {
      syncAuthVisibility();
    }
  });

  syncAuthVisibility();
}
