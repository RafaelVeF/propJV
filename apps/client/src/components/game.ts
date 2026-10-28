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
  tilesetImg.src = '/assets/tilesets/PropJVTileSetMap32.png';

  fetch('/assets/maps/map_01_32p.tmj')
    .then(res => res.json())
    .then(data => {
      mapData = data;
      console.log('[MAP] Carte chargée avec succès !', data.width, 'x', data.height);
    })
    .catch(err => console.error('[MAP] Erreur de chargement de la carte:', err));

  // État du joueur local
  let localPlayerId: string | null = null;
  let showHitbox = true; // Activer l'affichage visuel de la hitbox (touche 'H' pour activer/désactiver)
  const player = {
    x: 250,
    y: 250,
    targetX: 250,
    targetY: 250,
    width: 24,
    height: 48,
    hitboxRadius: 12, // Rayon de collision physique géré par le serveur (24px de diamètre)
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
    if (e.key.toLowerCase() === 'h') {
      showHitbox = !showHitbox;
      console.log(`[DEBUG] Affichage des hitboxes : ${showHitbox ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
    }
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

      // --- 2. FONCTION UTILITAIRE DE RENDU D'UN PERSONNAGE (CORPS 24x48 + HITBOX) ---
      const drawCharacter = (
        posX: number,
        posY: number,
        bodyColor: string,
        glowColor: string,
        label?: string
      ) => {
        const bodyW = player.width;   // 24 px
        const bodyH = player.height;  // 48 px
        const radius = player.hitboxRadius; // 12 px (côté serveur)

        // Point d'ancrage : (posX, posY) est le centre de la hitbox physique au sol
        // Le corps du personnage s'étend au-dessus des pieds
        const bodyX = posX - bodyW / 2;
        const bodyY = posY + radius - bodyH; // La base des pieds touche le bas de la hitbox

        // A. Ombre au sol (effet de perspective top-down)
        ctx!.save();
        ctx!.beginPath();
        ctx!.ellipse(posX, posY, radius + 2, radius * 0.5, 0, 0, Math.PI * 2);
        ctx!.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx!.fill();
        ctx!.restore();

        // B. Corps du joueur : Rectangle de 24 x 48 px
        ctx!.save();
        ctx!.shadowColor = glowColor;
        ctx!.shadowBlur = 10;
        ctx!.fillStyle = bodyColor;
        // Corps principal
        ctx!.beginPath();
        ctx!.roundRect(bodyX, bodyY, bodyW, bodyH, 4);
        ctx!.fill();
        ctx!.lineWidth = 1.5;
        ctx!.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx!.stroke();
        ctx!.shadowBlur = 0;

        // Petit repère visuel de tête/yeux (pour voir l'orientation)
        ctx!.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx!.fillRect(bodyX + 4, bodyY + 6, bodyW - 8, 8);
        ctx!.restore();

        // C. Visualisation DEBUG de la Hitbox (activable via touche 'H')
        if (showHitbox) {
          ctx!.save();

          // 1. Hitbox physique active (Cercle de rayon 12 utilisé par le serveur)
          ctx!.beginPath();
          ctx!.arc(posX, posY, radius, 0, Math.PI * 2);
          ctx!.fillStyle = 'rgba(34, 197, 94, 0.25)'; // Vert translucide
          ctx!.fill();
          ctx!.lineWidth = 1.5;
          ctx!.strokeStyle = '#22c55e'; // Vert fluo
          ctx!.stroke();

          // 2. Croix centrale de la hitbox physique
          ctx!.beginPath();
          ctx!.moveTo(posX - 4, posY);
          ctx!.lineTo(posX + 4, posY);
          ctx!.moveTo(posX, posY - 4);
          ctx!.lineTo(posX, posY + 4);
          ctx!.strokeStyle = '#ffffff';
          ctx!.lineWidth = 1;
          ctx!.stroke();

          // 3. Cadre englobant le corps entier (24 x 48)
          ctx!.setLineDash([3, 3]);
          ctx!.strokeStyle = 'rgba(234, 179, 8, 0.8)'; // Jaune pointillé
          ctx!.lineWidth = 1;
          ctx!.strokeRect(bodyX, bodyY, bodyW, bodyH);

          // 4. Label debug au-dessus
          ctx!.font = '9px monospace';
          ctx!.fillStyle = '#ffffff';
          ctx!.textAlign = 'center';
          ctx!.fillText(label || '24x48 [Pieds: R12]', posX, bodyY - 4);

          ctx!.restore();
        }
      };

      // DESSINER LE JOUEUR LOCAL
      drawCharacter(player.x, player.y, '#ef4444', '#dc2626', 'Moi (24x48)');

      // DESSINER LES AUTRES JOUEURS
      otherPlayers.forEach((op) => {
        drawCharacter(op.x, op.y, '#a855f7', '#7c3aed', op.name || 'Joueur');
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

