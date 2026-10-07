import './style.css';
import { GAME_NAME } from '@prop-hunt/shared';

// Import des Composants UI (Template + Contrôleur)
import { renderMainMenu, initMainMenu } from './components/mainMenu';
import { renderLocalGame, initLocalGame } from './components/localGame';
import { renderLobby, initLobby } from './components/lobby';
import { renderSettings, initSettings } from './components/settings';
import { renderProfile, initProfile } from './components/profile';
import { renderHowToPlay, initHowToPlay } from './components/howToPlay';
import { renderFriends, initFriends } from './components/friends';
import { renderStats, initStats } from './components/stats';
import { renderGame, initGame } from './components/game';

//Montage dynamique du HTML dans le conteneur UI
const uiLayer = document.getElementById('ui-layer');
if (uiLayer) {
  uiLayer.innerHTML = [
    renderMainMenu(),
    renderLocalGame(),
    renderLobby(),
    renderSettings(),
    renderProfile(),
    renderHowToPlay(),
    renderFriends(),
    renderStats(),
    renderGame(),
  ].join('\n');
}

//Initialisation du titre
const titleElement = document.getElementById('main-title');
if (titleElement) {
  titleElement.textContent = GAME_NAME;
}

//Initialisation de la logique et des événements de chaque composant
initMainMenu();
initLocalGame();
initLobby();
initSettings();
initProfile();
initHowToPlay();
initFriends();
initStats();
initGame();
