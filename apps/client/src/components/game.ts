import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import {
  MessageType,
  GamePhase,
  PlayerRole,
  type Player,
  DEFAULT_PROPS,
  type PropDefinition,
  GAMEPLAY_CONFIG,
  type RoundStartPayload,
  type RoundTimerTickPayload,
  type RoundEndPayload,
  type LobbyStatePayload
} from '@prop-hunt/shared';

export function renderGame(): string {
  return `
    <div id="view-game" class="view" style="width: 100vw; height: 100vh; background: #0a0a0a; position: relative; overflow: hidden;">
      <button id="btn-leave-game" class="btn primary" style="position: absolute; top: 20px; left: 20px; z-index: 20; width: auto; padding: 10px 20px;">
        SALON
      </button>

      <!-- HUD Central Supérieur (Timer & Phase) -->
      <div id="game-hud-top" style="position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none;">
        <div id="game-phase-badge" style="font-family: sans-serif; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; padding: 4px 14px; border-radius: 20px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);">
          SALON D'ATTENTE
        </div>
        <div id="game-timer" style="font-family: monospace; font-size: 28px; font-weight: 900; color: #ffffff; text-shadow: 0 0 10px rgba(0,0,0,0.8), 0 0 20px rgba(56, 189, 248, 0.5);">
          04:00
        </div>
        <div id="game-role-badge" style="font-family: sans-serif; font-size: 13px; font-weight: 800; padding: 4px 14px; border-radius: 6px; background: rgba(168, 85, 247, 0.25); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.5);">
          RÔLE : EN ATTENTE
        </div>
      </div>

      <div id="ws-status" style="position: absolute; top: 20px; right: 20px; z-index: 20; color: #4ade80; font-family: sans-serif; font-size: 14px; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 6px;">
        WS: Connexion en cours...
      </div>

      <!-- Overlay Aveuglement Hunter (Pendant la phase HIDING de 30s) -->
      <div id="hunter-blindfold" class="hidden" style="position: absolute; inset: 0; background: rgba(5, 5, 8, 0.95); z-index: 25; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(12px); color: #ffffff;">
        <div style="font-size: 3.5rem; margin-bottom: 8px;">🎯</div>
        <h2 style="font-size: 2.2rem; font-weight: 900; color: #f87171; letter-spacing: 2px; margin-bottom: 8px;">VOUS ÊTES CHASSEUR</h2>
        <p style="font-size: 1.15rem; color: #94a3b8; margin-bottom: 20px;">Les Props ont 30 secondes pour se disperser et se cacher...</p>
        <div style="font-family: monospace; font-size: 4rem; font-weight: 900; color: #fbbf24; text-shadow: 0 0 25px rgba(251, 191, 36, 0.6);" id="hunter-countdown">
          30
        </div>
        <span style="color: #64748b; font-size: 0.95rem; margin-top: 12px;">Vos armes et mouvements sont temporairement verrouillés par le serveur</span>
      </div>

      <!-- Overlay Fin de Manche (ROUND_END) -->
      <div id="round-end-overlay" class="hidden" style="position: absolute; inset: 0; background: rgba(10, 10, 15, 0.94); z-index: 30; display: flex; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(10px); color: #ffffff; padding: 20px;">
        <h2 id="round-end-winner" style="font-size: 2.8rem; font-weight: 900; letter-spacing: 2px; margin-bottom: 8px; text-shadow: 0 0 25px rgba(56, 189, 248, 0.6);">
          VICTOIRE DES PROPS !
        </h2>
        <p id="round-end-reason" style="font-size: 1.2rem; color: #cbd5e1; margin-bottom: 24px;">
          Le temps imparti est écoulé.
        </p>
        <div id="round-end-scores" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 18px 24px; width: 90%; max-width: 480px; margin-bottom: 24px;">
          <!-- Injecté dynamiquement -->
        </div>
        <div style="font-size: 0.95rem; color: #94a3b8; font-style: italic;">
          Retour automatique au salon dans quelques secondes...
        </div>
      </div>

      <canvas id="game-canvas" style="display: block;"></canvas>
    </div>
  `;
}

export function initGame(): void {
  const viewMain = document.getElementById('view-main');
  const viewLobby = document.getElementById('view-lobby');
  const viewGame = document.getElementById('view-game');
  const btnLeaveGame = document.getElementById('btn-leave-game');
  const wsStatus = document.getElementById('ws-status');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  // Éléments du HUD & Overlays
  const gamePhaseBadge = document.getElementById('game-phase-badge');
  const gameTimer = document.getElementById('game-timer');
  const gameRoleBadge = document.getElementById('game-role-badge');
  const hunterBlindfold = document.getElementById('hunter-blindfold');
  const hunterCountdown = document.getElementById('hunter-countdown');
  const roundEndOverlay = document.getElementById('round-end-overlay');
  const roundEndWinner = document.getElementById('round-end-winner');
  const roundEndReason = document.getElementById('round-end-reason');
  const roundEndScores = document.getElementById('round-end-scores');

  if (!canvas || !viewGame || !viewMain) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Gestion du retour au salon ou menu
  if (btnLeaveGame) {
    btnLeaveGame.addEventListener('click', () => {
      switchView(viewGame, viewLobby || viewMain);
    });
  }

  // Redimensionnement du canvas
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
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

  // Préchargement des textures de props
  const propImages = new Map<string, HTMLImageElement>();
  DEFAULT_PROPS.forEach(p => {
    p.variants?.forEach(v => {
      if (v.assetPath && !propImages.has(v.assetPath)) {
        const img = new Image();
        img.src = v.assetPath;
        propImages.set(v.assetPath, img);
      }
    });
    if (p.assetPath && !propImages.has(p.assetPath)) {
      const img = new Image();
      img.src = p.assetPath;
      propImages.set(p.assetPath, img);
    }
  });

  // État du joueur local
  let showHitbox = true;
  let currentPropIndex = 0;
  let localPlayerRole: PlayerRole = PlayerRole.PROP;
  let currentPhase: GamePhase = GamePhase.LOBBY;

  const player = {
    x: 250,
    y: 250,
    targetX: 250,
    targetY: 250,
    health: 100,
    maxHealth: 100,
    lastHitTimestamp: 0,
    currentProp: DEFAULT_PROPS[0],
    variantIndex: 0,
    speed: 5
  };

  const otherPlayers = new Map<string, {
    x: number;
    y: number;
    targetX: number;
    targetY: number;
    health: number;
    maxHealth: number;
    lastHitTimestamp?: number;
    name?: string;
    currentProp?: PropDefinition;
    variantIndex?: number;
    role?: PlayerRole;
  }>();

  // Mise à jour de l'affichage de statut WS
  const updateWsStatus = () => {
    if (!wsStatus) return;
    if (networkManager.isConnected) {
      wsStatus.innerText = 'WS: Connecté | E: Changer Prop | R: Tourner Prop | K: Dégâts (-15) | H: Hitbox';
      wsStatus.style.color = '#4ade80';
    } else {
      wsStatus.innerText = 'WS: Déconnecté';
      wsStatus.style.color = '#f87171';
    }
  };

  networkManager.onOpen(updateWsStatus);
  networkManager.onClose(updateWsStatus);
  updateWsStatus();

  // 1. WELCOME
  networkManager.on(MessageType.WELCOME, (payload) => {
    if (payload?.player) {
      if (payload.player.currentProp) {
        player.currentProp = payload.player.currentProp;
      }
      if ('variantIndex' in payload.player && payload.player.variantIndex !== undefined) {
        player.variantIndex = payload.player.variantIndex;
      }
      player.health = payload.player.health ?? player.currentProp.health;
      player.maxHealth = payload.player.maxHealth ?? player.currentProp.health;
      player.lastHitTimestamp = payload.player.lastHitTimestamp ?? 0;
      console.log('[WS] Bienvenue ! Mon ID joueur :', networkManager.localPlayerId);
    }
  });

  // 2. PLAYER_JOINED
  networkManager.on(MessageType.PLAYER_JOINED, (payload) => {
    const newP: Player = payload.player;
    const propDef = ('currentProp' in newP && newP.currentProp) ? newP.currentProp : DEFAULT_PROPS[0];
    otherPlayers.set(newP.id, {
      x: newP.x,
      y: newP.y,
      targetX: newP.x,
      targetY: newP.y,
      health: newP.health ?? propDef.health,
      maxHealth: ('maxHealth' in newP && newP.maxHealth) ? newP.maxHealth : propDef.health,
      lastHitTimestamp: newP.lastHitTimestamp ?? 0,
      name: newP.name,
      currentProp: propDef,
      variantIndex: ('variantIndex' in newP && newP.variantIndex !== undefined) ? newP.variantIndex : 0,
      role: newP.role
    });
  });

  // 3. PLAYER_LEFT
  networkManager.on(MessageType.PLAYER_LEFT, (payload) => {
    otherPlayers.delete(payload.playerId);
  });

  // 4. TRANSFORM_PROP
  networkManager.on(MessageType.TRANSFORM_PROP, (payload) => {
    const newProp: PropDefinition | undefined = payload.currentProp || DEFAULT_PROPS.find(p =>
      (payload.propId !== undefined && p.id === payload.propId) ||
      (payload.spriteKey && p.internalName === payload.spriteKey)
    );
    if (newProp) {
      if (payload.playerId === networkManager.localPlayerId) {
        player.currentProp = newProp;
        if (payload.variantIndex !== undefined) {
          player.variantIndex = payload.variantIndex;
        }
        player.maxHealth = newProp.health;
        if (player.health > newProp.health) {
          player.health = newProp.health;
        }
      } else if (otherPlayers.has(payload.playerId)) {
        const op = otherPlayers.get(payload.playerId)!;
        op.currentProp = newProp;
        if (payload.variantIndex !== undefined) {
          op.variantIndex = payload.variantIndex;
        }
        op.maxHealth = newProp.health;
        if (op.health > newProp.health) {
          op.health = newProp.health;
        }
      }
    }
  });

  // 5. PLAYER_HIT
  networkManager.on(MessageType.PLAYER_HIT, (payload) => {
    const targetId = payload.targetPlayerId || payload.playerId;
    const hitTime = payload.lastHitTimestamp || Date.now();
    if (targetId === networkManager.localPlayerId) {
      player.lastHitTimestamp = hitTime;
      if (payload.health !== undefined) {
        player.health = payload.health;
      } else {
        player.health = Math.max(0, player.health - (payload.damage || 10));
      }
    } else if (targetId && otherPlayers.has(targetId)) {
      const op = otherPlayers.get(targetId)!;
      op.lastHitTimestamp = hitTime;
      if (payload.health !== undefined) {
        op.health = payload.health;
      } else {
        op.health = Math.max(0, op.health - (payload.damage || 10));
      }
    }
  });

  // 6. GAME_STATE_UPDATE
  networkManager.on(MessageType.GAME_STATE_UPDATE, (payload) => {
    const playersList = payload.players as Player[];
    const currentIds = new Set<string>();
    playersList.forEach(p => {
      currentIds.add(p.id);
      if (p.id === networkManager.localPlayerId) {
        player.targetX = p.x;
        player.targetY = p.y;
        if (p.health !== undefined) player.health = p.health;
        if ('maxHealth' in p && p.maxHealth !== undefined) player.maxHealth = p.maxHealth;
        if ('lastHitTimestamp' in p && p.lastHitTimestamp !== undefined) player.lastHitTimestamp = p.lastHitTimestamp;
        if ('currentProp' in p && p.currentProp) {
          player.currentProp = p.currentProp;
        }
        if ('variantIndex' in p && p.variantIndex !== undefined) {
          player.variantIndex = p.variantIndex;
        }
      } else {
        const propDef = ('currentProp' in p && p.currentProp) ? p.currentProp : DEFAULT_PROPS[0];
        const pVariantIndex = ('variantIndex' in p && p.variantIndex !== undefined) ? p.variantIndex : 0;
        if (otherPlayers.has(p.id)) {
          const op = otherPlayers.get(p.id)!;
          op.targetX = p.x;
          op.targetY = p.y;
          if (p.health !== undefined) op.health = p.health;
          if ('maxHealth' in p && p.maxHealth !== undefined) op.maxHealth = p.maxHealth;
          if ('lastHitTimestamp' in p && p.lastHitTimestamp !== undefined) op.lastHitTimestamp = p.lastHitTimestamp;
          op.currentProp = propDef;
          op.variantIndex = pVariantIndex;
          op.role = p.role;
        } else {
          otherPlayers.set(p.id, {
            x: p.x,
            y: p.y,
            targetX: p.x,
            targetY: p.y,
            health: p.health ?? propDef.health,
            maxHealth: ('maxHealth' in p && p.maxHealth) ? p.maxHealth : propDef.health,
            lastHitTimestamp: p.lastHitTimestamp ?? 0,
            name: p.name,
            currentProp: propDef,
            variantIndex: pVariantIndex,
            role: p.role
          });
        }
      }
    });
    otherPlayers.forEach((_, id) => {
      if (!currentIds.has(id)) otherPlayers.delete(id);
    });
  });

  // 7. ROUND_START (Démarrage de la manche)
  networkManager.on<RoundStartPayload>(MessageType.ROUND_START, (payload) => {
    localPlayerRole = payload.role;
    currentPhase = GamePhase.HIDING;

    // Fermeture de l'overlay de fin de manche
    if (roundEndOverlay) {
      roundEndOverlay.classList.add('hidden');
    }

    // Mise à jour du badge de rôle
    if (gameRoleBadge) {
      const isHunter = localPlayerRole === PlayerRole.HUNTER;
      gameRoleBadge.textContent = isHunter ? 'RÔLE : CHASSEUR' : 'RÔLE : PROP';
      gameRoleBadge.style.background = isHunter ? 'rgba(239, 68, 68, 0.25)' : 'rgba(168, 85, 247, 0.25)';
      gameRoleBadge.style.color = isHunter ? '#f87171' : '#c084fc';
      gameRoleBadge.style.borderColor = isHunter ? 'rgba(239, 68, 68, 0.5)' : 'rgba(168, 85, 247, 0.5)';
    }

    // Gestion de l'aveuglement pour le Chasseur
    if (hunterBlindfold && hunterCountdown) {
      if (localPlayerRole === PlayerRole.HUNTER) {
        hunterBlindfold.classList.remove('hidden');
        hunterCountdown.textContent = payload.hidingDuration.toString();
      } else {
        hunterBlindfold.classList.add('hidden');
      }
    }
  });

  // 8. ROUND_TIMER_TICK (Horloge et phase)
  networkManager.on<RoundTimerTickPayload>(MessageType.ROUND_TIMER_TICK, (payload) => {
    currentPhase = payload.phase;
    const timeRemaining = payload.timeRemaining;

    // Formatage MM:SS
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    if (gameTimer) {
      gameTimer.textContent = formatted;
    }

    if (gamePhaseBadge) {
      switch (payload.phase) {
        case GamePhase.COUNTDOWN:
          gamePhaseBadge.textContent = 'DÉMARRAGE IMMINENT';
          gamePhaseBadge.style.color = '#fbbf24';
          gamePhaseBadge.style.borderColor = 'rgba(251, 191, 36, 0.5)';
          break;
        case GamePhase.HIDING:
          gamePhaseBadge.textContent = 'CACHE-CACHE (30s)';
          gamePhaseBadge.style.color = '#38bdf8';
          gamePhaseBadge.style.borderColor = 'rgba(56, 189, 248, 0.5)';
          break;
        case GamePhase.HUNTING:
          gamePhaseBadge.textContent = 'CHASSE EN COURS';
          gamePhaseBadge.style.color = '#f87171';
          gamePhaseBadge.style.borderColor = 'rgba(248, 113, 113, 0.5)';
          break;
        case GamePhase.ROUND_END:
          gamePhaseBadge.textContent = 'MANCHE TERMINÉE';
          gamePhaseBadge.style.color = '#c084fc';
          gamePhaseBadge.style.borderColor = 'rgba(192, 132, 252, 0.5)';
          break;
      }
    }

    // Décompte de l'aveuglement Hunter
    if (hunterBlindfold && hunterCountdown) {
      if (payload.phase === GamePhase.HIDING && localPlayerRole === PlayerRole.HUNTER) {
        hunterBlindfold.classList.remove('hidden');
        hunterCountdown.textContent = timeRemaining.toString();
      } else {
        hunterBlindfold.classList.add('hidden');
      }
    }
  });

  // 9. ROUND_END (Fin de manche)
  networkManager.on<RoundEndPayload>(MessageType.ROUND_END, (payload) => {
    currentPhase = GamePhase.ROUND_END;

    if (hunterBlindfold) {
      hunterBlindfold.classList.add('hidden');
    }

    if (roundEndOverlay && roundEndWinner && roundEndReason && roundEndScores) {
      roundEndOverlay.classList.remove('hidden');

      const isHunterWin = payload.winner === PlayerRole.HUNTER;
      roundEndWinner.textContent = isHunterWin ? 'VICTOIRE DES CHASSEURS !' : 'VICTOIRE DES PROPS !';
      roundEndWinner.style.color = isHunterWin ? '#f87171' : '#38bdf8';

      roundEndReason.textContent = payload.reason === 'ALL_PROPS_ELIMINATED'
        ? 'Tous les Props ont été débusqués et éliminés !'
        : 'Temps écoulé ! Les Props survivants remportent la manche !';

      roundEndScores.innerHTML = `
        <h4 style="margin: 0 0 10px 0; color: #94a3b8; font-size: 0.9rem; text-transform: uppercase;">Scores de la manche</h4>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${payload.scores.map((s, idx) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255, 255, 255, 0.04); border-radius: 6px;">
              <span>#${idx + 1} <strong>${escapeHtml(s.name)}</strong> ${s.survived ? '🟢 (Survivant)' : ''}</span>
              <span style="color: #fbbf24; font-family: monospace; font-weight: bold;">${s.score} pts</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  });

  // 10. LOBBY_STATE (Retour automatique au salon quand la manche est finie)
  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, () => {
    if (currentPhase === GamePhase.ROUND_END) {
      currentPhase = GamePhase.LOBBY;
      if (roundEndOverlay) {
        roundEndOverlay.classList.add('hidden');
      }
      if (viewGame && viewLobby) {
        switchView(viewGame, viewLobby);
      }
    }
  });

  // Gestion des inputs clavier (Z, Q, S, D, E, R, K, H)
  const keys: { [key: string]: boolean } = {};

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'h') {
      showHitbox = !showHitbox;
    }

    // Touche 'E' : Se transformer en prop suivant du catalogue
    if (e.key.toLowerCase() === 'e') {
      currentPropIndex = (currentPropIndex + 1) % DEFAULT_PROPS.length;
      const nextProp = DEFAULT_PROPS[currentPropIndex];
      player.currentProp = nextProp;
      player.variantIndex = 0;
      player.maxHealth = nextProp.health;
      if (player.health > nextProp.health) {
        player.health = nextProp.health;
      }

      if (networkManager.localPlayerId) {
        networkManager.send(MessageType.TRANSFORM_PROP, {
          playerId: networkManager.localPlayerId,
          propId: nextProp.id,
          variantIndex: 0,
          spriteKey: nextProp.internalName
        });
      }
    }

    // Touche 'R' : Tourner le prop actuel
    if (e.key.toLowerCase() === 'r') {
      const variants = player.currentProp.variants || [];
      if (variants.length > 1) {
        player.variantIndex = (player.variantIndex + 1) % variants.length;
        if (networkManager.localPlayerId) {
          networkManager.send(MessageType.TRANSFORM_PROP, {
            playerId: networkManager.localPlayerId,
            propId: player.currentProp.id,
            variantIndex: player.variantIndex,
            spriteKey: player.currentProp.internalName
          });
        }
      }
    }

    // Touche 'K' : Simulation de dégâts subis (-15 HP)
    if (e.key.toLowerCase() === 'k') {
      const damage = 15;
      player.health = Math.max(0, player.health - damage);
      player.lastHitTimestamp = Date.now();
      if (networkManager.localPlayerId) {
        networkManager.send(MessageType.PLAYER_HIT, {
          targetPlayerId: networkManager.localPlayerId,
          damage: damage,
          lastHitTimestamp: player.lastHitTimestamp
        });
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Tir du Chasseur au clic gauche de souris
  canvas.addEventListener('click', (e) => {
    if (localPlayerRole === PlayerRole.HUNTER && currentPhase === GamePhase.HUNTING && networkManager.localPlayerId) {
      const rect = canvas.getBoundingClientRect();
      const mouseScreenX = e.clientX - rect.left;
      const mouseScreenY = e.clientY - rect.top;

      const zoom = Math.min(canvas.width, canvas.height) / (VISION_RADIUS * 2);
      const worldX = (mouseScreenX - canvas.width / 2) / zoom + player.x;
      const worldY = (mouseScreenY - canvas.height / 2) / zoom + player.y;

      networkManager.send(MessageType.HUNTER_SHOOT, {
        hunterId: networkManager.localPlayerId,
        targetX: Math.round(worldX),
        targetY: Math.round(worldY)
      });
    }
  });

  let lastVx = 0;
  let lastVy = 0;
  const VISION_RADIUS = 200;

  // Boucle de jeu (Game Loop Canvas)
  function gameLoop() {
    if (viewGame?.classList.contains('active')) {
      let vx = 0;
      let vy = 0;
      if (keys['z'] || keys['arrowup']) { vy -= 1; }
      if (keys['s'] || keys['arrowdown']) { vy += 1; }
      if (keys['q'] || keys['arrowleft']) { vx -= 1; }
      if (keys['d'] || keys['arrowright']) { vx += 1; }

      // Envoi de l'intention de mouvement via WebSocket si elle change
      if ((vx !== lastVx || vy !== lastVy) && networkManager.localPlayerId) {
        networkManager.send(MessageType.PLAYER_MOVE, {
          playerId: networkManager.localPlayerId,
          x: player.x,
          y: player.y,
          vx: vx,
          vy: vy
        });
        lastVx = vx;
        lastVy = vy;
      }

      // Interpolation (Lerp)
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

      const zoom = Math.min(canvas.width, canvas.height) / (VISION_RADIUS * 2);
      ctx!.translate(canvas.width / 2, canvas.height / 2);
      ctx!.scale(zoom, zoom);
      ctx!.translate(-player.x, -player.y);

      // 1. Dessiner la carte (Ground & Walls)
      if (mapData && tilesetImg.complete) {
        const tileW = mapData.tilewidth;
        const tileH = mapData.tileheight;
        const cols = Math.floor(tilesetImg.width / tileW);

        mapData.layers.forEach((layer: any) => {
          if (layer.type === 'tilelayer' && layer.name !== 'above') {
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

      // 2. Fonction utilitaire pour dessiner un personnage ou prop
      const drawCharacter = (
        posX: number,
        posY: number,
        prop: PropDefinition,
        variantIndex: number,
        health: number,
        maxHealth: number,
        lastHitTimestamp: number | undefined,
        bodyColor: string,
        glowColor: string,
        label?: string
      ) => {
        const variants = prop.variants || [];
        const variant = variants[variantIndex] || variants[0] || {
          assetPath: prop.assetPath,
          width: prop.width,
          height: prop.height,
          orientationName: 'Défaut'
        };

        const bodyW = variant.width || prop.width || 32;
        const bodyH = variant.height || prop.height || 32;
        const radius = prop.hitboxRadius || 10;
        const assetPath = variant.assetPath || prop.assetPath;

        const bodyX = posX - bodyW / 2;
        const bodyY = posY + radius - bodyH;

        // Ombre au sol
        ctx!.save();
        ctx!.beginPath();
        ctx!.ellipse(posX, posY, radius + 2, radius * 0.5, 0, 0, Math.PI * 2);
        ctx!.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx!.fill();
        ctx!.restore();

        // Rendu texture
        const propImg = assetPath ? propImages.get(assetPath) : null;
        if (propImg && propImg.complete && propImg.naturalWidth > 0) {
          ctx!.save();
          ctx!.imageSmoothingEnabled = false;
          ctx!.drawImage(propImg, bodyX, bodyY, bodyW, bodyH);
          ctx!.restore();
        } else {
          ctx!.save();
          ctx!.shadowColor = glowColor;
          ctx!.shadowBlur = 10;
          ctx!.fillStyle = bodyColor;
          ctx!.fillRect(bodyX, bodyY, bodyW, bodyH);
          ctx!.restore();
        }

        // Rendu Hitbox en debug
        if (showHitbox) {
          ctx!.save();
          ctx!.beginPath();
          ctx!.arc(posX, posY, radius, 0, Math.PI * 2);
          ctx!.strokeStyle = 'rgba(239, 68, 68, 0.7)';
          ctx!.lineWidth = 1.5;
          ctx!.stroke();
          ctx!.restore();
        }

        // Barre de vie (affichée 5s après un hit)
        const now = Date.now();
        const timeSinceHit = lastHitTimestamp ? now - lastHitTimestamp : Infinity;
        if (timeSinceHit < GAMEPLAY_CONFIG.shows_infos_duration && health > 0) {
          const barW = Math.max(bodyW, 36);
          const barH = 5;
          const barX = posX - barW / 2;
          const barY = bodyY - 10;
          const healthRatio = Math.max(0, Math.min(1, health / (maxHealth || 100)));

          ctx!.save();
          ctx!.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx!.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

          ctx!.fillStyle = healthRatio > 0.5 ? '#4ade80' : healthRatio > 0.25 ? '#facc15' : '#ef4444';
          ctx!.fillRect(barX, barY, barW * healthRatio, barH);
          ctx!.restore();
        }

        // Label du joueur
        if (label) {
          ctx!.save();
          ctx!.font = '10px sans-serif';
          ctx!.fillStyle = '#ffffff';
          ctx!.textAlign = 'center';
          ctx!.fillText(label, posX, bodyY - 14);
          ctx!.restore();
        }
      };

      // 3. Dessiner les autres joueurs
      otherPlayers.forEach((op) => {
        const isHunter = op.role === PlayerRole.HUNTER;
        drawCharacter(
          op.x,
          op.y,
          op.currentProp || DEFAULT_PROPS[0],
          op.variantIndex || 0,
          op.health,
          op.maxHealth,
          op.lastHitTimestamp,
          isHunter ? '#f87171' : '#a855f7',
          isHunter ? '#ef4444' : '#a855f7',
          op.name
        );
      });

      // 4. Dessiner le joueur local
      const isLocalHunter = localPlayerRole === PlayerRole.HUNTER;
      drawCharacter(
        player.x,
        player.y,
        player.currentProp,
        player.variantIndex,
        player.health,
        player.maxHealth,
        player.lastHitTimestamp,
        isLocalHunter ? '#f87171' : '#38bdf8',
        isLocalHunter ? '#ef4444' : '#38bdf8',
        'Toi'
      );

      // 5. Dessiner la couche au-dessus (Above)
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
