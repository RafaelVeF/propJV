import { switchView } from './viewManager';
import { MessageType, type NetworkMessage, type Player } from '@prop-hunt/shared';

export function renderGame(): string {
  return `
    <div id="view-game" class="view" style="width: 100vw; height: 100vh; background: #0a0a0a;">
      <button id="btn-leave-game" class="btn primary" style="position: absolute; top: 20px; left: 20px; z-index: 20; width: auto; padding: 10px 20px;">
        QUITTER
      </button>
      <div id="ws-status" style="position: absolute; top: 20px; right: 20px; z-index: 20; color: #4ade80; font-family: sans-serif; font-size: 14px; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 6px;">
        WS: Connexion en cours...
      </div>
      <canvas id="game-canvas" style="display: block;"></canvas>
    </div>
  `;
}

export function initGame(): void {
  const viewMain = document.getElementById('view-main');
  const viewGame = document.getElementById('view-game');
  const btnLeaveGame = document.getElementById('btn-leave-game');
  const wsStatus = document.getElementById('ws-status');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  if (!canvas || !viewGame || !viewMain) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Gestion du retour au menu
  if (btnLeaveGame) {
    btnLeaveGame.addEventListener('click', () => {
      switchView(viewGame, viewMain);
    });
  }

  // Redimensionnement du canvas
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  // État du joueur local
  let localPlayerId: string | null = null;
  const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    size: 40,
    speed: 5
  };

  const otherPlayers = new Map<string, { x: number; y: number; name?: string }>();

  // Connexion WebSocket au game-server (port 8080)
  let socket: WebSocket | null = null;
  
  try {
    socket = new WebSocket('ws://localhost:8080');

    socket.onopen = () => {
      console.log('[WS] Connecté au serveur de jeu (ws://localhost:8080)');
      if (wsStatus) {
        wsStatus.innerText = 'WS: Connecté (ws://localhost:8080)';
        wsStatus.style.color = '#4ade80';
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg: NetworkMessage = JSON.parse(event.data);
        if (msg.type === MessageType.WELCOME) {
          localPlayerId = msg.payload.player.id;
          console.log('[WS] Bienvenue ! Mon ID joueur :', localPlayerId);
        } else if (msg.type === MessageType.PLAYER_JOINED) {
          const newP: Player = msg.payload.player;
          otherPlayers.set(newP.id, { x: newP.x, y: newP.y, name: newP.name });
          console.log('[WS] Nouveau joueur rejoint :', newP.id);
        } else if (msg.type === MessageType.PLAYER_LEFT) {
          otherPlayers.delete(msg.payload.playerId);
          console.log('[WS] Joueur déconnecté :', msg.payload.playerId);
        } else if (msg.type === MessageType.PLAYER_MOVE) {
          const { playerId, x, y } = msg.payload;
          if (playerId !== localPlayerId) {
            const existing = otherPlayers.get(playerId) || { x: 0, y: 0 };
            otherPlayers.set(playerId, { ...existing, x, y });
          }
        }
      } catch (err) {
        console.error('[WS] Erreur parsing message :', err);
      }
    };

    socket.onerror = (err) => {
      console.warn('[WS] Erreur WebSocket :', err);
      if (wsStatus) {
        wsStatus.innerText = 'WS: Hors ligne (Port 8080 non disponible)';
        wsStatus.style.color = '#f87171';
      }
    };

    socket.onclose = () => {
      console.log('[WS] Déconnecté du serveur de jeu');
      if (wsStatus) {
        wsStatus.innerText = 'WS: Déconnecté';
        wsStatus.style.color = '#f87171';
      }
    };
  } catch (err) {
    console.error('[WS] Impossible d’initialiser WebSocket :', err);
  }

  // Gestion des inputs (Z, Q, S, D, et flèches)
  const keys: { [key: string]: boolean } = {};
  
  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
  });
  
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Boucle de jeu (Game Loop)
  function gameLoop() {
    if (viewGame?.classList.contains('active')) {
      let moved = false;
      // Input Handler
      if (keys['z'] || keys['arrowup']) { player.y -= player.speed; moved = true; }
      if (keys['s'] || keys['arrowdown']) { player.y += player.speed; moved = true; }
      if (keys['q'] || keys['arrowleft']) { player.x -= player.speed; moved = true; }
      if (keys['d'] || keys['arrowright']) { player.x += player.speed; moved = true; }

      // Limites de l'écran Basique
      player.x = Math.max(0, Math.min(canvas.width - player.size, player.x));
      player.y = Math.max(0, Math.min(canvas.height - player.size, player.y));

      // Envoi de la nouvelle position via WebSocket
      if (moved && socket && socket.readyState === WebSocket.OPEN && localPlayerId) {
        socket.send(JSON.stringify({
          type: MessageType.PLAYER_MOVE,
          payload: {
            playerId: localPlayerId,
            x: player.x,
            y: player.y,
            vx: 0,
            vy: 0
          }
        } satisfies NetworkMessage));
      }

      // Rendu Canvas
      ctx!.clearRect(0, 0, canvas.width, canvas.height);

      // Dessiner les autres joueurs (Carrés violets)
      otherPlayers.forEach((op) => {
        ctx!.fillStyle = '#a855f7';
        ctx!.shadowColor = '#a855f7';
        ctx!.shadowBlur = 10;
        ctx!.fillRect(op.x, op.y, player.size, player.size);
      });

      // Dessiner le joueur local (Carré Cyan)
      ctx!.fillStyle = '#38bdf8';
      ctx!.shadowColor = '#38bdf8';
      ctx!.shadowBlur = 15;
      ctx!.fillRect(player.x, player.y, player.size, player.size);
      
      ctx!.shadowBlur = 0;
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}

