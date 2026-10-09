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
    // Désactiver le lissage (anti-aliasing) pour garder un pixel art net
    ctx!.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // Chargement de la Map et du Tileset
  let mapData: any = null;
  const tilesetImg = new Image();
  tilesetImg.src = '/assets/tilesets/PropJVTailSetMap.png';

  fetch('/assets/maps/map_01_test.tmj')
    .then(res => res.json())
    .then(data => {
      mapData = data;
      console.log('[MAP] Carte chargée avec succès !', data.width, 'x', data.height);
    })
    .catch(err => console.error('[MAP] Erreur de chargement de la carte:', err));

  // État du joueur local
  let localPlayerId: string | null = null;
  const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    targetX: canvas.width / 2,
    targetY: canvas.height / 2,
    size: 16,
    speed: 5
  };

  const otherPlayers = new Map<string, { x: number; y: number; targetX: number; targetY: number; name?: string }>();

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
          otherPlayers.set(newP.id, { x: newP.x, y: newP.y, targetX: newP.x, targetY: newP.y, name: newP.name });
          console.log('[WS] Nouveau joueur rejoint :', newP.id);
        } else if (msg.type === MessageType.PLAYER_LEFT) {
          otherPlayers.delete(msg.payload.playerId);
          console.log('[WS] Joueur déconnecté :', msg.payload.playerId);
        } else if (msg.type === MessageType.GAME_STATE_UPDATE) {
          const playersList = msg.payload.players as Player[];
          const currentIds = new Set<string>();
          playersList.forEach(p => {
            currentIds.add(p.id);
            if (p.id === localPlayerId) {
              player.targetX = p.x;
              player.targetY = p.y;
            } else {
              if (otherPlayers.has(p.id)) {
                const op = otherPlayers.get(p.id)!;
                op.targetX = p.x;
                op.targetY = p.y;
              } else {
                otherPlayers.set(p.id, { x: p.x, y: p.y, targetX: p.x, targetY: p.y, name: p.name });
              }
            }
          });
          // Nettoyage des joueurs qui ne sont plus dans le state
          otherPlayers.forEach((_, id) => {
            if (!currentIds.has(id)) otherPlayers.delete(id);
          });
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

  let lastVx = 0;
  let lastVy = 0;
  const VISION_RADIUS = 200; // Rayon de vision visible autour du joueur

  // Boucle de jeu (Game Loop)
  function gameLoop() {
    if (viewGame?.classList.contains('active')) {
      let vx = 0;
      let vy = 0;
      // Input Handler (Intention)
      if (keys['z'] || keys['arrowup']) { vy -= 1; }
      if (keys['s'] || keys['arrowdown']) { vy += 1; }
      if (keys['q'] || keys['arrowleft']) { vx -= 1; }
      if (keys['d'] || keys['arrowright']) { vx += 1; }

      // Envoi de la vélocité brute (non normalisée) via WebSocket
      // La normalisation diagonale se fera sur le serveur !

      // Envoi de la vélocité via WebSocket (uniquement si l'intention change)
      if ((vx !== lastVx || vy !== lastVy) && socket && socket.readyState === WebSocket.OPEN && localPlayerId) {
        socket.send(JSON.stringify({
          type: MessageType.PLAYER_MOVE,
          payload: {
            playerId: localPlayerId,
            x: player.x,
            y: player.y,
            vx: vx,
            vy: vy
          }
        } satisfies NetworkMessage));
        lastVx = vx;
        lastVy = vy;
      }

      // Interpolation visuelle (Lerp) pour la fluidité d'affichage (même à 20 ticks/sec !)
      const lerpFactor = 0.3;
      player.x += (player.targetX - player.x) * lerpFactor;
      player.y += (player.targetY - player.y) * lerpFactor;
      
      otherPlayers.forEach((op) => {
        op.x += (op.targetX - op.x) * lerpFactor;
        op.y += (op.targetY - op.y) * lerpFactor;
      });

      // Rendu Canvas
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
      ctx!.save();

      // Caméra qui centre sur le joueur local
      const zoom = Math.min(canvas.width, canvas.height) / (VISION_RADIUS * 2);
      ctx!.translate(canvas.width / 2, canvas.height / 2);
      ctx!.scale(zoom, zoom);
      ctx!.translate(-player.x, -player.y);

      // --- 1. DESSINER LA CARTE (Ground & Walls) ---
      if (mapData && tilesetImg.complete) {
        const tileW = mapData.tilewidth;
        const tileH = mapData.tileheight;
        const cols = Math.floor(tilesetImg.width / tileW);

        mapData.layers.forEach((layer: any) => {
          if (layer.type === 'tilelayer' && layer.name !== 'above') {
            for (let i = 0; i < layer.data.length; i++) {
              let tileId = layer.data[i];
              if (tileId !== 0) { // 0 = vide
                tileId -= 1; // Tiled commence les ID à 1, on veut du 0-indexé
                const sx = (tileId % cols) * tileW;
                const sy = Math.floor(tileId / cols) * tileH;
                const dx = (i % layer.width) * tileW;
                const dy = Math.floor(i / layer.width) * tileH;
                ctx!.drawImage(tilesetImg, sx, sy, tileW, tileH, dx, dy, tileW, tileH);
              }
            }
          }
        });
      }

      // DESSINER LE JOUEUR LOCAL
      ctx!.fillStyle = '#ff0000ff';
      ctx!.shadowColor = '#a50909ff';
      ctx!.shadowBlur = 15;
      ctx!.fillRect(player.x - player.size / 2, player.y - player.size / 2, player.size, player.size);
      ctx!.shadowBlur = 0;

      // DESSINER LES AUTRES JOUEURS
      otherPlayers.forEach((op) => {
        ctx!.fillStyle = '#a855f7';
        ctx!.shadowColor = '#a855f7';
        ctx!.shadowBlur = 10;
        ctx!.fillRect(op.x - player.size / 2, op.y - player.size / 2, player.size, player.size);
      });

      // --- 4. DESSINER LA CARTE (Above) ---
      if (mapData && tilesetImg.complete) {
        const tileW = mapData.tilewidth;
        const tileH = mapData.tileheight;
        const cols = Math.floor(tilesetImg.width / tileW);

        mapData.layers.forEach((layer: any) => {
          if (layer.type === 'tilelayer' && layer.name === 'above') {
            for (let i = 0; i < layer.data.length; i++) {
              let tileId = layer.data[i];
              if (tileId !== 0) {
                tileId -= 1;
                const sx = (tileId % cols) * tileW;
                const sy = Math.floor(tileId / cols) * tileH;
                const dx = (i % layer.width) * tileW;
                const dy = Math.floor(i / layer.width) * tileH;
                ctx!.drawImage(tilesetImg, sx, sy, tileW, tileH, dx, dy, tileW, tileH);
              }
            }
          }
        });
      }

      ctx!.restore();
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}

