import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import { TransformationWheel } from '../game/ui/TransformationWheel';
import { musicManager } from '../audio/MusicManager';
import { buildMapSnapshot, renderMinimap, renderFullMap, type MinimapPlayerMarker } from '../game/ui/Minimap';
import { VisualEffectsManager } from '../game/ui/VisualEffects';
import { ChatManager } from '../game/ui/ChatManager';
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
  type LobbyStatePayload,
  WeaponType,
  WEAPONS,
  WEAPON_ORDER,
  getPlayerHurtbox,
  getNextSpectateTarget,
  type HunterShootPayload,
  type ShotFiredPayload,
  type GrenadeExplodedPayload,
  type WeaponStatePayload,
  type PlayerDiedPayload,
  type PlayerHitPayload,
  type ChatMessagePayload,
  type HitboxTogglePayload,
  type KickedPayload
} from '@prop-hunt/shared';

export function renderGame(): string {
  return `
    <div id="view-game" class="view" style="width: 100vw; height: 100vh; background: #0a0a0a; position: relative; overflow: hidden;">
      <!-- Haut Gauche : Engrenage Pause + Barre de Vie du Joueur -->
      <div class="hud-top-left">
        <button id="btn-pause-menu" class="hud-panel hud-gear-btn" title="Menu Pause (Échap)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
          </svg>
        </button>

        <div class="hud-panel hud-health-card">
          <div class="hud-health-info">
            <div class="hud-health-header">
              <span id="game-role-badge" class="hud-role-label">PROP</span>
              <span id="hud-hp-text" class="hud-hp-text">100 / 100 PV</span>
            </div>
            <div class="hud-hp-track">
              <div id="hud-hp-fill" class="hud-hp-fill"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Haut Centre : Chrono + Phase + Compteur Survivants (fond sombre haute lisibilité) -->
      <div id="game-hud-top" class="hud-top-center">
        <div class="hud-timer-card">
          <div class="hud-timer-header">
            <span id="game-phase-badge" class="hud-phase-label">EN ATTENTE</span>
            <span id="game-timer" class="hud-timer-value">04:00</span>
          </div>
          <div id="game-survivors-badge" class="hud-survivors-strip">
            <span>HUNTER 0</span>
            <span class="hud-survivors-sep">|</span>
            <span>PROPS 0</span>
          </div>
        </div>
      </div>

      <!-- Haut Droite : Minimap Circulaire encadrée -->
      <div id="minimap-wrapper" class="hud-minimap-frame" title="Cliquer pour ouvrir le plan complet">
        <div class="hud-minimap-inner">
          <canvas id="minimap-canvas" width="144" height="144" style="display: block; width: 100%; height: 100%; border-radius: 50%;"></canvas>
        </div>
      </div>

      <!-- Menu Pause (regroupe Audio, Hitboxes & Quitter la partie) -->
      <div id="pause-menu-overlay" class="hud-pause-overlay">
        <div class="hud-panel hud-pause-card">
          <h2 class="hud-pause-title">PAUSE</h2>
          <button id="btn-resume-game" class="btn primary">REPRENDRE LA PARTIE</button>
          <button id="btn-toggle-music" class="btn secondary">MUSIQUE : ON</button>
          <button id="btn-leave-game" class="btn back">QUITTER LA PARTIE</button>
          <div id="ws-status" class="hud-pause-meta">WS: Connexion en cours...</div>
        </div>
      </div>

      <!-- Modal Plan Complet de la Carte (au clic sur la minimap) -->
      <div id="fullmap-overlay" style="display: none; position: absolute; inset: 0; background: rgba(5, 8, 15, 0.84); z-index: 28; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(6px); font-family: var(--font-main); color: #e2e8f0; padding: 20px;">
        <div class="hud-panel" style="border-radius: 12px; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; max-width: 92vw;">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 24px;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <span style="font-family: var(--font-display); font-size: 1.4rem; letter-spacing: 1.5px; color: #f8fafc;">PLAN DE LA CARTE</span>
              <span style="font-size: 12px; color: #94a3b8; display: inline-flex; align-items: center; gap: 10px;">
                <span><span style="color: #38bdf8;">●</span> Toi</span>
                <span><span style="color: #4ade80;">●</span> Allié</span>
              </span>
            </div>
            <button id="btn-close-fullmap" class="btn back" style="width: auto; padding: 5px 14px; font-size: 12px;">
              FERMER (Échap)
            </button>
          </div>
          <canvas id="fullmap-canvas" width="880" height="656" style="display: block; max-width: 84vw; max-height: 74vh; width: auto; height: auto; border-radius: 6px; border: 1px solid rgba(255,255,255,0.12); background: #0b1120;"></canvas>
        </div>
      </div>

      <!-- Overlay Aveuglement Hunter (30s de cachette) -->
      <div id="hunter-blindfold" style="display: none; position: absolute; inset: 0; background: rgba(5, 5, 8, 0.95); z-index: 25; flex-direction: column; align-items: center; justify-content: center; backdrop-filter: blur(12px); color: #ffffff;">
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

      <!-- Barre d'armes du chasseur (bas droite) -->
      <div id="weapon-hud" style="display: none; position: absolute; bottom: 24px; right: 24px; z-index: 20; gap: 8px; pointer-events: none; font-family: sans-serif;">
        ${WEAPON_ORDER.map(type => {
          const w = WEAPONS[type];
          const icon = w.iconPath
            ? `<img src="${w.iconPath}" alt="" style="width: 32px; height: 32px; image-rendering: pixelated;">`
            : `<div style="width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 22px;">💣</div>`;
          return `
          <div class="weapon-slot" data-weapon="${type}" style="position: relative; width: 92px; padding: 8px 6px 6px; border-radius: 8px; background: rgba(0,0,0,0.65); border: 2px solid rgba(255,255,255,0.15); display: flex; flex-direction: column; align-items: center; gap: 3px; overflow: hidden;">
            <span style="position: absolute; top: 3px; left: 6px; font-size: 11px; font-weight: 800; color: #94a3b8;">${w.slot}</span>
            ${icon}
            <span style="font-size: 11px; font-weight: 700; color: #e2e8f0;">${w.displayName}</span>
            <span class="weapon-slot-info" style="font-family: monospace; font-size: 12px; color: #fbbf24; min-height: 14px;"></span>
            <div class="weapon-slot-progress" style="position: absolute; left: 0; bottom: 0; height: 3px; width: 0%; background: #38bdf8;"></div>
          </div>`;
        }).join('')}
      </div>

      <!-- Écran de mort (affiché quelques secondes quand le joueur local meurt) -->
      <div id="death-overlay" style="position: absolute; inset: 0; z-index: 26; display: none; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; background: radial-gradient(ellipse at center, rgba(120,0,0,0.15) 0%, rgba(0,0,0,0.75) 100%); font-family: sans-serif; transition: opacity 0.6s ease;">
        <div style="font-size: 56px; font-weight: 900; letter-spacing: 6px; color: #ef4444; text-shadow: 0 0 24px rgba(239,68,68,0.6);">VOUS ÊTES MORT</div>
        <div id="death-overlay-killer" style="margin-top: 12px; font-size: 18px; color: #e5e5e5;"></div>
        <div id="death-overlay-prop" style="margin-top: 6px; font-size: 14px; color: #a3a3a3;"></div>
        <div style="margin-top: 28px; font-size: 13px; color: #737373;">Passage en mode spectateur...</div>
      </div>

      <!-- Bandeau du mode spectateur -->
      <div id="spectator-hud" style="position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 20; display: none; flex-direction: column; align-items: center; gap: 6px; pointer-events: none; font-family: sans-serif;">
        <div style="background: rgba(0,0,0,0.7); border: 1px solid rgba(168,85,247,0.6); border-radius: 8px; padding: 8px 20px; text-align: center;">
          <div style="font-size: 12px; letter-spacing: 3px; color: #a855f7; font-weight: 700;">SPECTATEUR</div>
          <div id="spectator-target" style="font-size: 18px; color: #ffffff; font-weight: 600; margin-top: 2px;"></div>
        </div>
        <div id="spectator-help" style="background: rgba(0,0,0,0.55); border-radius: 6px; padding: 4px 12px; font-size: 12px; color: #d4d4d4;"></div>
      </div>

      <!-- Zone d'actions / compétences du Prop (bas droite) -->
      <div id="prop-actions-hud" class="hud-actions-bar">
        <div class="hud-panel hud-action-slot">
          <span class="hud-action-key">E</span>
          <span class="hud-action-name">Métamorphose</span>
        </div>
        <div class="hud-panel hud-action-slot">
          <span class="hud-action-key">R</span>
          <span class="hud-action-name">Orientation</span>
        </div>
        <div class="hud-panel hud-action-slot">
          <span class="hud-action-key">M</span>
          <span class="hud-action-name">Musique</span>
        </div>
      </div>

      <!-- Barre d'aide des touches (bas gauche) -->
      <div id="game-controls-bar" class="hud-panel" style="position: absolute; bottom: 20px; left: 20px; z-index: 20; pointer-events: none; border-radius: 8px; padding: 6px 12px; font-size: 12px; color: #94a3b8;">
        [ZQSD] Bouger • [Échap] Menu Pause • [Clic Minimap] Plan
      </div>
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
  const hudHpText = document.getElementById('hud-hp-text');
  const hudHpFill = document.getElementById('hud-hp-fill');
  const propActionsHud = document.getElementById('prop-actions-hud');
  const gameSurvivorsBadge = document.getElementById('game-survivors-badge');
  const gameControlsBar = document.getElementById('game-controls-bar');
  const pauseOverlay = document.getElementById('pause-menu-overlay');
  const btnPauseMenu = document.getElementById('btn-pause-menu');
  const btnResumeGame = document.getElementById('btn-resume-game');
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

  const vfx = new VisualEffectsManager();
  let lastVfxTime = performance.now();
  let isPauseMenuOpen = false;

  let localPlayerName = '';
  const chatManager = new ChatManager({
    onSendMessage: (text: string) => {
      networkManager.send(MessageType.CHAT_MESSAGE, { text });
    },
    getLocalPlayerId: () => networkManager.localPlayerId,
    getPlayerNames: () => {
      const names = Array.from(otherPlayers.values())
        .map(op => op.name)
        .filter((n): n is string => Boolean(n));
      if (localPlayerName) names.unshift(localPlayerName);
      return Array.from(new Set(names));
    }
  });
  chatManager.mount(viewGame);

  const setPauseMenuOpen = (open: boolean) => {
    isPauseMenuOpen = open;
    if (pauseOverlay) {
      pauseOverlay.style.display = open ? 'flex' : 'none';
    }
  };

  if (btnPauseMenu) {
    btnPauseMenu.addEventListener('click', () => setPauseMenuOpen(!isPauseMenuOpen));
  }
  if (btnResumeGame) {
    btnResumeGame.addEventListener('click', () => setPauseMenuOpen(false));
  }
  if (pauseOverlay) {
    pauseOverlay.addEventListener('click', (e) => {
      if (e.target === pauseOverlay) setPauseMenuOpen(false);
    });
  }

  // Gestion du retour au menu
  if (btnLeaveGame) {
    btnLeaveGame.addEventListener('click', () => {
      setPauseMenuOpen(false);
      showHitbox = false;
      hunterDrones.clear();
      chatManager.close();
      chatManager.clearMessages();
      musicManager.stop();
      networkManager.send(MessageType.LEAVE_ROOM, {});
      switchView(viewGame, viewMain);
    });
  }

  // Gestion du bouton Musique (dans le menu pause) & détection entrée/sortie de partie
  const btnToggleMusic = document.getElementById('btn-toggle-music');
  const updateMusicButton = (muted: boolean) => {
    if (!btnToggleMusic) return;
    btnToggleMusic.textContent = muted ? 'MUSIQUE : OFF' : 'MUSIQUE : ON';
  };
  if (btnToggleMusic) {
    btnToggleMusic.addEventListener('click', () => {
      musicManager.toggleMute();
    });
  }
  musicManager.onMuteChange(updateMusicButton);
  updateMusicButton(musicManager.getIsMuted());

  const gameViewObserver = new MutationObserver(() => {
    if (viewGame.classList.contains('active')) {
      musicManager.start();
    } else {
      setPauseMenuOpen(false);
      musicManager.stop();
    }
  });
  gameViewObserver.observe(viewGame, { attributes: true, attributeFilter: ['class'] });

  // Redimensionnement du canvas
  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    // Désactiver le lissage (anti-aliasing) pour garder un pixel art net
    ctx!.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize);
  resize();

  // Chargement de la Map et du Tileset + Snapshot pour la Minimap
  let mapData: any = null;
  let mapSnapshot: HTMLCanvasElement | null = null;
  let mapWidthPx = 3520;
  let mapHeightPx = 2624;
  const tilesetImg = new Image();
  tilesetImg.src = '/assets/tilesets/PropJVTileSetMap32.png';

  const tryBuildMapSnapshot = () => {
    if (!mapSnapshot && mapData && tilesetImg.complete && tilesetImg.naturalWidth > 0) {
      mapWidthPx = mapData.width * mapData.tilewidth;
      mapHeightPx = mapData.height * mapData.tileheight;
      mapSnapshot = buildMapSnapshot(mapData, tilesetImg);
    }
  };
  tilesetImg.addEventListener('load', tryBuildMapSnapshot);

  fetch('/assets/maps/map_01_32p.tmj')
    .then(res => res.json())
    .then(data => {
      mapData = data;
      tryBuildMapSnapshot();
      console.log('[MAP] Carte chargée avec succès !', data.width, 'x', data.height);
    })
    .catch(err => console.error('[MAP] Erreur de chargement de la carte:', err));

  // Contrôles Minimap & Plan Complet
  const minimapWrapper = document.getElementById('minimap-wrapper');
  const minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
  const minimapCtx = minimapCanvas?.getContext('2d') || null;
  const fullMapOverlay = document.getElementById('fullmap-overlay');
  const fullMapCanvas = document.getElementById('fullmap-canvas') as HTMLCanvasElement | null;
  const fullMapCtx = fullMapCanvas?.getContext('2d') || null;
  const btnCloseFullMap = document.getElementById('btn-close-fullmap');

  let isMinimapHovered = false;
  let isFullMapOpen = false;

  const setFullMapOpen = (open: boolean) => {
    isFullMapOpen = open;
    if (fullMapOverlay) {
      fullMapOverlay.style.display = open ? 'flex' : 'none';
    }
  };

  if (minimapWrapper) {
    minimapWrapper.addEventListener('mouseenter', () => {
      isMinimapHovered = true;
      minimapWrapper.style.transform = 'scale(1.18)';
      minimapWrapper.style.borderColor = 'rgba(56, 189, 248, 0.7)';
      minimapWrapper.style.boxShadow = '0 10px 28px rgba(0, 0, 0, 0.8)';
    });
    minimapWrapper.addEventListener('mouseleave', () => {
      isMinimapHovered = false;
      minimapWrapper.style.transform = 'scale(1)';
      minimapWrapper.style.borderColor = 'rgba(255, 255, 255, 0.28)';
      minimapWrapper.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.65)';
    });
    minimapWrapper.addEventListener('click', () => {
      setFullMapOpen(true);
    });
  }
  if (btnCloseFullMap) {
    btnCloseFullMap.addEventListener('click', () => setFullMapOpen(false));
  }
  if (fullMapOverlay) {
    fullMapOverlay.addEventListener('click', (e) => {
      if (e.target === fullMapOverlay) setFullMapOpen(false);
    });
  }

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
  let showHitbox = false; // Activé uniquement via la commande /hitbox
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
    role?: PlayerRole;
  }>();

  // Roue radiale de transformation des Props (8 slots, paginée)
  const baseHumanProp = DEFAULT_PROPS[0];
  const transformableProps = DEFAULT_PROPS.filter(p => p.internalName !== 'prop_human');
  const transformationWheel = new TransformationWheel({
    propsList: transformableProps,
    baseProp: baseHumanProp,
    propImages: propImages,
    onTransform: (targetProp: PropDefinition, isRevertToBase: boolean) => {
      player.currentProp = targetProp;
      player.variantIndex = 0;
      player.maxHealth = targetProp.health;
      if (player.health > targetProp.health) {
        player.health = targetProp.health;
      }
      transformationWheel.setCurrentEquippedPropId(targetProp.id);

      console.log(isRevertToBase
        ? `[PROP] Retour humain : ${targetProp.displayName} (${player.health}/${player.maxHealth} HP)`
        : `[PROP] Transformation : ${targetProp.displayName} (${player.health}/${player.maxHealth} HP)`);

      if (networkManager.localPlayerId) {
        networkManager.send(MessageType.TRANSFORM_PROP, {
          playerId: networkManager.localPlayerId,
          propId: targetProp.id,
          variantIndex: 0,
          spriteKey: targetProp.internalName,
          currentProp: targetProp
        });
      }
    }
  });

  // =========================================================================
  // COMBAT (côté client : visée, affichage et effets uniquement)
  // Le client envoie seulement son intention de tir, le serveur décide du résultat.
  // =========================================================================
  const weaponHud = document.getElementById('weapon-hud');
  const weaponSlots = new Map<WeaponType, { root: HTMLElement; info: HTMLElement; progress: HTMLElement }>();
  weaponHud?.querySelectorAll<HTMLElement>('.weapon-slot').forEach(el => {
    weaponSlots.set(el.dataset.weapon as WeaponType, {
      root: el,
      info: el.querySelector('.weapon-slot-info') as HTMLElement,
      progress: el.querySelector('.weapon-slot-progress') as HTMLElement
    });
  });

  const weaponImages = new Map<WeaponType, HTMLImageElement>();
  WEAPON_ORDER.forEach(type => {
    const path = WEAPONS[type].iconPath;
    if (path) {
      const img = new Image();
      img.src = path;
      weaponImages.set(type, img);
    }
  });

  const droneReadyImg = new Image();
  droneReadyImg.src = '/assets/drones/drone_ready.png';
  const droneReloadingImg = new Image();
  droneReloadingImg.src = '/assets/drones/drone_reloading.png';

  const DRONE_MUZZLE_OFFSET: Record<WeaponType, number> = {
    [WeaponType.PISTOL]: 14,
    [WeaponType.CROWBAR]: 11,
    [WeaponType.GRENADE]: 10
  };

  interface DroneState {
    x: number;
    y: number;
    drawY: number;
    bobPhase: number;
    recoil: number;
    lastDirX: number;
    lastDirY: number;
  }
  const hunterDrones = new Map<string, DroneState>();

  let selectedWeapon: WeaponType = WeaponType.PISTOL;
  /** Copie locale de l'état officiel envoyé par le serveur (échéances converties en heure locale) */
  const weaponView = new Map<WeaponType, { ammo?: number; magazineSize?: number; cooldownEndsAt: number; reloadEndsAt: number }>();
  const resetWeaponView = () => {
    WEAPON_ORDER.forEach(type => {
      weaponView.set(type, {
        ammo: WEAPONS[type].magazineSize,
        magazineSize: WEAPONS[type].magazineSize,
        cooldownEndsAt: 0,
        reloadEndsAt: 0
      });
    });
  };
  resetWeaponView();

  // Souris (coordonnées écran) et transformation caméra du dernier rendu, pour convertir en coordonnées monde
  const mouse = { x: 0, y: 0, inside: false };
  const view = { camX: 0, camY: 0, zoom: 1 };
  const screenToWorld = (sx: number, sy: number) => ({
    x: view.camX + (sx - canvas.width / 2) / view.zoom,
    y: view.camY + (sy - canvas.height / 2) / view.zoom
  });
  const HOLD_OFFSET_Y = 14; // Même valeur que WEAPON_HOLD_OFFSET_Y côté serveur

  // Effets visuels éphémères
  interface Tracer { x1: number; y1: number; x2: number; y2: number; hit: boolean; at: number; }
  interface Swing { x: number; y: number; angle: number; hit: boolean; at: number; }
  interface FlyingGrenade { id: string; x1: number; y1: number; x2: number; y2: number; at: number; fuseMs: number; }
  interface Explosion { x: number; y: number; radius: number; at: number; }
  interface DamageNumber { x: number; y: number; text: string; at: number; color: string; }
  interface DeathEffect { x: number; y: number; at: number; name: string; particles: { vx: number; vy: number; size: number; color: string }[]; }
  const tracers: Tracer[] = [];
  const swings: Swing[] = [];
  const grenades: FlyingGrenade[] = [];
  const explosions: Explosion[] = [];
  const damageNumbers: DamageNumber[] = [];
  const deathEffects: DeathEffect[] = [];
  let hitMarkerAt = 0;
  let screenShake = 0;
  /** Dernière arme / direction connue de chaque chasseur (pour orienter le canon du drone) */
  const hunterAim = new Map<string, { angle: number; weapon: WeaponType; readyAt: number }>();

  const getDroneOrigin = (hunterId: string, fallbackX: number, fallbackY: number) => {
    const d = hunterDrones.get(hunterId);
    return d ? { x: d.x, y: d.drawY } : { x: fallbackX, y: fallbackY };
  };

  const getDroneMuzzle = (dx: number, dy: number, angle: number, weapon: WeaponType) => {
    const dist = DRONE_MUZZLE_OFFSET[weapon] ?? 12;
    return {
      x: dx + Math.cos(angle) * dist,
      y: dy + Math.sin(angle) * dist
    };
  };

  const updateHunterDrone = (id: string, hx: number, hy: number, moveX: number, moveY: number, now: number) => {
    let drone = hunterDrones.get(id);
    if (!drone) {
      drone = {
        x: hx - 28,
        y: hy - 34,
        drawY: hy - 34,
        bobPhase: (id.charCodeAt(0) || 0) * 0.7,
        recoil: 0,
        lastDirX: 0.75,
        lastDirY: 0.4
      };
      hunterDrones.set(id, drone);
    }

    const moveLen = Math.hypot(moveX, moveY);
    if (moveLen > 0.15) {
      drone.lastDirX = moveX / moveLen;
      drone.lastDirY = moveY / moveLen;
    }

    const targetX = hx - drone.lastDirX * 36;
    const targetY = hy - 28 - drone.lastDirY * 22;

    if (Math.hypot(targetX - drone.x, targetY - drone.y) > 200) {
      drone.x = targetX;
      drone.y = targetY;
    } else {
      drone.x += (targetX - drone.x) * 0.14;
      drone.y += (targetY - drone.y) * 0.14;
    }

    drone.recoil *= 0.8;
    if (drone.recoil < 0.05) drone.recoil = 0;
    drone.drawY = drone.y + Math.sin(now * 0.0055 + drone.bobPhase) * 2.5;
  };

  const isLocalHunterArmed = () =>
    localPlayerRole === PlayerRole.HUNTER && !isSpectator && player.health > 0;

  const selectWeapon = (type: WeaponType) => {
    selectedWeapon = type;
    updateWeaponHud();
  };

  const cycleWeapon = (direction: 1 | -1) => {
    const idx = WEAPON_ORDER.indexOf(selectedWeapon);
    selectWeapon(WEAPON_ORDER[(idx + direction + WEAPON_ORDER.length) % WEAPON_ORDER.length]);
  };

  /** Vérification locale, uniquement pour éviter d'envoyer des tirs inutiles (le serveur revérifie tout) */
  const isWeaponReady = (type: WeaponType, now = Date.now()) => {
    const state = weaponView.get(type);
    if (!state) return false;
    if (now < state.cooldownEndsAt) return false;
    if (type === WeaponType.PISTOL && (now < state.reloadEndsAt || (state.ammo ?? 0) <= 0)) return false;
    return true;
  };

  const tryAttack = () => {
    if (!isLocalHunterArmed() || currentPhase !== GamePhase.HUNTING) return;
    if (!networkManager.localPlayerId) return;
    const now = Date.now();
    if (!isWeaponReady(selectedWeapon, now)) return;

    const target = screenToWorld(mouse.x, mouse.y);
    networkManager.send<HunterShootPayload>(MessageType.HUNTER_SHOOT, {
      weapon: selectedWeapon,
      targetX: target.x,
      targetY: target.y
    });

    // Prédiction locale du délai (corrigée par le WEAPON_STATE du serveur)
    const state = weaponView.get(selectedWeapon)!;
    state.cooldownEndsAt = now + WEAPONS[selectedWeapon].cooldownMs;
    if (selectedWeapon === WeaponType.PISTOL && state.ammo !== undefined) {
      state.ammo = Math.max(0, state.ammo - 1);
      if (state.ammo === 0) state.reloadEndsAt = now + (WEAPONS[WeaponType.PISTOL].reloadMs ?? 0);
    }
    updateWeaponHud();
  };

  const requestReload = () => {
    const state = weaponView.get(WeaponType.PISTOL);
    if (!isLocalHunterArmed() || !state) return;
    if (state.ammo === state.magazineSize || Date.now() < state.reloadEndsAt) return;
    networkManager.send(MessageType.HUNTER_RELOAD, { weapon: WeaponType.PISTOL });
  };

  const updateWeaponHud = () => {
    if (!weaponHud) return;
    const visible = isLocalHunterArmed() && currentPhase !== GamePhase.LOBBY && currentPhase !== GamePhase.ROUND_END;
    weaponHud.style.display = visible ? 'flex' : 'none';
    canvas.style.cursor = visible ? 'none' : 'default';
    if (!visible) return;

    const now = Date.now();
    WEAPON_ORDER.forEach(type => {
      const slot = weaponSlots.get(type);
      const state = weaponView.get(type);
      if (!slot || !state) return;
      const def = WEAPONS[type];
      const isSelected = type === selectedWeapon;
      slot.root.style.borderColor = isSelected ? '#fbbf24' : 'rgba(255,255,255,0.15)';
      slot.root.style.transform = isSelected ? 'translateY(-4px)' : 'none';

      const reloadLeft = state.reloadEndsAt - now;
      const cooldownLeft = state.cooldownEndsAt - now;
      if (type === WeaponType.PISTOL && reloadLeft > 0) {
        slot.info.textContent = 'RECHARGE...';
        slot.info.style.color = '#38bdf8';
        slot.progress.style.width = `${100 * (1 - reloadLeft / (def.reloadMs ?? 1))}%`;
      } else if (cooldownLeft > 1000) {
        // Long délai (grenade) : on affiche le compte à rebours
        slot.info.textContent = `${Math.ceil(cooldownLeft / 1000)}s`;
        slot.info.style.color = '#f87171';
        slot.progress.style.width = `${100 * (1 - cooldownLeft / def.cooldownMs)}%`;
      } else {
        slot.info.textContent = state.magazineSize !== undefined ? `${state.ammo} / ${state.magazineSize}` : 'PRÊT';
        slot.info.style.color = state.ammo === 0 ? '#f87171' : '#fbbf24';
        slot.progress.style.width = '0%';
      }
    });
  };

  const addDamageNumber = (x: number, y: number, damage: number, color = '#fca5a5') => {
    damageNumbers.push({ x: x + (Math.random() - 0.5) * 10, y, text: `-${damage}`, at: Date.now(), color });
  };

  /** Position monde d'un joueur (local ou distant) à partir de son ID */
  const getPlayerRenderInfo = (id: string) => {
    if (id === networkManager.localPlayerId) {
      return { x: player.x, y: player.y, prop: player.currentProp, variantIndex: player.variantIndex };
    }
    const op = otherPlayers.get(id);
    return op ? { x: op.x, y: op.y, prop: op.currentProp, variantIndex: op.variantIndex ?? 0 } : null;
  };

  // =========================================================================
  // MODE SPECTATEUR (activé quand le joueur local meurt, jusqu'à la fin de la manche)
  // =========================================================================
  const deathOverlay = document.getElementById('death-overlay');
  const deathOverlayKiller = document.getElementById('death-overlay-killer');
  const deathOverlayProp = document.getElementById('death-overlay-prop');
  const spectatorHud = document.getElementById('spectator-hud');
  const spectatorTargetEl = document.getElementById('spectator-target');
  const spectatorHelpEl = document.getElementById('spectator-help');

  const DEATH_SCREEN_DURATION = 3000;
  const DEATH_EFFECT_DURATION = 1600;
  const FREE_CAM_SPEED = 8;
  const MIN_SPECTATOR_ZOOM = 0.4;
  const MAX_SPECTATOR_ZOOM = 1.5;

  let isSpectator = false;
  let spectateTargetId: string | null = null;
  let freeCam = false;
  let spectatorZoom = 1;
  const camera = { x: player.x, y: player.y };
  let deathOverlayTimeout: ReturnType<typeof setTimeout> | null = null;

  const spawnDeathEffect = (x: number, y: number, name: string) => {
    const colors = ['#a3a3a3', '#78716c', '#d6d3d1', '#ef4444', '#57534e'];
    const particles = Array.from({ length: 18 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 45;
      return { vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 25, size: 2 + Math.random() * 3, color: colors[Math.floor(Math.random() * colors.length)] };
    });
    deathEffects.push({ x, y, at: Date.now(), name, particles });
  };

  const getAlivePlayerIds = (): string[] => {
    const ids: string[] = [];
    otherPlayers.forEach((op, id) => {
      if (op.role !== PlayerRole.SPECTATOR && op.health > 0) ids.push(id);
    });
    return ids;
  };

  const updateSpectatorHud = () => {
    if (!spectatorHud || !spectatorTargetEl || !spectatorHelpEl) return;
    if (!isSpectator) {
      spectatorHud.style.display = 'none';
      return;
    }
    spectatorHud.style.display = 'flex';
    const target = spectateTargetId ? otherPlayers.get(spectateTargetId) : undefined;
    if (freeCam || !target) {
      spectatorTargetEl.innerText = 'Caméra libre';
      spectatorHelpEl.innerText = getAlivePlayerIds().length > 0
        ? 'ZQSD : déplacer | Molette : zoom | Espace / Clic : suivre un joueur'
        : 'ZQSD : déplacer | Molette : zoom | Aucun joueur en vie à suivre';
    } else {
      const roleTag = target.role === PlayerRole.HUNTER ? 'Chasseur' : (target.currentProp?.displayName ?? 'Prop');
      spectatorTargetEl.innerText = `Vous suivez : ${target.name || 'Joueur'} (${roleTag})`;
      spectatorHelpEl.innerText = '← / → ou Clic G / D : changer de joueur | Espace : caméra libre | Molette : zoom';
    }
  };

  const cycleSpectateTarget = (direction: 1 | -1) => {
    const next = getNextSpectateTarget(getAlivePlayerIds(), spectateTargetId, direction);
    spectateTargetId = next;
    freeCam = next === null;
    updateSpectatorHud();
  };

  const enterSpectatorMode = (death?: PlayerDiedPayload) => {
    if (isSpectator) return;
    isSpectator = true;
    freeCam = false;
    spectatorZoom = 1;
    camera.x = player.x;
    camera.y = player.y;
    player.health = 0;
    if (transformationWheel.getIsOpen()) transformationWheel.toggle();
    Object.keys(keys).forEach(k => { keys[k] = false; });
    updateWeaponHud();
    updateWsStatus();

    if (deathOverlay) {
      if (deathOverlayKiller) {
        deathOverlayKiller.innerText = death?.killerName ? `Éliminé par ${death.killerName}` : 'Vous avez été éliminé';
      }
      if (deathOverlayProp) {
        deathOverlayProp.innerText = death?.propDisplayName ? `Vous étiez caché en : ${death.propDisplayName}` : '';
      }
      deathOverlay.style.display = 'flex';
      deathOverlay.style.opacity = '1';
      if (deathOverlayTimeout) clearTimeout(deathOverlayTimeout);
      deathOverlayTimeout = setTimeout(() => {
        deathOverlay.style.opacity = '0';
        deathOverlayTimeout = setTimeout(() => { deathOverlay.style.display = 'none'; }, 600);
      }, DEATH_SCREEN_DURATION);
    }

    // On commence par suivre le tueur s'il est encore en vie
    const killer = death?.killerId ? otherPlayers.get(death.killerId) : undefined;
    if (death?.killerId && killer && killer.role !== PlayerRole.SPECTATOR && killer.health > 0) {
      spectateTargetId = death.killerId;
      updateSpectatorHud();
    } else {
      spectateTargetId = null;
      cycleSpectateTarget(1);
    }
  };

  /** Fin de manche / nouvelle manche : on redevient un joueur normal */
  const exitSpectatorMode = () => {
    if (deathOverlayTimeout) clearTimeout(deathOverlayTimeout);
    if (deathOverlay) deathOverlay.style.display = 'none';
    isSpectator = false;
    spectateTargetId = null;
    freeCam = false;
    updateSpectatorHud();
    updateWsStatus();
  };

  // Connexion via le NetworkManager partagé
  const updateWsStatus = () => {
    if (!wsStatus) return;
    if (networkManager.isConnected) {
      if (isSpectator) {
        wsStatus.innerText = 'WS: Connecté | Mode spectateur';
      } else if (localPlayerRole === PlayerRole.HUNTER) {
        wsStatus.innerText = 'WS: Connecté | Clic: Attaquer | 1/2/3 ou Molette: Arme | R: Recharger';
      } else {
        wsStatus.innerText = 'WS: Connecté | E: Changer Prop | R: Tourner Prop | K: Dégâts (-15)';
      }
      wsStatus.style.color = '#4ade80';
    } else {
      wsStatus.innerText = 'WS: Déconnecté';
      wsStatus.style.color = '#f87171';
    }
  };
  networkManager.onOpen(updateWsStatus);
  networkManager.onClose(updateWsStatus);
  updateWsStatus();

  networkManager.on(MessageType.CHAT_MESSAGE, (payload) => {
    chatManager.addMessage(payload as ChatMessagePayload);
  });

  networkManager.on<HitboxTogglePayload>(MessageType.HITBOX_TOGGLE, (payload) => {
    showHitbox = payload?.enabled !== undefined ? payload.enabled : !showHitbox;
  });

  networkManager.on<KickedPayload>(MessageType.KICKED, (payload) => {
    if (!viewGame?.classList.contains('active')) return;
    setPauseMenuOpen(false);
    setFullMapOpen(false);
    showHitbox = false;
    hunterDrones.clear();
    chatManager.close();
    chatManager.clearMessages();
    musicManager.stop();
    exitSpectatorMode();
    if (roundEndOverlay) roundEndOverlay.style.display = 'none';
    if (hunterBlindfold) hunterBlindfold.style.display = 'none';
    switchView(viewGame, viewMain);
    alert(payload.reason || "Vous avez été expulsé de la partie par l'hôte.");
  });

  networkManager.on(MessageType.WELCOME, (payload) => {
    if (payload.player?.name) {
      localPlayerName = payload.player.name;
    }
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
      variantIndex: ('variantIndex' in newP && newP.variantIndex !== undefined) ? newP.variantIndex : 0,
      role: newP.role
    });
    console.log('[WS] Nouveau joueur rejoint :', newP.id);
  });

  networkManager.on(MessageType.PLAYER_LEFT, (payload) => {
    otherPlayers.delete(payload.playerId);
    hunterAim.delete(payload.playerId);
    hunterDrones.delete(payload.playerId);
    console.log('[WS] Joueur déconnecté :', payload.playerId);
    if (isSpectator && payload.playerId === spectateTargetId) cycleSpectateTarget(1);
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
        vfx.spawnTransformPoof(player.x, player.y);
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
        vfx.spawnTransformPoof(op.x, op.y);
      }
    }
  });

  networkManager.on<PlayerHitPayload & { playerId?: string }>(MessageType.PLAYER_HIT, (payload) => {
    const targetId = payload.targetPlayerId || payload.playerId;
    const hitTime = payload.lastHitTimestamp || Date.now();
    const victim = targetId ? getPlayerRenderInfo(targetId) : null;
    if (victim) {
      const box = getPlayerHurtbox(victim.x, victim.y, victim.prop, victim.variantIndex);
      addDamageNumber(victim.x, box.y - 4, payload.damage, targetId === networkManager.localPlayerId ? '#f87171' : '#fde68a');
    }
    if (targetId === networkManager.localPlayerId) {
      player.lastHitTimestamp = hitTime;
      vfx.triggerDamageFlash();
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
        if (p.name) localPlayerName = p.name;
        if (p.role === PlayerRole.SPECTATOR && !isSpectator && currentPhase !== GamePhase.LOBBY) {
          enterSpectatorMode();
        } else if (p.role !== PlayerRole.SPECTATOR) {
          if (isSpectator) {
            exitSpectatorMode();
          }
          if (p.role !== localPlayerRole) {
            localPlayerRole = p.role;
            updateWeaponHud();
            updateWsStatus();
            if (hunterBlindfold) {
              hunterBlindfold.style.display =
                (currentPhase === GamePhase.HIDING && localPlayerRole === PlayerRole.HUNTER) ? 'flex' : 'none';
            }
          }
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
    // Nettoyage des joueurs qui ne sont plus dans le state
    otherPlayers.forEach((_, id) => {
      if (!currentIds.has(id)) otherPlayers.delete(id);
    });
    // Le joueur suivi a disparu ou est mort entre deux messages : on change de cible
    if (isSpectator && !freeCam) {
      const target = spectateTargetId ? otherPlayers.get(spectateTargetId) : undefined;
      if (!target || target.role === PlayerRole.SPECTATOR || target.health <= 0) cycleSpectateTarget(1);
    }
  });

  // --- COMBAT : résultats calculés par le serveur ---
  networkManager.on<WeaponStatePayload>(MessageType.WEAPON_STATE, (payload) => {
    const now = Date.now();
    payload.weapons.forEach(w => {
      weaponView.set(w.weapon, {
        ammo: w.ammo,
        magazineSize: w.magazineSize,
        cooldownEndsAt: now + w.cooldownRemainingMs,
        reloadEndsAt: now + w.reloadRemainingMs
      });
    });
    updateWeaponHud();
  });

  networkManager.on<ShotFiredPayload>(MessageType.HUNTER_SHOOT, (payload) => {
    const now = Date.now();
    const dronePos = getDroneOrigin(payload.hunterId, payload.originX, payload.originY);
    const angle = Math.atan2(payload.impactY - dronePos.y, payload.impactX - dronePos.x);
    const readyAt = now + WEAPONS[payload.weapon].cooldownMs;
    hunterAim.set(payload.hunterId, { angle, weapon: payload.weapon, readyAt });

    const drone = hunterDrones.get(payload.hunterId);
    if (drone) drone.recoil = 3.5;

    const muzzle = getDroneMuzzle(dronePos.x, dronePos.y, angle, payload.weapon);
    const hit = payload.hitPlayerIds.length > 0;
    if (hit && payload.hunterId === networkManager.localPlayerId) hitMarkerAt = now;

    if (payload.weapon === WeaponType.PISTOL) {
      tracers.push({ x1: muzzle.x, y1: muzzle.y, x2: payload.impactX, y2: payload.impactY, hit, at: now });
    } else if (payload.weapon === WeaponType.CROWBAR) {
      swings.push({ x: muzzle.x, y: muzzle.y, angle, hit, at: now });
    } else if (payload.weapon === WeaponType.GRENADE) {
      grenades.push({
        id: payload.grenadeId ?? `${payload.hunterId}-${now}`,
        x1: muzzle.x, y1: muzzle.y, x2: payload.impactX, y2: payload.impactY,
        at: now, fuseMs: payload.fuseMs ?? 1200
      });
    }
  });

  networkManager.on<GrenadeExplodedPayload>(MessageType.GRENADE_EXPLODED, (payload) => {
    const idx = grenades.findIndex(g => g.id === payload.grenadeId);
    if (idx >= 0) grenades.splice(idx, 1);
    explosions.push({ x: payload.x, y: payload.y, radius: payload.radius, at: Date.now() });
    const dist = Math.hypot(payload.x - view.camX, payload.y - view.camY);
    if (dist < 400) screenShake = Math.max(screenShake, 6 * (1 - dist / 400));
    if (payload.hitPlayerIds.length > 0 && payload.hunterId === networkManager.localPlayerId) hitMarkerAt = Date.now();
  });

  networkManager.on<PlayerDiedPayload>(MessageType.PLAYER_DIED, (payload) => {
    spawnDeathEffect(payload.x, payload.y, payload.playerName);
    hunterDrones.delete(payload.playerId);
    console.log(`[MORT] ${payload.playerName} est mort${payload.killerName ? ` (tué par ${payload.killerName})` : ''}`);
    if (payload.playerId === networkManager.localPlayerId) {
      enterSpectatorMode(payload);
    } else {
      const op = otherPlayers.get(payload.playerId);
      if (op) {
        op.role = PlayerRole.SPECTATOR;
        op.health = 0;
      }
      if (isSpectator && payload.playerId === spectateTargetId) {
        cycleSpectateTarget(1);
      } else if (isSpectator) {
        updateSpectatorHud();
      }
    }
  });

  // --- RÉCEPTION DES ÉVÉNEMENTS DE ROUND ---
  networkManager.on<RoundStartPayload>(MessageType.ROUND_START, (payload) => {
    localPlayerRole = payload.role;
    currentPhase = GamePhase.HIDING;
    exitSpectatorMode();
    resetWeaponView();
    selectWeapon(WeaponType.PISTOL);
    hunterAim.clear();
    hunterDrones.clear();
    grenades.length = 0;
    updateWsStatus();

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

    if (previousPhase !== currentPhase) {
      updateWeaponHud();
      if (currentPhase === GamePhase.LOBBY) exitSpectatorMode();
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
    updateWeaponHud();
    grenades.length = 0;

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

  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, (payload) => {
    if (payload.roomKey?.startsWith('FREEPLAY-')) {
      localPlayerRole = PlayerRole.PROP;
      currentPhase = GamePhase.LOBBY;
      if (hunterBlindfold) hunterBlindfold.style.display = 'none';
      if (roundEndOverlay) roundEndOverlay.style.display = 'none';
      if (gamePhaseBadge) {
        gamePhaseBadge.textContent = 'MODE FREEPLAY';
        gamePhaseBadge.style.color = '#38bdf8';
      }
      if (gameTimer) gameTimer.textContent = '∞';
      if (gameRoleBadge) {
        gameRoleBadge.textContent = 'RÔLE : PROP (LIBRE)';
        gameRoleBadge.style.color = '#c084fc';
      }
      return;
    }

    if (currentPhase === GamePhase.ROUND_END) {
      currentPhase = GamePhase.LOBBY;
      exitSpectatorMode();
      updateWeaponHud();
      if (roundEndOverlay) roundEndOverlay.style.display = 'none';
      if (viewGame && viewLobby) {
        switchView(viewGame, viewLobby);
      }
    }
  });

  // Gestion des inputs (Z, Q, S, D, et flèches)
  const keys: { [key: string]: boolean } = {};

  window.addEventListener('keydown', (e) => {
    if (chatManager.getIsOpen()) {
      return;
    }

    if (e.key === 'Escape' && isFullMapOpen) {
      setFullMapOpen(false);
      return;
    }

    // 1. Si la roue de transformation est ouverte, elle capture les touches en priorité
    if (transformationWheel.getIsOpen()) {
      const handled = transformationWheel.handleKeyDown(e);
      if (handled) {
        e.preventDefault();
        return;
      }
    }

    if (e.key === 'Escape' && viewGame?.classList.contains('active')) {
      setPauseMenuOpen(!isPauseMenuOpen);
      return;
    }

    if (e.key.toLowerCase() === 't' && viewGame?.classList.contains('active') && !isPauseMenuOpen && !isFullMapOpen) {
      e.preventDefault();
      Object.keys(keys).forEach(k => { keys[k] = false; });
      chatManager.open();
      return;
    }

    keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === 'm' && viewGame?.classList.contains('active')) {
      musicManager.toggleMute();
    }

    // Mode spectateur : on ne contrôle plus que la caméra
    if (isSpectator) {
      if (!viewGame?.classList.contains('active')) return;
      if (e.key === 'ArrowRight') cycleSpectateTarget(1);
      if (e.key === 'ArrowLeft') cycleSpectateTarget(-1);
      if (e.key === ' ') {
        e.preventDefault();
        if (freeCam) {
          cycleSpectateTarget(1);
        } else {
          freeCam = true;
          updateSpectatorHud();
        }
      }
      return;
    }

    // Chasseur : sélection d'arme (1/2/3) et rechargement (R)
    if (localPlayerRole === PlayerRole.HUNTER) {
      const slotWeapon = WEAPON_ORDER.find(type => String(WEAPONS[type].slot) === e.key);
      if (slotWeapon) {
        selectWeapon(slotWeapon);
        return;
      }
      if (e.key.toLowerCase() === 'r') {
        requestReload();
        return;
      }
    }

    // Touche 'E' : Ouvrir / Fermer la roue de transformation des Props
    if (e.key.toLowerCase() === 'e' && localPlayerRole === PlayerRole.PROP) {
      transformationWheel.toggle(player.currentProp.id);
      return;
    }
    // Touche 'R' : Tourner le prop actuel (boucler sur ses variantes d'orientation)
    if (e.key.toLowerCase() === 'r' && localPlayerRole === PlayerRole.PROP) {
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

  // Événements souris / molette pour la roue de transformation
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.inside = true;
    if (transformationWheel.getIsOpen()) {
      transformationWheel.handleMouseMove(e.clientX, e.clientY, canvas);
    }
  });

  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (transformationWheel.getIsOpen()) {
      const handled = transformationWheel.handleClick(e.clientX, e.clientY, canvas);
      if (handled) e.stopPropagation();
      return;
    }
    if (isSpectator) {
      if (e.button === 0) cycleSpectateTarget(1);
      if (e.button === 2) cycleSpectateTarget(-1);
      return;
    }
    if (e.button === 0 && localPlayerRole === PlayerRole.HUNTER) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      tryAttack();
    }
  });

  canvas.addEventListener('contextmenu', (e) => {
    if (isSpectator || localPlayerRole === PlayerRole.HUNTER) e.preventDefault();
  });

  canvas.addEventListener('wheel', (e) => {
    if (transformationWheel.getIsOpen()) {
      const handled = transformationWheel.handleWheel(e);
      if (handled) e.preventDefault();
      return;
    }
    if (isSpectator) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      spectatorZoom = Math.max(MIN_SPECTATOR_ZOOM, Math.min(MAX_SPECTATOR_ZOOM, spectatorZoom * factor));
      return;
    }
    if (localPlayerRole === PlayerRole.HUNTER) {
      e.preventDefault();
      cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }
  }, { passive: false });

  let lastVx = 0;
  let lastVy = 0;
  const VISION_RADIUS = 200; // Rayon de vision visible autour du joueur

  /**
   * Dessine le drone accompagnant du chasseur et son module d'arme superposé (sprites 32x32, arme orientée à droite par défaut).
   */
  const drawHunterDrone = (
    dx: number,
    dy: number,
    baseY: number,
    angle: number,
    weapon: WeaponType,
    ready: boolean,
    recoil: number
  ) => {
    ctx!.save();

    // 1. Ombre portée au sol sous le drone
    ctx!.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx!.beginPath();
    ctx!.ellipse(dx, baseY + 18, 9, 4, 0, 0, Math.PI * 2);
    ctx!.fill();

    // 2. Corps du drone (prêt vs en rechargement/cooldown)
    ctx!.translate(dx, dy);
    ctx!.imageSmoothingEnabled = false;
    const droneImg = ready ? droneReadyImg : droneReloadingImg;
    if (droneImg.complete && droneImg.naturalWidth > 0) {
      ctx!.drawImage(droneImg, -16, -16, 32, 32);
    } else {
      ctx!.fillStyle = ready ? '#f97316' : '#38bdf8';
      ctx!.beginPath();
      ctx!.arc(0, 0, 8, 0, Math.PI * 2);
      ctx!.fill();
    }

    // 3. Arme branchée au centre du drone, tournée vers le curseur
    ctx!.rotate(angle);
    if (Math.abs(angle) > Math.PI / 2) {
      ctx!.scale(1, -1);
    }
    if (recoil > 0) {
      ctx!.translate(-recoil, 0);
    }

    const weaponImg = weaponImages.get(weapon);
    if (weaponImg && weaponImg.complete && weaponImg.naturalWidth > 0) {
      ctx!.drawImage(weaponImg, -16, -16, 32, 32);
    }
    ctx!.restore();
  };

  const drawCombatWorld = () => {
    const now = Date.now();

    // A. Drones accompagnants + armes orientées et prévisualisations de portée
    if (isLocalHunterArmed() && networkManager.localPlayerId) {
      const localDrone = hunterDrones.get(networkManager.localPlayerId);
      const dx = localDrone ? localDrone.x : player.x - 14;
      const dy = localDrone ? localDrone.drawY : player.y - 22;
      const baseY = localDrone ? localDrone.y : dy;
      const recoil = localDrone ? localDrone.recoil : 0;

      const aim = screenToWorld(mouse.x, mouse.y);
      const aimDist = Math.hypot(aim.x - dx, aim.y - dy);
      const angle = aimDist > 0.5 ? Math.atan2(aim.y - dy, aim.x - dx) : 0;
      const ready = isWeaponReady(selectedWeapon, now);

      // Prévisualisation des tirs et portées par rapport au drone (uniquement en chasse)
      if (mouse.inside && currentPhase === GamePhase.HUNTING) {
        const muzzle = getDroneMuzzle(dx, dy, angle, selectedWeapon);
        const serverOx = player.x;
        const serverOy = player.y - HOLD_OFFSET_Y;
        ctx!.save();

        if (selectedWeapon === WeaponType.PISTOL) {
          const def = WEAPONS[WeaponType.PISTOL];
          const cursorDistFromOrigin = Math.hypot(aim.x - serverOx, aim.y - serverOy);
          const dirX = cursorDistFromOrigin > 0 ? (aim.x - serverOx) / cursorDistFromOrigin : Math.cos(angle);
          const dirY = cursorDistFromOrigin > 0 ? (aim.y - serverOy) / cursorDistFromOrigin : Math.sin(angle);
          const clampedDist = Math.min(def.range, cursorDistFromOrigin);
          const endX = serverOx + dirX * clampedDist;
          const endY = serverOy + dirY * clampedDist;

          ctx!.setLineDash([4, 4]);
          ctx!.strokeStyle = ready ? 'rgba(251, 191, 36, 0.55)' : 'rgba(148, 163, 184, 0.35)';
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(muzzle.x, muzzle.y);
          ctx!.lineTo(endX, endY);
          ctx!.stroke();
        } else if (selectedWeapon === WeaponType.GRENADE) {
          const def = WEAPONS[WeaponType.GRENADE];
          const cursorDistFromOrigin = Math.hypot(aim.x - serverOx, aim.y - serverOy);
          const travel = Math.min(def.range, cursorDistFromOrigin);
          const dirX = cursorDistFromOrigin > 0 ? (aim.x - serverOx) / cursorDistFromOrigin : Math.cos(angle);
          const dirY = cursorDistFromOrigin > 0 ? (aim.y - serverOy) / cursorDistFromOrigin : Math.sin(angle);
          const lx = serverOx + dirX * travel;
          const ly = serverOy + dirY * travel;

          ctx!.setLineDash([4, 4]);
          ctx!.strokeStyle = ready ? 'rgba(251, 191, 36, 0.8)' : 'rgba(148, 163, 184, 0.45)';
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.arc(lx, ly, def.blastRadius ?? 80, 0, Math.PI * 2);
          ctx!.stroke();
          ctx!.beginPath();
          ctx!.moveTo(muzzle.x, muzzle.y);
          ctx!.lineTo(lx, ly);
          ctx!.stroke();
        } else if (selectedWeapon === WeaponType.CROWBAR) {
          const def = WEAPONS[WeaponType.CROWBAR];
          const half = ((def.arcDegrees ?? 100) * Math.PI) / 360;
          ctx!.fillStyle = ready ? 'rgba(239, 68, 68, 0.14)' : 'rgba(148, 163, 184, 0.1)';
          ctx!.strokeStyle = ready ? 'rgba(239, 68, 68, 0.45)' : 'rgba(148, 163, 184, 0.3)';
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(dx, dy);
          ctx!.arc(dx, dy, def.range, angle - half, angle + half);
          ctx!.closePath();
          ctx!.fill();
          ctx!.beginPath();
          ctx!.arc(dx, dy, def.range, angle - half, angle + half);
          ctx!.stroke();
        }
        ctx!.restore();
      }

      drawHunterDrone(dx, dy, baseY, angle, selectedWeapon, ready, recoil);
    }

    otherPlayers.forEach((op, id) => {
      if (op.role !== PlayerRole.HUNTER || op.health <= 0) return;
      const aim = hunterAim.get(id) ?? { angle: 0, weapon: WeaponType.PISTOL, readyAt: 0 };
      const drone = hunterDrones.get(id);
      const dx = drone ? drone.x : op.x - 14;
      const dy = drone ? drone.drawY : op.y - 22;
      const baseY = drone ? drone.y : dy;
      const recoil = drone ? drone.recoil : 0;
      const ready = now >= aim.readyAt;
      drawHunterDrone(dx, dy, baseY, aim.angle, aim.weapon, ready, recoil);
    });

    // B. Traînées de balles du fusil
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      const life = (now - t.at) / 260;
      if (life >= 1) { tracers.splice(i, 1); continue; }
      ctx!.save();
      ctx!.globalAlpha = 1 - life;
      ctx!.strokeStyle = '#fde68a';
      ctx!.lineWidth = 1.5;
      ctx!.beginPath();
      ctx!.moveTo(t.x1, t.y1);
      ctx!.lineTo(t.x2, t.y2);
      ctx!.stroke();
      // Flash au canon et impact
      ctx!.fillStyle = '#fbbf24';
      ctx!.beginPath();
      ctx!.arc(t.x1, t.y1, 4 * (1 - life), 0, Math.PI * 2);
      ctx!.fill();
      ctx!.fillStyle = t.hit ? '#ef4444' : '#a3a3a3';
      ctx!.beginPath();
      ctx!.arc(t.x2, t.y2, 3 + life * 4, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();
    }

    // C. Onde rouge en arc de cercle qui se propage (Canon à ondes / KAK)
    for (let i = swings.length - 1; i >= 0; i--) {
      const sw = swings[i];
      const life = (now - sw.at) / 260;
      if (life >= 1) { swings.splice(i, 1); continue; }
      const def = WEAPONS[WeaponType.CROWBAR];
      const maxR = def.range;
      const half = ((def.arcDegrees ?? 100) * Math.PI) / 360;
      const start = sw.angle - half;
      const end = sw.angle + half;

      ctx!.save();
      // Halo du cône qui se dissipe
      const coneR = 10 + (maxR - 10) * Math.min(1, life * 1.15);
      ctx!.fillStyle = `rgba(239, 68, 68, ${0.16 * (1 - life)})`;
      ctx!.beginPath();
      ctx!.moveTo(sw.x, sw.y);
      ctx!.arc(sw.x, sw.y, coneR, start, end);
      ctx!.closePath();
      ctx!.fill();

      // 3 arcs d'onde concentriques rouges en propagation
      const waveOffsets = [0, 0.22, 0.44];
      waveOffsets.forEach((off, idx) => {
        if (life <= off) return;
        const p = Math.min(1, (life - off) / (1 - off));
        const r = 8 + (maxR - 8) * p;
        ctx!.globalAlpha = (1 - p) * (idx === 0 ? 0.95 : 0.7);
        ctx!.strokeStyle = idx === 0 ? '#ef4444' : '#fca5a5';
        ctx!.lineWidth = idx === 0 ? 3.2 : 2;
        ctx!.beginPath();
        ctx!.arc(sw.x, sw.y, r, start, end);
        ctx!.stroke();
      });
      ctx!.restore();
    }

    // D. Grenades en vol puis au sol (clignotement avant explosion)
    for (let i = grenades.length - 1; i >= 0; i--) {
      const g = grenades[i];
      const elapsed = now - g.at;
      if (elapsed > g.fuseMs + 1000) { grenades.splice(i, 1); continue; } // Sécurité si l'explosion est perdue
      const flight = Math.min(1, elapsed / 350);
      const gx = g.x1 + (g.x2 - g.x1) * flight;
      const gy = g.y1 + (g.y2 - g.y1) * flight - Math.sin(flight * Math.PI) * 24; // Petite parabole
      ctx!.save();
      if (flight >= 1) {
        const blink = Math.floor(elapsed / Math.max(60, 200 - elapsed / 8)) % 2 === 0;
        ctx!.fillStyle = blink ? 'rgba(239, 68, 68, 0.25)' : 'rgba(239, 68, 68, 0.08)';
        ctx!.beginPath();
        ctx!.arc(g.x2, g.y2, WEAPONS[WeaponType.GRENADE].blastRadius ?? 80, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.fillStyle = '#3f6212';
      ctx!.strokeStyle = '#1a2e05';
      ctx!.lineWidth = 1;
      ctx!.beginPath();
      ctx!.arc(gx, gy, 4, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.stroke();
      ctx!.restore();
    }

    // E. Explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
      const ex = explosions[i];
      const life = (now - ex.at) / 600;
      if (life >= 1) { explosions.splice(i, 1); continue; }
      ctx!.save();
      const r = ex.radius * (0.3 + 0.7 * Math.min(1, life * 2.5));
      const gradient = ctx!.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, r);
      gradient.addColorStop(0, `rgba(255, 237, 160, ${0.9 * (1 - life)})`);
      gradient.addColorStop(0.4, `rgba(251, 146, 60, ${0.75 * (1 - life)})`);
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx!.fillStyle = gradient;
      ctx!.beginPath();
      ctx!.arc(ex.x, ex.y, r, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.strokeStyle = `rgba(255, 255, 255, ${0.6 * (1 - life)})`;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.arc(ex.x, ex.y, ex.radius * life, 0, Math.PI * 2);
      ctx!.stroke();
      ctx!.restore();
    }

    // F. Effets de mort (débris + nom qui s'envole)
    for (let i = deathEffects.length - 1; i >= 0; i--) {
      const fx = deathEffects[i];
      const elapsed = now - fx.at;
      if (elapsed > DEATH_EFFECT_DURATION) { deathEffects.splice(i, 1); continue; }
      const t = elapsed / 1000;
      const progress = elapsed / DEATH_EFFECT_DURATION;
      ctx!.save();
      ctx!.globalAlpha = 1 - progress;
      ctx!.beginPath();
      ctx!.arc(fx.x, fx.y, 6 + progress * 34, 0, Math.PI * 2);
      ctx!.strokeStyle = '#ef4444';
      ctx!.lineWidth = 2 * (1 - progress) + 0.5;
      ctx!.stroke();
      fx.particles.forEach(pt => {
        const px = fx.x + pt.vx * t;
        const py = fx.y + pt.vy * t + 40 * t * t;
        ctx!.fillStyle = pt.color;
        ctx!.fillRect(px - pt.size / 2, py - pt.size / 2, pt.size, pt.size);
      });
      ctx!.font = 'bold 10px monospace';
      ctx!.textAlign = 'center';
      ctx!.lineWidth = 3;
      ctx!.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      const textY = fx.y - 30 - progress * 20;
      ctx!.strokeText(`✝ ${fx.name}`, fx.x, textY);
      ctx!.fillStyle = '#fca5a5';
      ctx!.fillText(`✝ ${fx.name}`, fx.x, textY);
      ctx!.restore();
    }

    // G. Chiffres de dégâts
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      const life = (now - dn.at) / 900;
      if (life >= 1) { damageNumbers.splice(i, 1); continue; }
      ctx!.save();
      ctx!.globalAlpha = 1 - life * life;
      ctx!.font = 'bold 11px monospace';
      ctx!.textAlign = 'center';
      ctx!.lineWidth = 3;
      ctx!.strokeStyle = 'rgba(0, 0, 0, 0.9)';
      const y = dn.y - life * 22;
      ctx!.strokeText(dn.text, dn.x, y);
      ctx!.fillStyle = dn.color;
      ctx!.fillText(dn.text, dn.x, y);
      ctx!.restore();
    }
  };

  /** Réticule à la souris, avec indicateur de touche (hit marker) */
  const drawCrosshair = () => {
    if (!isLocalHunterArmed() || !mouse.inside || transformationWheel.getIsOpen()) return;
    if (currentPhase !== GamePhase.HUNTING && currentPhase !== GamePhase.HIDING) return;
    const now = Date.now();
    const ready = currentPhase === GamePhase.HUNTING && isWeaponReady(selectedWeapon, now);
    const color = ready ? '#ffffff' : 'rgba(148, 163, 184, 0.7)';
    const { x, y } = mouse;
    ctx!.save();
    ctx!.strokeStyle = color;
    ctx!.lineWidth = 2;
    ctx!.beginPath();
    ctx!.moveTo(x - 12, y); ctx!.lineTo(x - 4, y);
    ctx!.moveTo(x + 4, y); ctx!.lineTo(x + 12, y);
    ctx!.moveTo(x, y - 12); ctx!.lineTo(x, y - 4);
    ctx!.moveTo(x, y + 4); ctx!.lineTo(x, y + 12);
    ctx!.stroke();

    // Rechargement : cercle de progression autour du réticule
    const pistol = weaponView.get(WeaponType.PISTOL);
    if (selectedWeapon === WeaponType.PISTOL && pistol && now < pistol.reloadEndsAt) {
      const ratio = 1 - (pistol.reloadEndsAt - now) / (WEAPONS[WeaponType.PISTOL].reloadMs ?? 1);
      ctx!.strokeStyle = '#38bdf8';
      ctx!.beginPath();
      ctx!.arc(x, y, 16, -Math.PI / 2, -Math.PI / 2 + ratio * Math.PI * 2);
      ctx!.stroke();
    }

    // Hit marker : petite croix rouge en X quand le serveur confirme une touche
    if (now - hitMarkerAt < 200) {
      ctx!.strokeStyle = '#ef4444';
      ctx!.beginPath();
      ctx!.moveTo(x - 9, y - 9); ctx!.lineTo(x - 4, y - 4);
      ctx!.moveTo(x + 9, y - 9); ctx!.lineTo(x + 4, y - 4);
      ctx!.moveTo(x - 9, y + 9); ctx!.lineTo(x - 4, y + 4);
      ctx!.moveTo(x + 9, y + 9); ctx!.lineTo(x + 4, y + 4);
      ctx!.stroke();
    }
    ctx!.restore();
  };

  // Boucle de jeu (Game Loop)
  function gameLoop() {
    if (viewGame?.classList.contains('active')) {
      let vx = 0;
      let vy = 0;
      // Input Handler (Intention) - gelé pendant que la roue ou le chat est ouvert
      if (!transformationWheel.getIsOpen() && !chatManager.getIsOpen()) {
        if (keys['z'] || keys['arrowup']) { vy -= 1; }
        if (keys['s'] || keys['arrowdown']) { vy += 1; }
        if (keys['q'] || keys['arrowleft']) { vx -= 1; }
        if (keys['d'] || keys['arrowright']) { vx += 1; }
      }

      // Envoi de la vélocité brute (non normalisée) via WebSocket
      // La normalisation diagonale se fera sur le serveur !

      // En spectateur, ZQSD pilote la caméra libre et n'est plus envoyé au serveur
      if (isSpectator) {
        if (freeCam) {
          const len = Math.hypot(vx, vy) || 1;
          camera.x += (vx / len) * FREE_CAM_SPEED / spectatorZoom;
          camera.y += (vy / len) * FREE_CAM_SPEED / spectatorZoom;
        }
        vx = 0;
        vy = 0;
      }

      // Envoi de la vélocité via WebSocket (uniquement si l'intention change)
      if (!isSpectator && (vx !== lastVx || vy !== lastVy) && networkManager.localPlayerId) {
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

      // Interpolation visuelle (Lerp) + mise à jour des drones accompagnants
      const nowDrone = Date.now();
      const activeHunterIds = new Set<string>();
      const lerpFactor = 0.3;
      player.x += (player.targetX - player.x) * lerpFactor;
      player.y += (player.targetY - player.y) * lerpFactor;

      if (isLocalHunterArmed() && networkManager.localPlayerId) {
        activeHunterIds.add(networkManager.localPlayerId);
        updateHunterDrone(networkManager.localPlayerId, player.x, player.y, vx, vy, nowDrone);
      }

      otherPlayers.forEach((op, id) => {
        const dx = op.targetX - op.x;
        const dy = op.targetY - op.y;
        op.x += dx * lerpFactor;
        op.y += dy * lerpFactor;
        if (op.role === PlayerRole.HUNTER && op.health > 0) {
          activeHunterIds.add(id);
          updateHunterDrone(id, op.x, op.y, dx, dy, nowDrone);
        }
      });

      hunterDrones.forEach((_, id) => {
        if (!activeHunterIds.has(id)) hunterDrones.delete(id);
      });

      // Rendu Canvas
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
      ctx!.save();
import { DEFAULT_PROPS, MessageType, type PropDefinition } from '@prop-hunt/shared';
import { createGameState, VISION_RADIUS, type GameState } from '../game/state';
import { loadPropImages, loadWeaponImages } from '../game/assets';
import { MapRenderer } from '../game/map/mapRenderer';
import { collectCharacters, drawCharacter } from '../game/render/characterRenderer';
import { CombatEffects } from '../game/combat/combatEffects';
import { WeaponController } from '../game/combat/weaponController';
import { drawCrosshair } from '../game/combat/crosshair';
import { SpectatorController } from '../game/spectator/spectatorController';
import { RoundHud } from '../game/ui/roundHud';
import { updateStatusBar } from '../game/ui/statusBar';
import { renderGameView } from '../game/ui/gameTemplate';
import { registerGameNetworkHandlers } from '../game/network/gameNetwork';
import { readMovementInput, registerGameInput } from '../game/input/gameInput';

/**
 * Écran de jeu. Ce fichier assemble les modules de src/game/ :
 *  - state.ts            : état partagé (joueurs, caméra, souris, phase...)
 *  - map/                : rendu de la carte et transparence des murs / piliers
 *  - render/             : rendu des personnages
 *  - combat/             : armes du chasseur, effets visuels, réticule
 *  - spectator/          : mode spectateur après la mort
 *  - ui/                 : HTML de l'écran, HUD de manche, bandeau de statut
 *  - network/            : réception des messages du serveur
 *  - input/              : clavier et souris
 */
export function renderGame(): string {
    return renderGameView();
}

export function initGame(): void {
    const viewMain = document.getElementById('view-main');
    const viewLobby = document.getElementById('view-lobby');
    const viewGame = document.getElementById('view-game');
    const btnLeaveGame = document.getElementById('btn-leave-game');
    const wsStatus = document.getElementById('ws-status');
    const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

    if (!canvas || !viewGame || !viewMain) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Gestion du retour au menu
    btnLeaveGame?.addEventListener('click', () => {
        networkManager.send(MessageType.LEAVE_ROOM, {});
        switchView(viewGame, viewMain);
    });

    // Redimensionnement du canvas
    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx.imageSmoothingEnabled = false; // Pixel art net
    };
    window.addEventListener('resize', resize);
    resize();

    // --- Ressources et état ---
    const state = createGameState();
    const propImages = loadPropImages();
    const weaponImages = loadWeaponImages();
    const map = new MapRenderer();
    map.load();

    // --- Modules ---
    const transformationWheel = createTransformationWheel(state, propImages);
    const effects = new CombatEffects();
    const weapons = new WeaponController(state, canvas, document.getElementById('weapon-hud'), weaponImages);
    const roundHud = new RoundHud();
    const updateStatus = () => updateStatusBar(wsStatus, state);
    const spectator = new SpectatorController(state, () => {
        // Entrée / sortie du mode spectateur : on ferme la roue et on met à jour l'interface
        if (state.spectator.active && transformationWheel.getIsOpen()) transformationWheel.toggle();
        weapons.updateHud();
        updateStatus();
    });

    registerGameNetworkHandlers({
        state, weapons, effects, spectator, roundHud, updateStatus,
        returnToLobby: (onlyIfInGame) => {
            if (!viewLobby) return;
            if (onlyIfInGame && !viewGame.classList.contains('active')) return;
            switchView(viewGame, viewLobby);
        }
    });
    registerGameInput({ state, canvas, viewGame, transformationWheel, weapons, spectator });

    // --- Boucle de jeu ---
    let lastVx = 0;
    let lastVy = 0;

    /** Entrées, envoi de l'intention de mouvement et interpolation des positions */
    const update = () => {
        const { player } = state;
        // Mouvement gelé pendant que la roue est ouverte
        let { vx, vy } = transformationWheel.getIsOpen() ? { vx: 0, vy: 0 } : readMovementInput(state);

        if (spectator.isActive) {
            // En spectateur, ZQSD pilote la caméra libre et n'est plus envoyé au serveur
            spectator.updateCamera(vx, vy);
            vx = 0;
            vy = 0;
        } else if ((vx !== lastVx || vy !== lastVy) && networkManager.localPlayerId) {
            // Envoi de la vélocité brute uniquement quand l'intention change (le serveur normalise la diagonale)
            networkManager.send(MessageType.PLAYER_MOVE, {
                playerId: networkManager.localPlayerId,
                x: player.x,
                y: player.y,
                vx,
                vy
            });
            lastVx = vx;
            lastVy = vy;
        }

        // Interpolation visuelle (Lerp) pour la fluidité d'affichage (même à 20 ticks/sec !)
        const lerpFactor = 0.3;
        player.x += (player.targetX - player.x) * lerpFactor;
        player.y += (player.targetY - player.y) * lerpFactor;
        state.otherPlayers.forEach((op) => {
            op.x += (op.targetX - op.x) * lerpFactor;
            op.y += (op.targetY - op.y) * lerpFactor;
        });
    };

    /** Rendu d'une image complète */
    const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        applyCamera(ctx, canvas, state);

        // 1. Sol et murs
        map.drawGround(ctx);
        // 2. Personnages triés par profondeur
        const characters = collectCharacters(state);
        characters.forEach(c => drawCharacter(ctx, c, propImages, state.showHitbox));
        // 3. Armes en main, aides à la visée et effets de combat
        weapons.drawHeldWeapons(ctx, effects);
        effects.draw(ctx);
        // 4. Calque "above" (haut des murs / piliers), transparent autour du point de vue (centre du corps)
        map.drawAbove(ctx, state.camera.x, state.camera.y - 16);

        ctx.restore();

        // 5. Interface dessinée sur le canvas (coordonnées écran)
        if (!transformationWheel.getIsOpen()) drawCrosshair(ctx, state, weapons, effects);
        weapons.updateHud();
        if (transformationWheel.getIsOpen()) {
            transformationWheel.setCurrentEquippedPropId(state.player.currentProp.id);
            transformationWheel.render(ctx, canvas.width, canvas.height);
        }
    };

    const gameLoop = () => {
        if (viewGame.classList.contains('active')) {
            update();
            render();
        }
        requestAnimationFrame(gameLoop);
    };
    requestAnimationFrame(gameLoop);
}

/** Place la caméra : centrée sur le joueur local (ou le joueur suivi en spectateur), avec zoom et secousse */
function applyCamera(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, state: GameState): void {
    const { camera, player, spectator } = state;
    if (!spectator.active) {
        camera.x = player.x;
        camera.y = player.y;
      } else if (!freeCam && spectateTargetId) {
        const target = otherPlayers.get(spectateTargetId);
        if (target) {
          camera.x += (target.x - camera.x) * 0.15;
          camera.y += (target.y - camera.y) * 0.15;
        }
      }
      const zoom = (Math.min(canvas.width, canvas.height) / (VISION_RADIUS * 2)) * (isSpectator ? spectatorZoom : 1);
      // Petite secousse d'écran lors des explosions proches
      const shakeX = screenShake > 0.1 ? (Math.random() - 0.5) * screenShake : 0;
      const shakeY = screenShake > 0.1 ? (Math.random() - 0.5) * screenShake : 0;
      screenShake *= 0.88;
      view.camX = camera.x;
      view.camY = camera.y;
      view.zoom = zoom;
      ctx!.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
      ctx!.scale(zoom, zoom);
      ctx!.translate(-camera.x, -camera.y);

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

      const charactersToDraw: RenderableCharacter[] = [];
      // Le joueur local n'est plus dessiné une fois mort
      if (!isSpectator) charactersToDraw.push(
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
          label: localPlayerRole === PlayerRole.HUNTER ? 'Moi : Chasseur' : `Moi : ${player.currentProp.displayName}`
        }
      );

      otherPlayers.forEach((op, id) => {
        if (op.role === PlayerRole.SPECTATOR) return; // Les morts sont invisibles
        const isSpectated = isSpectator && !freeCam && id === spectateTargetId;
        const propToDraw = op.currentProp || DEFAULT_PROPS[0];
        charactersToDraw.push({
          x: op.x,
          y: op.y,
          prop: propToDraw,
          variantIndex: op.variantIndex ?? 0,
          health: op.health ?? propToDraw.health,
          maxHealth: op.maxHealth ?? propToDraw.health,
          lastHitTimestamp: op.lastHitTimestamp,
          bodyColor: op.role === PlayerRole.HUNTER ? '#f97316' : '#a855f7',
          glowColor: op.role === PlayerRole.HUNTER ? '#ea580c' : '#7c3aed',
          label: `${isSpectated ? '👁 ' : ''}${op.name || 'Joueur'} : ${op.role === PlayerRole.HUNTER ? 'Chasseur' : propToDraw.displayName}`
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

      // --- 3bis. ARMES EN MAIN, AIDES À LA VISÉE ET EFFETS DE COMBAT ---
      drawCombatWorld();

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

      const nowVfx = performance.now();
      const dtVfx = Math.min(0.05, (nowVfx - lastVfxTime) / 1000);
      lastVfxTime = nowVfx;

      // Effets visuels en espace monde (particules de transformation)
      vfx.updateAndDrawWorld(ctx!, dtVfx);

      ctx!.restore();

      // Vignette d'ambiance + flash d'impact en espace écran
      vfx.updateAndDrawScreen(ctx!, canvas.width, canvas.height, dtVfx);

      // Mise à jour du HUD unifié (Vie, Rôle, Survivants, Compétences Prop)
      if (hudHpText && hudHpFill) {
        const curHp = Math.max(0, Math.round(player.health));
        const maxHp = Math.max(1, Math.round(player.maxHealth));
        const hpRatio = Math.min(100, (curHp / maxHp) * 100);
        hudHpText.textContent = `${curHp} / ${maxHp} PV`;
        hudHpFill.style.width = `${hpRatio}%`;
        hudHpFill.style.background = hpRatio > 50
          ? 'linear-gradient(90deg, #22c55e, #4ade80)'
          : hpRatio > 25
            ? 'linear-gradient(90deg, #eab308, #facc15)'
            : 'linear-gradient(90deg, #dc2626, #ef4444)';
      }

      if (gameRoleBadge) {
        if (isSpectator) {
          gameRoleBadge.textContent = 'SPECTATEUR';
        } else if (localPlayerRole === PlayerRole.HUNTER) {
          gameRoleBadge.textContent = 'CHASSEUR';
        } else {
          gameRoleBadge.textContent = 'PROP';
        }
      }

      if (propActionsHud) {
        const showPropHud = !isSpectator && localPlayerRole === PlayerRole.PROP && currentPhase !== GamePhase.ROUND_END;
        propActionsHud.style.display = showPropHud ? 'flex' : 'none';
      }

      let huntersAlive = (!isSpectator && localPlayerRole === PlayerRole.HUNTER && player.health > 0) ? 1 : 0;
      let propsAlive = (!isSpectator && localPlayerRole === PlayerRole.PROP && player.health > 0) ? 1 : 0;
      otherPlayers.forEach(op => {
        if (op.health > 0) {
          if (op.role === PlayerRole.HUNTER) huntersAlive++;
          else if (op.role === PlayerRole.PROP) propsAlive++;
        }
      });
      if (gameSurvivorsBadge) {
        gameSurvivorsBadge.innerHTML = `<span>HUNTER ${huntersAlive}</span><span class="hud-survivors-sep">|</span><span>PROPS ${propsAlive}</span>`;
      }
      if (gameControlsBar) {
        if (isSpectator) {
          gameControlsBar.textContent = '[← / →] Cible • [Espace] Caméra libre • [T] Chat • [Échap] Menu';
        } else if (localPlayerRole === PlayerRole.HUNTER) {
          gameControlsBar.textContent = '[ZQSD] Bouger • [1/2/3] Armes • [Clic] Tirer • [T] Chat • [Échap] Menu';
        } else {
          gameControlsBar.textContent = '[ZQSD] Bouger • [T] Chat • [Échap] Menu • [Clic Minimap] Plan';
        }
      }

      // Réticule du chasseur (en espace écran)
      drawCrosshair();
      updateWeaponHud();

      // Rendu de la roue de transformation (en espace écran, au-dessus du monde)
      if (transformationWheel.getIsOpen()) {
        transformationWheel.setCurrentEquippedPropId(player.currentProp.id);
        transformationWheel.render(ctx!, canvas.width, canvas.height);
      }

      // Rendu de la Minimap circulaire (et du Plan complet si ouvert)
      if (minimapCtx && minimapCanvas) {
        tryBuildMapSnapshot();
        const allies: MinimapPlayerMarker[] = [];
        otherPlayers.forEach(op => {
          if (op.health <= 0 || op.role === PlayerRole.SPECTATOR) return;
          if (isSpectator || op.role === localPlayerRole) {
            allies.push({ x: op.x, y: op.y, name: op.name, role: op.role });
          }
        });

        renderMinimap(
          minimapCtx,
          minimapCanvas.width,
          mapSnapshot,
          mapWidthPx,
          mapHeightPx,
          player.x,
          player.y,
          localPlayerRole,
          allies,
          isMinimapHovered
        );

        if (isFullMapOpen && fullMapCtx && fullMapCanvas) {
          renderFullMap(
            fullMapCtx,
            fullMapCanvas,
            mapSnapshot,
            mapWidthPx,
            mapHeightPx,
            player.x,
            player.y,
            localPlayerRole,
            allies
          );
        }
      }
    }
    const zoom = (Math.min(canvas.width, canvas.height) / (VISION_RADIUS * 2)) * (spectator.active ? spectator.zoom : 1);

    // Petite secousse d'écran lors des explosions proches
    const shakeX = state.screenShake > 0.1 ? (Math.random() - 0.5) * state.screenShake : 0;
    const shakeY = state.screenShake > 0.1 ? (Math.random() - 0.5) * state.screenShake : 0;
    state.screenShake *= 0.88;

    state.view.camX = camera.x;
    state.view.camY = camera.y;
    state.view.zoom = zoom;
    ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
    ctx.scale(zoom, zoom);
    ctx.translate(-camera.x, -camera.y);
}

/** Roue radiale de transformation des Props (8 slots, paginée) */
function createTransformationWheel(state: GameState, propImages: Map<string, HTMLImageElement>): TransformationWheel {
    const { player } = state;
    const wheel: TransformationWheel = new TransformationWheel({
        propsList: DEFAULT_PROPS.filter(p => p.internalName !== 'prop_human'),
        baseProp: DEFAULT_PROPS[0],
        propImages,
        onTransform: (targetProp: PropDefinition, isRevertToBase: boolean) => {
            player.currentProp = targetProp;
            player.variantIndex = 0;
            player.maxHealth = targetProp.health;
            if (player.health > targetProp.health) {
                player.health = targetProp.health;
            }
            wheel.setCurrentEquippedPropId(targetProp.id);

            console.log(isRevertToBase
                ? `[PROP] Retour humain : ${ targetProp.displayName } (${ player.health }/${ player.maxHealth } HP)`
                : `[PROP] Transformation : ${ targetProp.displayName } (${ player.health }/${ player.maxHealth } HP)`);

            if (networkManager.localPlayerId) {
                networkManager.send(MessageType.TRANSFORM_PROP, {
                    playerId: networkManager.localPlayerId,
                    propId: targetProp.id,
                    variantIndex: 0,
                    spriteKey: targetProp.internalName,
                    currentProp: targetProp
                });
            }
        }
    });
    return wheel;
}