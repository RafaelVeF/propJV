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
        QUITTER
      </button>

      <!-- HUD Central Supérieur (Timer, Phase & Rôle) -->
      <div id="game-hud-top" style="position: absolute; top: 20px; left: 50%; transform: translateX(-50%); z-index: 20; display: flex; flex-direction: column; align-items: center; gap: 4px; pointer-events: none;">
        <div id="game-phase-badge" style="font-family: sans-serif; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 1.5px; padding: 4px 14px; border-radius: 20px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4);">
          EN ATTENTE
        </div>
        <div id="game-timer" style="font-family: monospace; font-size: 28px; font-weight: 900; color: #ffffff; text-shadow: 0 0 10px rgba(0,0,0,0.8);">
          04:00
        </div>
        <div id="game-role-badge" style="font-family: sans-serif; font-size: 13px; font-weight: 800; padding: 4px 14px; border-radius: 6px; background: rgba(168, 85, 247, 0.25); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.5);">
          RÔLE : EN ATTENTE
        </div>
      </div>

      <div id="ws-status" style="position: absolute; top: 20px; right: 20px; z-index: 20; color: #4ade80; font-family: sans-serif; font-size: 14px; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 6px;">
        WS: Connexion en cours...
      </div>

      <!-- Overlay Aveuglement Hunter (30s de cachette) -->
      <div id="hunter-blindfold" style="display: none; position: absolute; inset: 0; background: rgba(5, 5, 8, 0.95); z-index: 25; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(12px); color: #ffffff;">
        <div style="font-size: 3.5rem; margin-bottom: 8px;">🎯</div>
        <h2 style="font-size: 2.2rem; font-weight: 900; color: #f87171; letter-spacing: 2px; margin-bottom: 8px;">VOUS ÊTES CHASSEUR</h2>
        <p style="font-size: 1.15rem; color: #94a3b8; margin-bottom: 20px;">Les Props ont 30 secondes pour se disperser et se cacher...</p>
        <div id="hunter-countdown" style="font-family: monospace; font-size: 4rem; font-weight: 900; color: #fbbf24;">30</div>
        <span style="color: #64748b; font-size: 0.95rem; margin-top: 12px;">Vos armes et mouvements sont temporairement verrouillés</span>
      </div>

      <!-- Overlay Fin de Manche -->
      <div id="round-end-overlay" style="display: none; position: absolute; inset: 0; background: rgba(10, 10, 15, 0.94); z-index: 30; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(10px); color: #ffffff; padding: 20px;">
        <h2 id="round-end-winner" style="font-size: 2.8rem; font-weight: 900; letter-spacing: 2px; margin-bottom: 8px;"></h2>
        <p id="round-end-reason" style="font-size: 1.2rem; color: #cbd5e1; margin-bottom: 24px;"></p>
        <div id="round-end-scores" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 18px 24px; width: 90%; max-width: 480px; margin-bottom: 24px;"></div>
        <div style="font-size: 1rem; color: #94a3b8; font-style: italic;">Retour automatique au salon dans <span id="round-end-countdown" style="color: #38bdf8; font-weight: bold;">10</span>s...</div>
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

  const gamePhaseBadge = document.getElementById('game-phase-badge');
  const gameTimer = document.getElementById('game-timer');
  const gameRoleBadge = document.getElementById('game-role-badge');
  const hunterBlindfold = document.getElementById('hunter-blindfold');
  const hunterCountdown = document.getElementById('hunter-countdown');
  const roundEndOverlay = document.getElementById('round-end-overlay');
  const roundEndWinner = document.getElementById('round-end-winner');
  const roundEndReason = document.getElementById('round-end-reason');
  const roundEndScores = document.getElementById('round-end-scores');
  const roundEndCountdown = document.getElementById('round-end-countdown');

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

  // Préchargement des textures de props (y compris toutes les orientations/variantes)
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
  let showHitbox = true; // Activer l'affichage visuel de la hitbox (touche 'H' pour activer/désactiver)
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
    variantIndex: 0, // Index de l'orientation/variante actuelle du prop
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
  }>();

  // Connexion via le NetworkManager partagé
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

  networkManager.on(MessageType.WELCOME, (payload) => {
    if (payload.player.currentProp) {
      player.currentProp = payload.player.currentProp;
    }
    if ('variantIndex' in payload.player && payload.player.variantIndex !== undefined) {
      player.variantIndex = payload.player.variantIndex;
    }
    player.health = payload.player.health ?? player.currentProp.health;
    player.maxHealth = payload.player.maxHealth ?? player.currentProp.health;
    player.lastHitTimestamp = payload.player.lastHitTimestamp ?? 0;
    console.log('[WS] Bienvenue ! Mon ID joueur :', networkManager.localPlayerId, `(HP: ${player.health}/${player.maxHealth})`);
  });

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
      variantIndex: ('variantIndex' in newP && newP.variantIndex !== undefined) ? newP.variantIndex : 0
    });
    console.log('[WS] Nouveau joueur rejoint :', newP.id);
  });

  networkManager.on(MessageType.PLAYER_LEFT, (payload) => {
    otherPlayers.delete(payload.playerId);
    console.log('[WS] Joueur déconnecté :', payload.playerId);
  });

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
        console.log(`[PROP] Transformation réussie en : ${newProp.displayName} (orientation: ${player.variantIndex}) (${player.health}/${player.maxHealth} HP)`);
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
      console.log(`[COMBAT] Dégâts subis : -${payload.damage} HP (Vie restante : ${player.health}/${player.maxHealth}) - Barre de vie affichée pendant 5s`);
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
            variantIndex: pVariantIndex
          });
        }
      }
    });
    // Nettoyage des joueurs qui ne sont plus dans le state
    otherPlayers.forEach((_, id) => {
      if (!currentIds.has(id)) otherPlayers.delete(id);
    });
  });

  // --- RÉCEPTION DES ÉVÉNEMENTS DE ROUND ---
  networkManager.on<RoundStartPayload>(MessageType.ROUND_START, (payload) => {
    localPlayerRole = payload.role;
    currentPhase = GamePhase.HIDING;

    if (roundEndOverlay) {
      roundEndOverlay.style.display = 'none';
    }

    if (gameRoleBadge) {
      const isHunter = localPlayerRole === PlayerRole.HUNTER;
      gameRoleBadge.textContent = isHunter ? 'RÔLE : CHASSEUR' : 'RÔLE : PROP';
      gameRoleBadge.style.background = isHunter ? 'rgba(239, 68, 68, 0.25)' : 'rgba(168, 85, 247, 0.25)';
      gameRoleBadge.style.color = isHunter ? '#f87171' : '#c084fc';
      gameRoleBadge.style.borderColor = isHunter ? 'rgba(239, 68, 68, 0.5)' : 'rgba(168, 85, 247, 0.5)';
    }

    if (hunterBlindfold && hunterCountdown) {
      if (localPlayerRole === PlayerRole.HUNTER) {
        hunterBlindfold.style.display = 'flex';
        hunterCountdown.textContent = payload.hidingDuration.toString();
      } else {
        hunterBlindfold.style.display = 'none';
      }
    }
  });

  networkManager.on<RoundTimerTickPayload>(MessageType.ROUND_TIMER_TICK, (payload) => {
    const previousPhase = currentPhase;
    currentPhase = payload.phase;
    const timeRemaining = payload.timeRemaining;
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
          break;
        case GamePhase.HIDING:
          gamePhaseBadge.textContent = 'CACHE-CACHE (30s)';
          gamePhaseBadge.style.color = '#38bdf8';
          break;
        case GamePhase.HUNTING:
          gamePhaseBadge.textContent = 'CHASSE EN COURS';
          gamePhaseBadge.style.color = '#f87171';
          break;
        case GamePhase.ROUND_END:
          gamePhaseBadge.textContent = 'MANCHE TERMINÉE';
          gamePhaseBadge.style.color = '#c084fc';
          break;
      }
    }

    if (hunterBlindfold && hunterCountdown) {
      if (payload.phase === GamePhase.HIDING && localPlayerRole === PlayerRole.HUNTER) {
        hunterBlindfold.style.display = 'flex';
        hunterCountdown.textContent = timeRemaining.toString();
      } else {
        hunterBlindfold.style.display = 'none';
      }
    }

    if (payload.phase === GamePhase.ROUND_END && roundEndCountdown) {
      roundEndCountdown.textContent = timeRemaining.toString();
    }

    // Retour automatique au salon lorsque le serveur repasse en LOBBY après ROUND_END
    if (payload.phase === GamePhase.LOBBY && previousPhase === GamePhase.ROUND_END) {
      if (roundEndOverlay) roundEndOverlay.style.display = 'none';
      if (hunterBlindfold) hunterBlindfold.style.display = 'none';
      if (viewGame && viewLobby && viewGame.classList.contains('active')) {
        switchView(viewGame, viewLobby);
      }
    }
  });

  networkManager.on<RoundEndPayload>(MessageType.ROUND_END, (payload) => {
    currentPhase = GamePhase.ROUND_END;
    if (hunterBlindfold) hunterBlindfold.style.display = 'none';

    if (roundEndOverlay && roundEndWinner && roundEndReason && roundEndScores) {
      roundEndOverlay.style.display = 'flex';
      if (roundEndCountdown) roundEndCountdown.textContent = '10';

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
              <span>#${idx + 1} <strong>${s.name}</strong> ${s.survived ? '🟢 (Survivant)' : ''}</span>
              <span style="color: #fbbf24; font-family: monospace; font-weight: bold;">${s.score} pts</span>
            </div>
          `).join('')}
        </div>
      `;
    }
  });

  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, () => {
    if (currentPhase === GamePhase.ROUND_END) {
      currentPhase = GamePhase.LOBBY;
      if (roundEndOverlay) roundEndOverlay.style.display = 'none';
      if (viewGame && viewLobby) {
        switchView(viewGame, viewLobby);
      }
    }
  });

  // Gestion des inputs (Z, Q, S, D, et flèches)
  const keys: { [key: string]: boolean } = {};

  window.addEventListener('keydown', (e) => {
    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'h') {
      showHitbox = !showHitbox;
      console.log(`[DEBUG] Affichage des hitboxes : ${showHitbox ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
    }
    // Touche 'E' : Se transformer en prop suivant du catalogue
    if (e.key.toLowerCase() === 'e') {
      currentPropIndex = (currentPropIndex + 1) % DEFAULT_PROPS.length;
      const nextProp = DEFAULT_PROPS[currentPropIndex];
      player.currentProp = nextProp;
      player.variantIndex = 0; // Réinitialise l'orientation par défaut (Face)
      player.maxHealth = nextProp.health;
      if (player.health > nextProp.health) {
        player.health = nextProp.health;
      }
      console.log(`[PROP] Demande de transformation en : ${nextProp.displayName}`);
      if (networkManager.localPlayerId) {
        networkManager.send(MessageType.TRANSFORM_PROP, {
          playerId: networkManager.localPlayerId,
          propId: nextProp.id,
          variantIndex: 0,
          spriteKey: nextProp.internalName
        });
      }
    }
    // Touche 'R' : Tourner le prop actuel (boucler sur ses variantes d'orientation)
    if (e.key.toLowerCase() === 'r') {
      const variants = player.currentProp.variants || [];
      if (variants.length > 1) {
        player.variantIndex = (player.variantIndex + 1) % variants.length;
        const currentVariant = variants[player.variantIndex];
        console.log(`[PROP] Rotation : ${player.currentProp.displayName} -> ${currentVariant.orientationName || `Variante ${player.variantIndex}`} (${currentVariant.width}x${currentVariant.height})`);
        if (networkManager.localPlayerId) {
          networkManager.send(MessageType.TRANSFORM_PROP, {
            playerId: networkManager.localPlayerId,
            propId: player.currentProp.id,
            variantIndex: player.variantIndex,
            spriteKey: player.currentProp.internalName
          });
        }
      } else {
        console.log(`[PROP] ${player.currentProp.displayName} n'a pas d'autre orientation disponible.`);
      }
    }
    // Touche 'K' : Simuler des dégâts (-15 HP) pour tester l'apparition de la barre et la régénération
    if (e.key.toLowerCase() === 'k') {
      const damage = 15;
      player.health = Math.max(0, player.health - damage);
      player.lastHitTimestamp = Date.now();
      console.log(`[TEST] Dégâts appliqués : -${damage} HP (Vie restante: ${player.health}/${player.maxHealth}) - Régénération dans 10s`);
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

      // --- 2. FONCTION UTILITAIRE DE RENDU D'UN PERSONNAGE OU PROP DYNAMIQUE ---
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

        // Point d'ancrage : (posX, posY) est le centre de la hitbox physique au sol
        // Le corps du prop/personnage s'élève au-dessus de ses pieds
        const bodyX = posX - bodyW / 2;
        const bodyY = posY + radius - bodyH;

        // A. Ombre au sol (effet de perspective top-down)
        ctx!.save();
        ctx!.beginPath();
        ctx!.ellipse(posX, posY, radius + 2, radius * 0.5, 0, 0, Math.PI * 2);
        ctx!.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx!.fill();
        ctx!.restore();

        // B. Rendu du Prop (Texture PNG de la variante active ou forme géométrique de repli)
        const propImg = assetPath ? propImages.get(assetPath) : null;
        if (propImg && propImg.complete && propImg.naturalWidth > 0) {
          ctx!.save();
          ctx!.imageSmoothingEnabled = false; // Rendu pixel art net
          ctx!.drawImage(propImg, bodyX, bodyY, bodyW, bodyH);
          ctx!.restore();
        } else {
          // Rendu géométrique par défaut (ex: forme humanoïde ou boîte)
          ctx!.save();
          ctx!.shadowColor = glowColor;
          ctx!.shadowBlur = 10;
          ctx!.fillStyle = bodyColor;
          ctx!.beginPath();
          ctx!.roundRect(bodyX, bodyY, bodyW, bodyH, 4);
          ctx!.fill();
          ctx!.lineWidth = 1.5;
          ctx!.strokeStyle = 'rgba(255, 255, 255, 0.4)';
          ctx!.stroke();
          ctx!.shadowBlur = 0;

          // Repère visuel pour le mode humanoïde
          if (prop.internalName === 'prop_human') {
            ctx!.fillStyle = 'rgba(255, 255, 255, 0.8)';
            ctx!.fillRect(bodyX + 4, bodyY + 6, bodyW - 8, 8);
          }
          ctx!.restore();
        }

        // C. BARRE DE VIE DYNAMIQUE (Visible UNIQUEMENT pendant shows_infos_duration après un hit)
        const now = Date.now();
        const timeSinceHit = now - (lastHitTimestamp || 0);
        const isHealthBarVisible = (lastHitTimestamp !== undefined && lastHitTimestamp > 0) &&
                                   (timeSinceHit < GAMEPLAY_CONFIG.shows_infos_duration);

        if (isHealthBarVisible) {
          const safeMax = Math.max(1, maxHealth);
          const safeHealth = Math.max(0, Math.min(safeMax, health));
          const healthRatio = safeHealth / safeMax;

          // Couleurs selon les pourcentages demandés :
          // - Vert par défaut (> 50%)
          // - Jaune à 50% ou moins (<= 0.50)
          // - Rouge à 25% ou moins (<= 0.25)
          let healthColor = '#22c55e'; // Vert
          if (healthRatio <= 0.25) {
            healthColor = '#ef4444'; // Rouge
          } else if (healthRatio <= 0.50) {
            healthColor = '#eab308'; // Jaune
          }

          const barW = Math.max(34, bodyW + 4);
          const barH = 5;
          const barX = posX - barW / 2;
          const barY = bodyY - 12;

          // Fondu progressif d'estompement sur la dernière seconde
          const timeRemaining = GAMEPLAY_CONFIG.shows_infos_duration - timeSinceHit;
          const fadeAlpha = timeRemaining < 1000 ? Math.max(0, timeRemaining / 1000) : 1;

          ctx!.save();
          ctx!.globalAlpha = fadeAlpha;

          // 1. Fond sombre de la barre de vie
          ctx!.fillStyle = 'rgba(10, 10, 10, 0.85)';
          ctx!.beginPath();
          ctx!.roundRect(barX, barY, barW, barH, 2);
          ctx!.fill();

          // 2. Remplissage coloré de la vie restante
          const fillW = Math.max(0, (barW - 2) * healthRatio);
          if (fillW > 0) {
            ctx!.fillStyle = healthColor;
            ctx!.shadowColor = healthColor;
            ctx!.shadowBlur = 6;
            ctx!.beginPath();
            ctx!.roundRect(barX + 1, barY + 1, fillW, barH - 2, 1);
            ctx!.fill();
            ctx!.shadowBlur = 0;
          }

          // 3. Bordure fine
          ctx!.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx!.lineWidth = 0.8;
          ctx!.beginPath();
          ctx!.roundRect(barX, barY, barW, barH, 2);
          ctx!.stroke();

          // 4. Texte des HP au-dessus de la barre
          ctx!.font = 'bold 8px monospace';
          ctx!.textAlign = 'center';
          ctx!.lineWidth = 2;
          ctx!.strokeStyle = 'rgba(0, 0, 0, 0.85)';
          ctx!.strokeText(`${Math.ceil(safeHealth)} / ${safeMax} HP`, posX, barY - 3);
          ctx!.fillStyle = '#ffffff';
          ctx!.fillText(`${Math.ceil(safeHealth)} / ${safeMax} HP`, posX, barY - 3);

          ctx!.restore();
        }

        // D. Visualisation DEBUG de la Hitbox (activable via touche 'H')
        if (showHitbox) {
          ctx!.save();

          // 1. Hitbox physique active (Cercle physique utilisé par le serveur)
          ctx!.beginPath();
          ctx!.arc(posX, posY, radius, 0, Math.PI * 2);
          ctx!.fillStyle = 'rgba(34, 197, 94, 0.25)'; // Vert translucide
          ctx!.fill();
          ctx!.lineWidth = 1.5;
          ctx!.strokeStyle = '#22c55e'; // Vert fluo
          ctx!.stroke();

          // 2. Croix centrale de la hitbox physique (point de collision)
          ctx!.beginPath();
          ctx!.moveTo(posX - 4, posY);
          ctx!.lineTo(posX + 4, posY);
          ctx!.moveTo(posX, posY - 4);
          ctx!.lineTo(posX, posY + 4);
          ctx!.strokeStyle = '#ffffff';
          ctx!.lineWidth = 1;
          ctx!.stroke();

          // 3. Cadre englobant le sprite du prop (width x height de la variante)
          ctx!.setLineDash([3, 3]);
          ctx!.strokeStyle = 'rgba(234, 179, 8, 0.8)'; // Jaune pointillé
          ctx!.lineWidth = 1;
          ctx!.strokeRect(bodyX, bodyY, bodyW, bodyH);

          // 4. Label debug au-dessus (incluant l'orientation courante)
          const debugLabelY = isHealthBarVisible ? (bodyY - 24) : (bodyY - 6);
          const orientationTag = variant.orientationName ? ` [${variant.orientationName}]` : '';
          ctx!.font = '9px monospace';
          ctx!.fillStyle = '#ffffff';
          ctx!.textAlign = 'center';
          ctx!.fillText(label ? `${label}${orientationTag}` : `${prop.displayName}${orientationTag} [R${radius}]`, posX, debugLabelY);

          ctx!.restore();
        }
      };

      // --- 3. RENDU DES JOUEURS / ENTITÉS AVEC PROFONDEUR DE PERSPECTIVE (Y-Sorting) ---
      // On regroupe tous les acteurs dans une même liste et on les trie par leur position Y au sol (posY).
      // Règle d'or 2D top-down : plus Y est petit (plus haut / plus au fond), plus l'entité est dessinée tôt.
      // Plus Y est grand (plus bas / au premier plan), plus l'entité est dessinée tard (devant les autres).
      interface RenderableCharacter {
        x: number;
        y: number;
        prop: PropDefinition;
        variantIndex: number;
        health: number;
        maxHealth: number;
        lastHitTimestamp: number | undefined;
        bodyColor: string;
        glowColor: string;
        label: string;
      }

      const charactersToDraw: RenderableCharacter[] = [
        {
          x: player.x,
          y: player.y,
          prop: player.currentProp,
          variantIndex: player.variantIndex,
          health: player.health,
          maxHealth: player.maxHealth,
          lastHitTimestamp: player.lastHitTimestamp,
          bodyColor: '#ef4444',
          glowColor: '#dc2626',
          label: `Moi : ${player.currentProp.displayName}`
        }
      ];

      otherPlayers.forEach((op) => {
        const propToDraw = op.currentProp || DEFAULT_PROPS[0];
        charactersToDraw.push({
          x: op.x,
          y: op.y,
          prop: propToDraw,
          variantIndex: op.variantIndex ?? 0,
          health: op.health ?? propToDraw.health,
          maxHealth: op.maxHealth ?? propToDraw.health,
          lastHitTimestamp: op.lastHitTimestamp,
          bodyColor: '#a855f7',
          glowColor: '#7c3aed',
          label: `${op.name || 'Joueur'} : ${propToDraw.displayName}`
        });
      });

      // Tri automatique par Y croissant : ceux qui sont plus haut sont dessinés d'abord, ceux plus bas passent devant
      charactersToDraw.sort((a, b) => a.y - b.y);

      // Dessin dans l'ordre de profondeur exact
      charactersToDraw.forEach((c) => {
        drawCharacter(
          c.x,
          c.y,
          c.prop,
          c.variantIndex,
          c.health,
          c.maxHealth,
          c.lastHitTimestamp,
          c.bodyColor,
          c.glowColor,
          c.label
        );
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

