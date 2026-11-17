import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import { MessageType, type LobbyStatePayload, type RoomErrorPayload } from '@prop-hunt/shared';

export function renderLocalGame(): string {
  return `
    <!-- Vue 2 : Menu Partie Locale -->
    <div id="view-local" class="view modal-view hidden">
      <h2 class="view-title purple-text">PARTIE LOCALE</h2>
      <div class="menu-container">
        <button class="btn primary" id="btn-host">HÉBERGER UNE PARTIE</button>
        <div class="divider">ou</div>
        <div class="join-container">
          <input type="text" class="input-field" placeholder="CLÉ DE SERVEUR" />
          <button class="btn secondary" id="btn-join-local">REJOINDRE</button>
        </div>
        <button class="btn back" id="btn-back-main-from-local">RETOUR</button>
      </div>
    </div>
  `;
}

export function initLocalGame(): void {
  const viewMain = document.getElementById('view-main');
  const viewLocal = document.getElementById('view-local');
  const viewLobby = document.getElementById('view-lobby');
  const btnHostLocal = document.getElementById('btn-host');
  const btnJoinLocal = document.getElementById('btn-join-local');
  const btnBackMainFromLocal = document.getElementById('btn-back-main-from-local');

  let pendingRoomEnter = false;

  if (btnBackMainFromLocal) {
    btnBackMainFromLocal.addEventListener('click', () => switchView(viewLocal, viewMain));
  }

  if (btnHostLocal) {
    btnHostLocal.addEventListener('click', () => {
      pendingRoomEnter = true;
      networkManager.send(MessageType.CREATE_ROOM, {});
    });
  }

  if (btnJoinLocal) {
    btnJoinLocal.addEventListener('click', () => {
      const joinInput = document.querySelector('#view-local .input-field') as HTMLInputElement;
      const roomKey = joinInput?.value.trim().toUpperCase() || '';
      if (roomKey !== '') {
        pendingRoomEnter = true;
        networkManager.send(MessageType.JOIN_ROOM, { roomKey });
      } else {
        alert('Veuillez entrer une clé de serveur.');
      }
    });
  }

  // Basculer vers le salon uniquement lorsque le serveur confirme l'entrée dans la room
  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, () => {
    if (pendingRoomEnter && viewLocal && viewLobby) {
      pendingRoomEnter = false;
      switchView(viewLocal, viewLobby);
    }
  });

  // Afficher une erreur si la clé de salon est invalide
  networkManager.on<RoomErrorPayload>(MessageType.ROOM_ERROR, (payload) => {
    pendingRoomEnter = false;
    alert(payload.message || 'Impossible de rejoindre ce salon.');
  });
}
