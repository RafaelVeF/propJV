import { MessageType, PlayerRole } from '@prop-hunt/shared';
import { musicManager } from '../../audio/MusicManager';
import { networkManager } from '../../network/networkManager';
import type { EmoteWheel } from '../ui/EmoteWheel';
import type { ChatManager } from '../ui/ChatManager';
import type { HudController } from '../ui/hudController';
import type { MinimapController } from '../ui/Minimap';
import type { TransformationWheel } from '../ui/TransformationWheel';
import type { GameState } from '../state';
import { WeaponController } from '../combat/weaponController';
import type { SpectatorController } from '../spectator/spectatorController';

export interface GameInputDeps {
  state: GameState;
  canvas: HTMLCanvasElement;
  viewGame: HTMLElement;
  transformationWheel: TransformationWheel;
  emoteWheel: EmoteWheel;
  weapons: WeaponController;
  spectator: SpectatorController;
  chat: ChatManager;
  hud: HudController;
  minimap: MinimapController;
}

/**
 * Clavier et souris de l'écran de jeu.
 * Les touches de déplacement (ZQSD / flèches) sont seulement mémorisées dans state.keys :
 * c'est la boucle de jeu qui les lit et envoie l'intention de mouvement au serveur.
 */
export function registerGameInput(deps: GameInputDeps): void {
  const { state, canvas, viewGame, transformationWheel, emoteWheel, weapons, spectator, chat, hud, minimap } = deps;
  const { keys, mouse, player } = state;

  const getActiveWheel = () => (
    transformationWheel.getIsOpen() ? transformationWheel : emoteWheel.getIsOpen() ? emoteWheel : null
  );

  window.addEventListener('keydown', (e) => {
    // 0. Si le chat est ouvert, il capture toute la saisie clavier
    if (chat.getIsOpen()) {
      return;
    }

    if (e.key === 'Escape' && state.isFullMapOpen) {
      minimap.setFullMapOpen(false);
      return;
    }

    // 1. Si une roue (transformation ou emotes) est ouverte, elle capture les touches en priorité
    const activeWheel = getActiveWheel();
    if (activeWheel?.handleKeyDown(e)) {
      e.preventDefault();
      return;
    }

    if (e.key === 'Escape' && viewGame.classList.contains('active')) {
      hud.setPauseMenuOpen(!state.isPauseMenuOpen);
      return;
    }

    const key = e.key.toLowerCase();

    if (key === 't' && viewGame.classList.contains('active') && !state.isPauseMenuOpen && !state.isFullMapOpen) {
      e.preventDefault();
      Object.keys(keys).forEach(k => { keys[k] = false; });
      chat.open();
      return;
    }

    keys[key] = true;

    if (key === 'm' && viewGame.classList.contains('active')) {
      musicManager.toggleMute();
    }

    // 2. Mode spectateur : on ne contrôle plus que la caméra
    if (spectator.isActive) {
      if (!viewGame.classList.contains('active')) return;
      if (e.key === 'ArrowRight') spectator.cycleTarget(1);
      if (e.key === 'ArrowLeft') spectator.cycleTarget(-1);
      if (e.key === ' ') {
        e.preventDefault();
        spectator.toggleFreeCam();
      }
      return;
    }

    // 3. Chasseur : sélection d'arme (1..5), rechargement (R) et roue d'emotes (E)
    if (state.localPlayerRole === PlayerRole.HUNTER) {
      if (key === 'e' && player.health > 0) {
        emoteWheel.toggle();
        return;
      }
      const slotWeapon = WeaponController.weaponForKey(e.key, e.code);
      if (slotWeapon) {
        weapons.select(slotWeapon);
        return;
      }
      if (key === 'r') {
        weapons.requestReload();
        return;
      }
    }

    // 4. Prop : roue de transformation (E) et rotation (R)
    if (key === 'e' && state.localPlayerRole === PlayerRole.PROP) {
      transformationWheel.toggle(player.currentProp.id);
      return;
    }
    if (key === 'r' && state.localPlayerRole === PlayerRole.PROP) {
      rotateProp(state);
    }

    // 5. Debug (K) : s'infliger des dégâts pour tester la barre de vie et la régénération
    if (key === 'k') {
      applyDebugSelfDamage(state, 15);
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
    mouse.inside = true;
    getActiveWheel()?.handleMouseMove(e.clientX, e.clientY, canvas);
  });

  canvas.addEventListener('mouseleave', () => { mouse.inside = false; });

  canvas.addEventListener('mousedown', (e) => {
    const activeWheel = getActiveWheel();
    if (activeWheel) {
      if (activeWheel.handleClick(e.clientX, e.clientY, canvas)) e.stopPropagation();
      return;
    }
    if (spectator.isActive) {
      if (e.button === 0) spectator.cycleTarget(1);
      if (e.button === 2) spectator.cycleTarget(-1);
      return;
    }
    if (e.button === 0 && state.localPlayerRole === PlayerRole.HUNTER) {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
      weapons.tryAttack();
    }
  });

  canvas.addEventListener('contextmenu', (e) => {
    if (spectator.isActive || state.localPlayerRole === PlayerRole.HUNTER) e.preventDefault();
  });

  canvas.addEventListener('wheel', (e) => {
    const activeWheel = getActiveWheel();
    if (activeWheel) {
      if (activeWheel.handleWheel(e)) e.preventDefault();
      return;
    }
    if (spectator.isActive) {
      e.preventDefault();
      spectator.zoomBy(e.deltaY);
      return;
    }
    if (state.localPlayerRole === PlayerRole.HUNTER) {
      e.preventDefault();
      weapons.cycle(e.deltaY > 0 ? 1 : -1);
    }
  }, { passive: false });
}

/** Intention de déplacement d'après les touches enfoncées (non normalisée : le serveur s'en charge) */
export function readMovementInput(state: GameState): { vx: number; vy: number } {
  const { keys } = state;
  let vx = 0;
  let vy = 0;
  if (keys['z'] || keys['arrowup']) { vy -= 1; }
  if (keys['s'] || keys['arrowdown']) { vy += 1; }
  if (keys['q'] || keys['arrowleft']) { vx -= 1; }
  if (keys['d'] || keys['arrowright']) { vx += 1; }
  return { vx, vy };
}

/** Touche R (prop) : passe à l'orientation suivante du prop actuel */
function rotateProp(state: GameState): void {
  const { player } = state;
  const variants = player.currentProp.variants || [];
  if (variants.length <= 1) {
    console.log(`[PROP] ${player.currentProp.displayName} n'a pas d'autre orientation disponible.`);
    return;
  }
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
}

/** Touche K (debug) : le serveur n'accepte ces dégâts que sur soi-même (GAME_CONFIG.DEBUG_SELF_DAMAGE) */
function applyDebugSelfDamage(state: GameState, damage: number): void {
  const { player } = state;
  player.health = Math.max(0, player.health - damage);
  player.lastHitTimestamp = Date.now();
  console.log(`[TEST] Dégâts appliqués : -${damage} HP (Vie restante: ${player.health}/${player.maxHealth}) - Régénération dans 10s`);
  if (networkManager.localPlayerId) {
    networkManager.send(MessageType.PLAYER_HIT, {
      targetPlayerId: networkManager.localPlayerId,
      damage,
      lastHitTimestamp: player.lastHitTimestamp
    });
  }
}
