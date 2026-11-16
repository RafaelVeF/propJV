import { switchView } from './viewManager';
import {
  MessageType,
  type NetworkMessage,
  type Player,
  DEFAULT_PROPS,
  type PropDefinition,
  GAMEPLAY_CONFIG,
  PlayerRole,
  type PlayerDiedPayload,
  getNextSpectateTarget
} from '@prop-hunt/shared';

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

      <!-- Écran de mort (affiché quelques secondes au moment où le joueur local meurt) -->
      <div id="death-overlay" style="position: absolute; inset: 0; z-index: 15; display: none; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; background: radial-gradient(ellipse at center, rgba(120,0,0,0.15) 0%, rgba(0,0,0,0.75) 100%); font-family: sans-serif; transition: opacity 0.6s ease;">
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
  let localPlayerId: string | null = null;
  let showHitbox = true; // Activer l'affichage visuel de la hitbox (touche 'H' pour activer/désactiver)
  let currentPropIndex = 0;
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

  // =========================================================================
  // MODE SPECTATEUR (activé quand le joueur local meurt)
  // =========================================================================
  const deathOverlay = document.getElementById('death-overlay');
  const deathOverlayKiller = document.getElementById('death-overlay-killer');
  const deathOverlayProp = document.getElementById('death-overlay-prop');
  const spectatorHud = document.getElementById('spectator-hud');
  const spectatorTargetEl = document.getElementById('spectator-target');
  const spectatorHelpEl = document.getElementById('spectator-help');

  const DEATH_SCREEN_DURATION = 3000;  // Durée de l'écran "Vous êtes mort" (ms)
  const DEATH_EFFECT_DURATION = 1600;  // Durée de l'effet visuel de destruction du prop (ms)
  const FREE_CAM_SPEED = 8;            // Vitesse de la caméra libre (px monde / frame)
  const MIN_SPECTATOR_ZOOM = 0.4;
  const MAX_SPECTATOR_ZOOM = 1.5;

  let isSpectator = false;
  let spectateTargetId: string | null = null;
  let freeCam = false;
  let spectatorZoom = 1; // Multiplicateur de zoom (molette) en mode spectateur
  const camera = { x: player.x, y: player.y };
  let deathOverlayTimeout: ReturnType<typeof setTimeout> | null = null;

  interface DeathEffect {
    x: number;
    y: number;
    startedAt: number;
    name: string;
    particles: { vx: number; vy: number; size: number; color: string }[];
  }
  const deathEffects: DeathEffect[] = [];

  const spawnDeathEffect = (x: number, y: number, name: string) => {
    const colors = ['#a3a3a3', '#78716c', '#d6d3d1', '#ef4444', '#57534e'];
    const particles = Array.from({ length: 18 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 20 + Math.random() * 45;
      return {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 25, // Légère projection vers le haut
        size: 2 + Math.random() * 3,
        color: colors[Math.floor(Math.random() * colors.length)]
      };
    });
    deathEffects.push({ x, y, startedAt: Date.now(), name, particles });
  };

  /** Joueurs encore en vie que l'on peut suivre */
  const getAlivePlayerIds = (): string[] => {
    const ids: string[] = [];
    otherPlayers.forEach((op, id) => {
      if (op.role !== PlayerRole.SPECTATOR && op.health > 0) ids.push(id);
    });
    return ids;
  };

  const cycleSpectateTarget = (direction: 1 | -1) => {
    const next = getNextSpectateTarget(getAlivePlayerIds(), spectateTargetId, direction);
    spectateTargetId = next;
    freeCam = next === null; // Plus personne à suivre : caméra libre
    updateSpectatorHud();
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
      const propName = target.currentProp?.displayName;
      spectatorTargetEl.innerText = `Vous suivez : ${target.name || 'Joueur'}${propName ? ` (${propName})` : ''}`;
      spectatorHelpEl.innerText = '← / → ou Clic G / D : changer de joueur | Espace : caméra libre | Molette : zoom';
    }
  };

  const enterSpectatorMode = (death?: PlayerDiedPayload) => {
    if (isSpectator) return;
    isSpectator = true;
    freeCam = false;
    spectatorZoom = 1;
    camera.x = player.x;
    camera.y = player.y;
    player.health = 0;
    Object.keys(keys).forEach(k => { keys[k] = false; }); // Évite qu'une touche reste "appuyée"
    console.log('[SPECTATEUR] Vous êtes mort, passage en mode spectateur.');

    if (wsStatus) {
      wsStatus.innerText = 'WS: Connecté | Mode spectateur | H: Hitbox';
    }

    // Écran de mort temporaire
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

    // On commence par suivre le tueur s'il est encore en vie (comme dans la plupart des jeux)
    const killer = death?.killerId ? otherPlayers.get(death.killerId) : undefined;
    if (killer && killer.role !== PlayerRole.SPECTATOR && killer.health > 0) {
      spectateTargetId = death!.killerId!;
    } else {
      spectateTargetId = null;
      cycleSpectateTarget(1);
    }
    updateSpectatorHud();
  };

  // Connexion WebSocket au game-server (port 8080)
  let socket: WebSocket | null = null;

    const GAME_SERVER_URL = import.meta.env.VITE_GAME_SERVER_URL ?? 'ws://localhost:8080';

  try {
      socket = new WebSocket(GAME_SERVER_URL);
    socket.onopen = () => {
        console.log(`[WS] Connecté au serveur de jeu (${GAME_SERVER_URL})`);      if (wsStatus) {
        wsStatus.innerText = 'WS: Connecté | E: Changer Prop | R: Tourner Prop | K: Dégâts (-15) | H: Hitbox';
        wsStatus.style.color = '#4ade80';
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg: NetworkMessage = JSON.parse(event.data);
        if (msg.type === MessageType.WELCOME) {
          localPlayerId = msg.payload.player.id;
          if (msg.payload.player.currentProp) {
            player.currentProp = msg.payload.player.currentProp;
          }
          if ('variantIndex' in msg.payload.player && msg.payload.player.variantIndex !== undefined) {
            player.variantIndex = msg.payload.player.variantIndex;
          }
          player.health = msg.payload.player.health ?? player.currentProp.health;
          player.maxHealth = msg.payload.player.maxHealth ?? player.currentProp.health;
          player.lastHitTimestamp = msg.payload.player.lastHitTimestamp ?? 0;
          console.log('[WS] Bienvenue ! Mon ID joueur :', localPlayerId, `(HP: ${player.health}/${player.maxHealth})`);
          if (msg.payload.player.role === PlayerRole.SPECTATOR) {
            enterSpectatorMode(); // Arrivée en cours de manche déjà morte / en tant que spectateur
          }
        } else if (msg.type === MessageType.PLAYER_JOINED) {
          const newP: Player = msg.payload.player;
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
        } else if (msg.type === MessageType.PLAYER_LEFT) {
          otherPlayers.delete(msg.payload.playerId);
          console.log('[WS] Joueur déconnecté :', msg.payload.playerId);
          if (isSpectator && msg.payload.playerId === spectateTargetId) {
            cycleSpectateTarget(1); // La personne suivie est partie
          }
        } else if (msg.type === MessageType.TRANSFORM_PROP) {
          const payload = msg.payload;
          const newProp: PropDefinition | undefined = payload.currentProp || DEFAULT_PROPS.find(p =>
            (payload.propId !== undefined && p.id === payload.propId) ||
            (payload.spriteKey && p.internalName === payload.spriteKey)
          );
          if (newProp) {
            if (payload.playerId === localPlayerId) {
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
        } else if (msg.type === MessageType.PLAYER_HIT) {
          const payload = msg.payload;
          const targetId = payload.targetPlayerId || payload.playerId;
          const hitTime = payload.lastHitTimestamp || Date.now();
          if (targetId === localPlayerId) {
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
        } else if (msg.type === MessageType.PLAYER_DIED) {
          const payload = msg.payload as PlayerDiedPayload;
          spawnDeathEffect(payload.x, payload.y, payload.playerName);
          console.log(`[MORT] ${payload.playerName} est mort${payload.killerName ? ` (tué par ${payload.killerName})` : ''}`);

          if (payload.playerId === localPlayerId) {
            enterSpectatorMode(payload);
          } else {
            const op = otherPlayers.get(payload.playerId);
            if (op) {
              op.role = PlayerRole.SPECTATOR;
              op.health = 0;
            }
            // Si on regardait ce joueur, on passe automatiquement au suivant
            if (isSpectator && payload.playerId === spectateTargetId) {
              cycleSpectateTarget(1);
            } else if (isSpectator) {
              updateSpectatorHud();
            }
          }
        } else if (msg.type === MessageType.GAME_STATE_UPDATE) {
          const playersList = msg.payload.players as Player[];
          const currentIds = new Set<string>();
          playersList.forEach(p => {
            currentIds.add(p.id);
            if (p.id === localPlayerId) {
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
              // Filet de sécurité si le message PLAYER_DIED a été manqué
              if (p.role === PlayerRole.SPECTATOR && !isSpectator) {
                enterSpectatorMode();
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
            if (!target || target.role === PlayerRole.SPECTATOR || target.health <= 0) {
              cycleSpectateTarget(1);
            }
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
    if (e.key.toLowerCase() === 'h') {
      showHitbox = !showHitbox;
      console.log(`[DEBUG] Affichage des hitboxes : ${showHitbox ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
    }

    // En mode spectateur : on ne contrôle plus de prop, seulement la caméra
    if (isSpectator) {
      if (!viewGame?.classList.contains('active')) return;
      if (e.key === 'ArrowRight') cycleSpectateTarget(1);
      if (e.key === 'ArrowLeft') cycleSpectateTarget(-1);
      if (e.key === ' ') {
        e.preventDefault();
        if (freeCam) {
          cycleSpectateTarget(1); // Retour au suivi d'un joueur
        } else {
          freeCam = true;
          updateSpectatorHud();
        }
      }
      return;
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
      if (socket && socket.readyState === WebSocket.OPEN && localPlayerId) {
        socket.send(JSON.stringify({
          type: MessageType.TRANSFORM_PROP,
          payload: {
            playerId: localPlayerId,
            propId: nextProp.id,
            variantIndex: 0,
            spriteKey: nextProp.internalName
          }
        }));
      }
    }
    // Touche 'R' : Tourner le prop actuel (boucler sur ses variantes d'orientation)
    if (e.key.toLowerCase() === 'r') {
      const variants = player.currentProp.variants || [];
      if (variants.length > 1) {
        player.variantIndex = (player.variantIndex + 1) % variants.length;
        const currentVariant = variants[player.variantIndex];
        console.log(`[PROP] Rotation : ${player.currentProp.displayName} -> ${currentVariant.orientationName || `Variante ${player.variantIndex}`} (${currentVariant.width}x${currentVariant.height})`);
        if (socket && socket.readyState === WebSocket.OPEN && localPlayerId) {
          socket.send(JSON.stringify({
            type: MessageType.TRANSFORM_PROP,
            payload: {
              playerId: localPlayerId,
              propId: player.currentProp.id,
              variantIndex: player.variantIndex,
              spriteKey: player.currentProp.internalName
            }
          }));
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
      if (socket && socket.readyState === WebSocket.OPEN && localPlayerId) {
        socket.send(JSON.stringify({
          type: MessageType.PLAYER_HIT,
          payload: {
            targetPlayerId: localPlayerId,
            damage: damage,
            lastHitTimestamp: player.lastHitTimestamp
          }
        }));
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  // Souris en mode spectateur : clic gauche = joueur suivant, clic droit = précédent, molette = zoom
  canvas.addEventListener('mousedown', (e) => {
    if (!isSpectator) return;
    if (e.button === 0) cycleSpectateTarget(1);
    if (e.button === 2) cycleSpectateTarget(-1);
  });
  canvas.addEventListener('contextmenu', (e) => {
    if (isSpectator) e.preventDefault();
  });
  canvas.addEventListener('wheel', (e) => {
    if (!isSpectator) return;
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    spectatorZoom = Math.max(MIN_SPECTATOR_ZOOM, Math.min(MAX_SPECTATOR_ZOOM, spectatorZoom * factor));
  }, { passive: false });

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
      if (!isSpectator && (vx !== lastVx || vy !== lastVy) && socket && socket.readyState === WebSocket.OPEN && localPlayerId) {
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

      // Caméra : centrée sur le joueur local, ou sur la cible / caméra libre en mode spectateur
      if (!isSpectator) {
        camera.x = player.x;
        camera.y = player.y;
      } else if (!freeCam && spectateTargetId) {
        const target = otherPlayers.get(spectateTargetId);
        if (target) {
          // Transition douce lors d'un changement de cible
          camera.x += (target.x - camera.x) * 0.15;
          camera.y += (target.y - camera.y) * 0.15;
        }
      }
      const zoom = (Math.min(canvas.width, canvas.height) / (VISION_RADIUS * 2)) * (isSpectator ? spectatorZoom : 1);
      ctx!.translate(canvas.width / 2, canvas.height / 2);
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
      // Le joueur local n'est plus dessiné une fois mort (il n'a plus de corps)
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
          label: `Moi : ${player.currentProp.displayName}`
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
          bodyColor: '#a855f7',
          glowColor: '#7c3aed',
          label: `${isSpectated ? '👁 ' : ''}${op.name || 'Joueur'} : ${propToDraw.displayName}`
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

      // --- 3bis. EFFETS DE MORT (débris + nom qui s'envole) ---
      const nowFx = Date.now();
      for (let i = deathEffects.length - 1; i >= 0; i--) {
        const fx = deathEffects[i];
        const elapsed = nowFx - fx.startedAt;
        if (elapsed > DEATH_EFFECT_DURATION) {
          deathEffects.splice(i, 1);
          continue;
        }
        const t = elapsed / 1000;
        const progress = elapsed / DEATH_EFFECT_DURATION;
        const alpha = 1 - progress;

        ctx!.save();
        ctx!.globalAlpha = alpha;

        // Onde de choc
        ctx!.beginPath();
        ctx!.arc(fx.x, fx.y, 6 + progress * 34, 0, Math.PI * 2);
        ctx!.strokeStyle = '#ef4444';
        ctx!.lineWidth = 2 * (1 - progress) + 0.5;
        ctx!.stroke();

        // Débris du prop (avec un peu de gravité)
        fx.particles.forEach(pt => {
          const px = fx.x + pt.vx * t;
          const py = fx.y + pt.vy * t + 40 * t * t;
          ctx!.fillStyle = pt.color;
          ctx!.fillRect(px - pt.size / 2, py - pt.size / 2, pt.size, pt.size);
        });

        // Nom du joueur éliminé qui monte en s'estompant
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