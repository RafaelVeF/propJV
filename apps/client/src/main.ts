import './style.css';
import { GAME_NAME } from 'shared';
import logoUrl from './assets/propJV_logo.png';


const titleElement = document.getElementById('main-title');
if (titleElement) {
  titleElement.textContent = GAME_NAME;
}

const logoElement = document.querySelector<HTMLImageElement>('.main-logo');
if (logoElement) {
  logoElement.src = logoUrl;
}

// Changer d'une vue a une autre
function switchView(hideView: HTMLElement | null, showView: HTMLElement | null) {
  if (hideView) {
    hideView.classList.remove('active');
    setTimeout(() => {
      hideView.classList.add('hidden');
    }, 300);
  }

  if (showView) {
    setTimeout(() => {
      showView.classList.remove('hidden');
      setTimeout(() => {
        showView.classList.add('active');
      }, 50);
    }, hideView ? 300 : 0);
  }
}


// VUE DU MENU PRINCIPAL :
const viewMain = document.getElementById('view-main');
const btnLocal = document.getElementById('btn-local');
const btnOnline = document.getElementById('btn-online');
const btnFreeplay = document.getElementById('btn-freeplay');
const btnQuit = document.getElementById('btn-quit');
const btnHowToPlay = document.getElementById('btn-how-to-play');
const btnFriends = document.getElementById('btn-friends');
const btnSettings = document.getElementById('btn-settings');
const btnProfile = document.getElementById('btn-profile');
const btnStats = document.getElementById('btn-stats');

//boutons
if (btnLocal) {
  btnLocal.addEventListener('click', () => switchView(viewMain, viewLocal));
}
if (btnOnline) {
  btnOnline.addEventListener('click', () => switchView(viewMain, viewOnline));
}
if (btnFreeplay) {
  btnFreeplay.addEventListener('click', () => switchView(viewMain, viewLocal));
}
if (btnQuit) {
  btnQuit.addEventListener('click', () => {
    if (confirm('Voulez-vous vraiment quitter le jeu ?')) {
      window.close();
    }
  });
}
if (btnHowToPlay) {
  btnHowToPlay.addEventListener('click', () => switchView(viewMain, viewHowToPlay));
}
if (btnFriends) {
  btnFriends.addEventListener('click', () => switchView(viewMain, viewFriends));
}
if (btnSettings) {
  btnSettings.addEventListener('click', () => switchView(viewMain, viewSettings));
}
if (btnProfile) {
  btnProfile.addEventListener('click', () => switchView(viewMain, viewProfile));
}
if (btnStats) {
  btnStats.addEventListener('click', () => switchView(viewMain, viewStats));
}




// VUE SUR LA PARTIE LOCALE
const viewLocal = document.getElementById('view-local');
const btnHostlocal = document.getElementById('btn-host');
const btnJoinLocal = document.getElementById('btn-join-local');
const btnBackMainFromLocal = document.getElementById('btn-back-main-from-local');

if (btnBackMainFromLocal) {
  btnBackMainFromLocal.addEventListener('click', () => switchView(viewLocal, viewMain));
}
if (btnHostlocal) {
  btnHostlocal.addEventListener('click', () => {
    switchView(viewLocal, viewOnline);
  });
}
if (btnJoinLocal) {
  btnJoinLocal.addEventListener('click', () => {
    const joinInput = document.querySelector('#view-local .input-field') as HTMLInputElement;
    if (joinInput && joinInput.value.trim() !== '') {
      switchView(viewLocal, viewOnline);
    } else {
      alert('Veuillez entrer une clé de serveur.');
    }
  });
}




// MULTI JOUEUR EN LIGNE (Lobby)
const viewOnline = document.getElementById('view-lobby');
const btnBackMainFromOnline = document.getElementById('btn-back-main-from-online');

if (btnBackMainFromOnline) {
  btnBackMainFromOnline.addEventListener('click', () => switchView(viewOnline, viewMain));
}




// PARAMETRES
const viewSettings = document.getElementById('view-settings');
const btnBackMainFromSettings = document.getElementById('btn-back-main-from-settings');

if (btnBackMainFromSettings) {
  btnBackMainFromSettings.addEventListener('click', () => switchView(viewSettings, viewMain));
}




// PROFIL
const viewProfile = document.getElementById('view-profile');
const btnBackMainFromProfile = document.getElementById('btn-back-main-from-profile');

if (btnBackMainFromProfile) {
  btnBackMainFromProfile.addEventListener('click', () => switchView(viewProfile, viewMain));
}




// COMMENT JOUER ?
const viewHowToPlay = document.getElementById('view-how-to-play');
const btnBackMainFromHowToPlay = document.getElementById('btn-back-main-from-how-to-play');

if (btnBackMainFromHowToPlay) {
  btnBackMainFromHowToPlay.addEventListener('click', () => switchView(viewHowToPlay, viewMain));
}




// AMIS
const viewFriends = document.getElementById('view-friends');
const btnBackMainFromFriends = document.getElementById('btn-back-main-from-friends');

if (btnBackMainFromFriends) {
  btnBackMainFromFriends.addEventListener('click', () => switchView(viewFriends, viewMain));
}

// gestion des amis
const viewAddFriend = document.getElementById('view-add-friend');
const btnOpenAddFriend = document.getElementById('btn-open-add-friend');
const btnBackFriendsFromAddFriend = document.getElementById('btn-back-friends-from-add-friend');
const btnAddFriend = document.getElementById('btn-add-friend');
const inputAddFriend = document.getElementById('input-add-friend') as HTMLInputElement;
const friendsItemsList = document.getElementById('friends-items-list');
const requestsItemsList = document.getElementById('requests-items-list');

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

// Accepter ou refuser n'importe quelle demande d'ami reçue
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




// STATISTIQUES
const viewStats = document.getElementById('view-stats');
const btnBackMainFromStats = document.getElementById('btn-back-main-from-stats');

if (btnBackMainFromStats) {
  btnBackMainFromStats.addEventListener('click', () => switchView(viewStats, viewMain));
}




// Initialisation du Menu Principal
if (viewMain) {
  setTimeout(() => viewMain.classList.add('active'), 100);
}

