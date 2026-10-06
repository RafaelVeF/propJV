import { switchView } from './viewManager';

export function renderFriends(): string {
  return `
    <!-- Vue 7 : Amis -->
    <div id="view-friends" class="view modal-view hidden">
      <h2 class="view-title purple-text">AMIS</h2>
      <div class="menu-container">

        <!-- Liste des Amis -->
        <div class="players-list">
          <div class="list-header">
            <h3>LISTE D'AMIS</h3>
            <button class="icon-btn-inline purple-text" id="btn-open-add-friend" title="Ajouter un ami">+</button>
          </div>
          <div id="friends-items-list" class="scrollable-friends-items">
            <div class="player-item ready">
              <span class="player-name">Mock-Rafael</span>
              <span class="player-status">En ligne</span>
            </div>
            <div class="player-item ready">
              <span class="player-name">Mock-Florent</span>
              <span class="player-status">En ligne</span>
            </div>
            <div class="player-item not-ready">
              <span class="player-name">Mock-Jamie</span>
              <span class="player-status">Hors ligne</span>
            </div>
          </div>
        </div>

        <!-- Section Demandes Reçues -->
        <div class="players-list requests-list">
          <h3>DEMANDES REÇUES</h3>
          <div id="requests-items-list">
            <div class="player-item request-item">
              <span class="player-name">Mock-Sovanmony</span>
              <div class="request-actions">
                <button class="btn primary accept-btn">Accepter</button>
                <button class="btn secondary reject-btn">Refuser</button>
              </div>
            </div>
            <div class="player-item request-item">
              <span class="player-name">Mock-Lukas</span>
              <div class="request-actions">
                <button class="btn primary accept-btn">Accepter</button>
                <button class="btn secondary reject-btn">Refuser</button>
              </div>
            </div>
          </div>
        </div>

        <button class="btn back" id="btn-back-main-from-friends">RETOUR</button>
      </div>
    </div>

    <!-- Vue 7b : Ajouter un Ami -->
    <div id="view-add-friend" class="view modal-view hidden">
      <h2 class="view-title purple-text">AJOUTER UN AMI</h2>
      <div class="menu-container">
        <div class="join-container">
          <label class="input-label">PSEUDO DE L'AMI</label>
          <input type="text" id="input-add-friend" class="input-field" placeholder="Entrez le pseudo..." />
        </div>
        <button class="btn primary" id="btn-add-friend">
          <span>+ AJOUTER</span>
        </button>
        <button class="btn back" id="btn-back-friends-from-add-friend">RETOUR</button>
      </div>
    </div>
  `;
}

export function initFriends(): void {
  const viewMain = document.getElementById('view-main');
  const viewFriends = document.getElementById('view-friends');
  const viewAddFriend = document.getElementById('view-add-friend');
  const btnBackMainFromFriends = document.getElementById('btn-back-main-from-friends');
  const btnOpenAddFriend = document.getElementById('btn-open-add-friend');
  const btnBackFriendsFromAddFriend = document.getElementById('btn-back-friends-from-add-friend');
  const btnAddFriend = document.getElementById('btn-add-friend');
  const inputAddFriend = document.getElementById('input-add-friend') as HTMLInputElement;
  const friendsItemsList = document.getElementById('friends-items-list');
  const requestsItemsList = document.getElementById('requests-items-list');

  if (btnBackMainFromFriends) {
    btnBackMainFromFriends.addEventListener('click', () => switchView(viewFriends, viewMain));
  }

  if (btnOpenAddFriend) {
    btnOpenAddFriend.addEventListener('click', () => switchView(viewFriends, viewAddFriend));
  }
  if (btnBackFriendsFromAddFriend) {
    btnBackFriendsFromAddFriend.addEventListener('click', () => switchView(viewAddFriend, viewFriends));
  }

  // Ajouter un ami dynamiquement
  if (btnAddFriend && inputAddFriend && friendsItemsList) {
    btnAddFriend.addEventListener('click', () => {
      const pseudo = inputAddFriend.value.trim();
      if (pseudo) {
        const friendItem = document.createElement('div');
        friendItem.className = 'player-item ready';
        friendItem.innerHTML = `<span class="player-name">${pseudo}</span><span class="player-status">En ligne</span>`;
        friendsItemsList.appendChild(friendItem);
        inputAddFriend.value = '';
        switchView(viewAddFriend, viewFriends);
      } else {
        alert('Veuillez entrer un pseudo.');
      }
    });
  }

  // Accepter ou refuser une demande reçue
  if (requestsItemsList && friendsItemsList) {
    requestsItemsList.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const acceptBtn = target.closest('.accept-btn');
      const rejectBtn = target.closest('.reject-btn');

      if (acceptBtn) {
        const requestItem = acceptBtn.closest('.request-item');
        if (requestItem) {
          const nameEl = requestItem.querySelector('.player-name');
          const pseudo = nameEl ? nameEl.textContent?.trim() : '';
          if (pseudo) {
            const friendItem = document.createElement('div');
            friendItem.className = 'player-item ready';
            friendItem.innerHTML = `<span class="player-name">${pseudo}</span><span class="player-status">En ligne</span>`;
            friendsItemsList.appendChild(friendItem);
            requestItem.remove();
          }
        }
      } else if (rejectBtn) {
        const requestItem = rejectBtn.closest('.request-item');
        if (requestItem) {
          requestItem.remove();
        }
      }
    });
  }
}
