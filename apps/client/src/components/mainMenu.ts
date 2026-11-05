import logoUrl from '../assets/propJV_logo.png';
import { switchView } from './viewManager';

export function renderMainMenu(): string {
  return `
    <!-- Vue 1 : Menu Principal -->
    <div id="view-main" class="view main-screen active">
      <!-- Haut Gauche -->
      <div class="top-left-nav">
        <button class="top-nav-link purple-text" id="btn-how-to-play">
          COMMENT JOUER ?
          <span class="nav-underline purple-cyan-gradient"></span>
        </button>
        <button class="top-nav-link purple-text" id="btn-friends">
          AMIS
          <span class="nav-underline purple-gradient"></span>
        </button>
      </div>

      <!-- Haut Droite (Icônes) -->
      <div class="top-right-nav">
        <button class="icon-btn purple-icon" id="btn-settings" title="Paramètres">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>
        <button class="icon-btn purple-icon" id="btn-profile" title="Profil">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
          </svg>
        </button>
        <button class="icon-btn purple-icon" id="btn-stats" title="Statistiques">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 9.2h3.5V19H5zM10.25 5h3.5v14h-3.5zM15.5 12h3.5v7h-3.5z" />
          </svg>
        </button>
        <button class="icon-btn purple-icon" id="btn-achievements" title="Succès">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="currentColor">
            <path
              d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V19H7v2h10v-2h-4v-3.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z" />
          </svg>
        </button>
      </div>

      <!-- Menu Central -->
      <div class="center-main-menu">
        <img src="${logoUrl}" alt="Prop JV Logo" class="main-logo" />
        <button class="main-menu-btn purple-text" id="btn-local">PARTIE LOCALE</button>
        <div class="menu-divider-line"></div>
        <button disabled class="main-menu-btn purple-text" id="btn-online">PARTIE EN LIGNE</button>
        <div class="menu-divider-line"></div>
        <button class="main-menu-btn purple-text" id="btn-freeplay">FREEPLAY</button>

        <div class="quit-container">
          <button class="main-menu-btn quit-btn purple-text" id="btn-quit">QUITTER</button>
        </div>
      </div>
    </div>
  `;
}

export function initMainMenu(): void {
  const viewMain = document.getElementById('view-main');
  const viewLocal = document.getElementById('view-local');
  const viewLobby = document.getElementById('view-lobby');
  const viewSettings = document.getElementById('view-settings');
  const viewProfile = document.getElementById('view-profile');
  const viewHowToPlay = document.getElementById('view-how-to-play');
  const viewFriends = document.getElementById('view-friends');
  const viewStats = document.getElementById('view-stats');
  const viewAchievements = document.getElementById('view-achievements');

  const btnLocal = document.getElementById('btn-local');
  const btnOnline = document.getElementById('btn-online');
  const btnFreeplay = document.getElementById('btn-freeplay');
  const btnQuit = document.getElementById('btn-quit');
  const btnHowToPlay = document.getElementById('btn-how-to-play');
  const btnFriends = document.getElementById('btn-friends');
  const btnSettings = document.getElementById('btn-settings');
  const btnProfile = document.getElementById('btn-profile');
  const btnStats = document.getElementById('btn-stats');
  const btnAchievements = document.getElementById('btn-achievements');

  if (btnLocal) {
    btnLocal.addEventListener('click', () => switchView(viewMain, viewLocal));
  }
  if (btnOnline) {
    btnOnline.addEventListener('click', () => switchView(viewMain, viewLobby));
  }
  if (btnFreeplay) {
    const viewGame = document.getElementById('view-game');
    btnFreeplay.addEventListener('click', () => {
      if (viewGame) switchView(viewMain, viewGame);
    });
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
  if (btnAchievements) {
    btnAchievements.addEventListener('click', () => switchView(viewMain, viewAchievements));
  }

  if (viewMain) {
    setTimeout(() => viewMain.classList.add('active'), 100);
  }
}
