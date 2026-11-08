/**
 * game.ts — Vue principale du jeu multijoueur PropJV.
 *
 * Orchestrateur léger et intuitif :
 * - Gestion du Canvas et redimensionnement pixel-art
 * - Rendu de la carte Tiled (MapRenderer)
 * - Rendu des personnages & props avec profondeur Y-sort (CharacterRenderer)
 * - Interpolation visuelle (Lerp) ultra-fluide pour le réseau
 * - Menus radiaux : Roue de Transformation (Props) et Roue des Armes (Hunters)
 * - Communication WebSocket avec synchronisation d'état (ServerMessageHandler)
 */

import { switchView } from './viewManager';
import {
  MessageType,
  DEFAULT_PROPS,
  DEFAULT_WEAPONS,
  type PropDefinition,
  type WeaponDefinition,
  PlayerRole,
  type NetworkMessage
} from '@prop-hunt/shared';
import { MapRenderer } from '../game/MapRenderer';
import { drawCharacter, type CharacterRenderData } from '../game/CharacterRenderer';
import { TransformationWheel } from '../game/ui/TransformationWheel';
import { WeaponWheel } from '../game/ui/WeaponWheel';
import {
  handleServerMessage,
  type LocalPlayerState,
  type OtherPlayerState,
  type GameNetworkContext
} from '../game/network/ServerMessageHandler';

export function renderGame(): string {
  return `
    <div id="view-game" class="view" style="width: 100vw; height: 100vh; background: #0a0a0a;">
      <button id="btn-leave-game" class="btn primary" style="position: absolute; top: 20px; left: 20px; z-index: 20; width: auto; padding: 10px 20px;">
        QUITTER
      </button>
      <div id="role-badge" style="position: absolute; top: 70px; left: 20px; z-index: 20; font-family: monospace; font-size: 13px; font-weight: bold; background: rgba(15,23,42,0.85); color: #4ade80; border: 1.5px solid #4ade80; padding: 5px 12px; border-radius: 6px;">
        RÔLE : PROP
      </div>
      <div id="ws-status" style="position: absolute; top: 20px; right: 20px; z-index: 20; color: #4ade80; font-family: sans-serif; font-size: 13px; background: rgba(0,0,0,0.6); padding: 6px 12px; border-radius: 6px;">
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
  const roleBadge = document.getElementById('role-badge');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  if (!canvas || !viewGame || !viewMain) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // --- 1. CONFIGURATION DU CANVAS & VUE ---
  if (btnLeaveGame) {
    btnLeaveGame.addEventListener('click', () => {
      switchView(viewGame, viewMain);
    });
  }

  function resize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx!.imageSmoothingEnabled = false; // Pixel art net
  }
  window.addEventListener('resize', resize);
  resize();

  // --- 2. ASSETS & MOTEUR DE CARTE ---
  const mapRenderer = new MapRenderer();

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

  // Préchargement des textures d'armes
  const weaponImages = new Map<string, HTMLImageElement>();
  DEFAULT_WEAPONS.forEach(w => {
    if (w.iconPath && !weaponImages.has(w.iconPath)) {
      const img = new Image();
      img.src = w.iconPath;
      weaponImages.set(w.iconPath, img);
    }
  });

  // --- 3. ÉTAT DES JOUEURS ---
  let showHitbox = true; // Basculable avec 'H'
  const player: LocalPlayerState = {
    id: null,
    role: PlayerRole.PROP,
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

  const otherPlayers = new Map<string, OtherPlayerState>();

  // --- 4. ROUES RADIALES (UI) ---
  const baseHumanProp = DEFAULT_PROPS[0];
  const transformableProps = DEFAULT_PROPS.filter(p => p.internalName !== 'prop_human');

  // Roue de transformation des Props (8 slots, paginée)
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

      if (isRevertToBase) {
        console.log(`[PROP] Retour humain : ${targetProp.displayName} (${player.health}/${player.maxHealth} HP)`);
      } else {
        console.log(`[PROP] Transformation : ${targetProp.displayName} (${player.health}/${player.maxHealth} HP)`);
      }

      if (socket && socket.readyState === WebSocket.OPEN && player.id) {
        socket.send(JSON.stringify({
          type: MessageType.TRANSFORM_PROP,
          payload: {
            playerId: player.id,
            propId: targetProp.id,
            variantIndex: 0,
            spriteKey: targetProp.internalName,
            currentProp: targetProp
          }
        }));
      }
    }
  });

  // Roue des armes pour les Hunters (4 slots)
  let currentWeapon: WeaponDefinition = DEFAULT_WEAPONS[0];
  const weaponWheel = new WeaponWheel({
    weapons: DEFAULT_WEAPONS,
    weaponImages: weaponImages,
    onSelectWeapon: (weapon: WeaponDefinition) => {
      currentWeapon = weapon;
      weaponWheel.setCurrentEquippedWeaponId(weapon.id);
      console.log(`[HUNTER] Arme sélectionnée : ${weapon.displayName}`);
    }
  });

  function updateRoleUI(newRole: PlayerRole): void {
    if (roleBadge) {
      const isHunter = newRole === PlayerRole.HUNTER;
      roleBadge.innerText = isHunter ? 'RÔLE : CHASSEUR' : 'RÔLE : PROP';
      roleBadge.style.color = isHunter ? '#38bdf8' : '#4ade80';
      roleBadge.style.borderColor = isHunter ? '#38bdf8' : '#4ade80';
    }
  }

  // --- 5. GESTION RÉSEAU WEBSOCKET ---
  let socket: WebSocket | null = null;
  const networkContext: GameNetworkContext = {
    player,
    otherPlayers,
    transformationWheel,
    onRoleChanged: (newRole: PlayerRole) => {
      updateRoleUI(newRole);
    }
  };

  try {
    socket = new WebSocket('ws://localhost:8080');

    socket.onopen = () => {
      console.log('[WS] Connecté au serveur de jeu (ws://localhost:8080)');
      if (wsStatus) {
        wsStatus.innerText = 'WS: Connecté | E: Roue | R: Tourner | T: Rôle | K: Dégâts (-15) | H: Hitbox';
        wsStatus.style.color = '#4ade80';
      }
    };

    socket.onmessage = (event) => {
      try {
        const msg: NetworkMessage = JSON.parse(event.data);
        handleServerMessage(msg, networkContext);
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

  // Helper pour savoir quelle roue est active selon le rôle
  function getActiveWheel() {
    return player.role === PlayerRole.HUNTER ? weaponWheel : transformationWheel;
  }

  // --- 6. GESTION DES TOUCHES & SOURIS ---
  const keys: { [key: string]: boolean } = {};

  window.addEventListener('keydown', (e) => {
    const activeWheel = getActiveWheel();

    // 1. Si la roue active est ouverte, elle capture prioritairement
    if (activeWheel.getIsOpen()) {
      const handled = activeWheel.handleKeyDown(e);
      if (handled) {
        e.preventDefault();
        return;
      }
    }

    const key = e.key.toLowerCase();
    keys[key] = true;

    // Touche 'H' : Bascule de la hitbox debug
    if (key === 'h') {
      showHitbox = !showHitbox;
      console.log(`[DEBUG] Hitbox : ${showHitbox ? 'ACTIVÉE' : 'DÉSACTIVÉE'}`);
    }

    // Touche 'E' : Ouvrir / Fermer la roue contextuelle (Props: Transformation / Hunter: Armes)
    if (key === 'e') {
      if (player.role === PlayerRole.HUNTER) {
        weaponWheel.toggle(currentWeapon.id);
      } else {
        transformationWheel.toggle(player.currentProp.id);
      }
      return;
    }

    // Touche 'T' : Changement de rôle en mode Freeplay (Prop <-> Hunter)
    if (key === 't') {
      if (socket && socket.readyState === WebSocket.OPEN && player.id) {
        const nextRole = player.role === PlayerRole.PROP ? PlayerRole.HUNTER : PlayerRole.PROP;
        socket.send(JSON.stringify({
          type: MessageType.SWITCH_ROLE,
          payload: {
            playerId: player.id,
            role: nextRole
          }
        }));
      }
      return;
    }

    // Touche 'R' : Tourner le prop actuel (orientation suivante)
    if (key === 'r' && player.role === PlayerRole.PROP) {
      const variants = player.currentProp.variants || [];
      if (variants.length > 1) {
        player.variantIndex = (player.variantIndex + 1) % variants.length;
        const currentVariant = variants[player.variantIndex];
        console.log(`[PROP] Rotation : ${player.currentProp.displayName} -> ${currentVariant.orientationName || `Variante ${player.variantIndex}`}`);
        if (socket && socket.readyState === WebSocket.OPEN && player.id) {
          socket.send(JSON.stringify({
            type: MessageType.TRANSFORM_PROP,
            payload: {
              playerId: player.id,
              propId: player.currentProp.id,
              variantIndex: player.variantIndex,
              spriteKey: player.currentProp.internalName
            }
          }));
        }
      }
    }

    // Touche 'K' : Simuler des dégâts (-15 HP)
    if (key === 'k') {
      const damage = 15;
      player.health = Math.max(0, player.health - damage);
      player.lastHitTimestamp = Date.now();
      console.log(`[TEST] Dégâts appliqués : -${damage} HP (${player.health}/${player.maxHealth})`);
      if (socket && socket.readyState === WebSocket.OPEN && player.id) {
        socket.send(JSON.stringify({
          type: MessageType.PLAYER_HIT,
          payload: {
            targetPlayerId: player.id,
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

  // Événements de souris pour les roues
  canvas.addEventListener('mousemove', (e) => {
    const activeWheel = getActiveWheel();
    if (activeWheel.getIsOpen()) {
      activeWheel.handleMouseMove(e.clientX, e.clientY, canvas);
    }
  });

  canvas.addEventListener('mousedown', (e) => {
    const activeWheel = getActiveWheel();
    if (activeWheel.getIsOpen()) {
      const handled = activeWheel.handleClick(e.clientX, e.clientY, canvas);
      if (handled) e.stopPropagation();
    }
  });

  canvas.addEventListener('wheel', (e) => {
    const activeWheel = getActiveWheel();
    if (activeWheel.getIsOpen()) {
      const handled = activeWheel.handleWheel(e);
      if (handled) e.preventDefault();
    }
  }, { passive: false });

  // --- 7. BOUCLE DE JEU (GAME LOOP) ---
  let lastVx = 0;
  let lastVy = 0;
  const VISION_RADIUS = 200; // Rayon de vision du joueur

  function gameLoop(): void {
    if (viewGame?.classList.contains('active')) {
      const activeWheel = getActiveWheel();

      // 1. Gestion des déplacements (bloqués si une roue est ouverte)
      let vx = 0;
      let vy = 0;
      if (!activeWheel.getIsOpen()) {
        if (keys['z'] || keys['arrowup']) vy -= 1;
        if (keys['s'] || keys['arrowdown']) vy += 1;
        if (keys['q'] || keys['arrowleft']) vx -= 1;
        if (keys['d'] || keys['arrowright']) vx += 1;
      }

      // Envoi de l'intention de mouvement si elle a changé
      if ((vx !== lastVx || vy !== lastVy) && socket && socket.readyState === WebSocket.OPEN && player.id) {
        socket.send(JSON.stringify({
          type: MessageType.PLAYER_MOVE,
          payload: {
            playerId: player.id,
            x: player.x,
            y: player.y,
            vx,
            vy
          }
        }));
        lastVx = vx;
        lastVy = vy;
      }

      // 2. Interpolation visuelle (Lerp) : garantie de lissage réseau parfait
      const lerpFactor = 0.3;
      player.x += (player.targetX - player.x) * lerpFactor;
      player.y += (player.targetY - player.y) * lerpFactor;

      otherPlayers.forEach((op) => {
        op.x += (op.targetX - op.x) * lerpFactor;
        op.y += (op.targetY - op.y) * lerpFactor;
      });

      // 3. Rendu Graphique
      ctx!.clearRect(0, 0, canvas.width, canvas.height);
      ctx!.save();

      // Caméra centrée sur le joueur local
      const zoom = Math.min(canvas.width, canvas.height) / (VISION_RADIUS * 2);
      ctx!.translate(canvas.width / 2, canvas.height / 2);
      ctx!.scale(zoom, zoom);
      ctx!.translate(-player.x, -player.y);

      // Couches de sol et murs (sous les personnages)
      mapRenderer.renderGround(ctx!);

      // Liste des personnages à afficher avec tri de profondeur Y-Sort
      const charactersToDraw: CharacterRenderData[] = [
        {
          x: player.x,
          y: player.y,
          prop: player.currentProp,
          variantIndex: player.variantIndex,
          health: player.health,
          maxHealth: player.maxHealth,
          lastHitTimestamp: player.lastHitTimestamp,
          bodyColor: player.role === PlayerRole.HUNTER ? '#38bdf8' : '#ef4444',
          glowColor: player.role === PlayerRole.HUNTER ? '#0284c7' : '#dc2626',
          label: player.role === PlayerRole.HUNTER ? `Moi : Chasseur` : `Moi : ${player.currentProp.displayName}`
        }
      ];

      otherPlayers.forEach((op) => {
        const propToDraw = op.currentProp || DEFAULT_PROPS[0];
        const isHunter = op.role === PlayerRole.HUNTER;
        charactersToDraw.push({
          x: op.x,
          y: op.y,
          prop: propToDraw,
          variantIndex: op.variantIndex ?? 0,
          health: op.health ?? propToDraw.health,
          maxHealth: op.maxHealth ?? propToDraw.health,
          lastHitTimestamp: op.lastHitTimestamp,
          bodyColor: isHunter ? '#38bdf8' : '#a855f7',
          glowColor: isHunter ? '#0284c7' : '#7c3aed',
          label: `${op.name || 'Joueur'} : ${isHunter ? 'Chasseur' : propToDraw.displayName}`
        });
      });

      // Y-Sorting : les entités plus hautes sont dessinées en premier, les plus basses devant
      charactersToDraw.sort((a, b) => a.y - b.y);

      charactersToDraw.forEach((c) => {
        drawCharacter(ctx!, c, propImages, showHitbox);
      });

      // Couche supérieure "above" (passe devant les personnages)
      mapRenderer.renderAbove(ctx!);

      ctx!.restore();

      // 4. UI / HUD en espace écran (Screen Space)
      if (activeWheel.getIsOpen()) {
        if (player.role === PlayerRole.PROP) {
          transformationWheel.setCurrentEquippedPropId(player.currentProp.id);
        } else {
          weaponWheel.setCurrentEquippedWeaponId(currentWeapon.id);
        }
        activeWheel.render(ctx!, canvas.width, canvas.height);
      } else {
        // Bulle d'indication discrète en bas de l'écran
        ctx!.save();
        ctx!.font = '12px sans-serif';
        const wheelLabel = player.role === PlayerRole.HUNTER ? '[E] Arsenal d’armes' : '[E] Roue de Transformation';
        const hintText = `${wheelLabel}  •  [T] Changer de Rôle (Freeplay)`;
        const tm = ctx!.measureText(hintText);
        const pw = tm.width + 24;
        const ph = 26;
        const px = canvas.width / 2 - pw / 2;
        const py = canvas.height - 30;

        ctx!.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx!.beginPath();
        ctx!.roundRect(px, py - ph / 2, pw, ph, 13);
        ctx!.fill();

        ctx!.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx!.lineWidth = 1;
        ctx!.stroke();

        ctx!.fillStyle = '#cbd5e1';
        ctx!.textAlign = 'center';
        ctx!.textBaseline = 'middle';
        ctx!.fillText(hintText, canvas.width / 2, py);
        ctx!.restore();
      }
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
}
