import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import { EmoteWheel } from '../game/ui/EmoteWheel';
import { TransformationWheel } from '../game/ui/TransformationWheel';
import { DEFAULT_HUNTER_EMOTES, DEFAULT_PROPS, MessageType, type PropDefinition } from '@prop-hunt/shared';
import { createGameState, VISION_RADIUS, type GameState } from '../game/state';
import { loadDroneImages, loadMineGroundImage, loadEmoteImages, loadHunterSprites, loadPropImages, loadWeaponImages } from '../game/assets';
import { musicManager } from '../audio/MusicManager';
import { MapRenderer } from '../game/map/mapRenderer';
import { collectCharacters, drawCharacter } from '../game/render/characterRenderer';
import { HunterAnimator } from '../game/render/hunterAnimation';
import { CombatEffects } from '../game/combat/combatEffects';
import { DroneController } from '../game/combat/droneController';
import { WeaponController } from '../game/combat/weaponController';
import { drawCrosshair } from '../game/combat/crosshair';
import { SpectatorController } from '../game/spectator/spectatorController';
import { ChatManager } from '../game/ui/ChatManager';
import { HudController } from '../game/ui/hudController';
import { MinimapController } from '../game/ui/Minimap';
import { RoundHud } from '../game/ui/roundHud';
import { updateStatusBar } from '../game/ui/statusBar';
import { renderGameView } from '../game/ui/gameTemplate';
import { VisualEffectsManager } from '../game/ui/VisualEffects';
import { registerGameNetworkHandlers } from '../game/network/gameNetwork';
import { readMovementInput, registerGameInput } from '../game/input/gameInput';

/**
 * Écran de jeu. Ce fichier assemble les modules de src/game/ :
 *  - state.ts            : état partagé (joueurs, caméra, souris, phase...)
 *  - map/                : rendu de la carte et transparence des murs / piliers
 *  - render/             : rendu des personnages
 *  - combat/             : drones accompagnants, armes, effets visuels, réticule
 *  - spectator/          : mode spectateur après la mort
 *  - ui/                 : HTML de l'écran, HUD unifié, minimap, chat, VFX, manche
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
  const wsStatus = document.getElementById('ws-status');
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

  if (!canvas || !viewGame || !viewMain) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Démarrage / arrêt automatique de la musique à l'entrée / sortie de la vue jeu
  const viewObserver = new MutationObserver(() => {
    if (viewGame.classList.contains('active')) {
      musicManager.start();
    } else {
      musicManager.stop();
    }
  });
  viewObserver.observe(viewGame, { attributes: true, attributeFilter: ['class'] });

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
  const mineGroundImage = loadMineGroundImage();
  const droneImages = loadDroneImages();
  const hunterSprites = loadHunterSprites();
  const emoteImages = loadEmoteImages();
  const hunterAnimator = new HunterAnimator();
  const map = new MapRenderer();
  map.load();

  // --- Modules ---
  const effects = new CombatEffects();
  const drones = new DroneController();
  const vfx = new VisualEffectsManager();
  const transformationWheel = createTransformationWheel(state, propImages, vfx);
  const emoteWheel = new EmoteWheel({
    emotesList: DEFAULT_HUNTER_EMOTES,
    emoteImages,
    onSelectEmote: (emote) => {
      if (!networkManager.localPlayerId) return;
      hunterAnimator.playEmote(networkManager.localPlayerId, emote.id);
      networkManager.send(MessageType.HUNTER_EMOTE, {
        playerId: networkManager.localPlayerId,
        emoteId: emote.id
      });
    }
  });
  const weapons = new WeaponController(state, canvas, document.getElementById('weapon-hud'), weaponImages, droneImages);
  const roundHud = new RoundHud();
  const minimap = new MinimapController(state, map);

  const chat = new ChatManager({
    onSendMessage: (text: string) => {
      networkManager.send(MessageType.CHAT_MESSAGE, { text });
    },
    getLocalPlayerId: () => networkManager.localPlayerId,
    getPlayerNames: () => {
      const names = Array.from(state.otherPlayers.values())
        .map(op => op.name)
        .filter((n): n is string => Boolean(n));
      if (state.localPlayerName) names.unshift(state.localPlayerName);
      return Array.from(new Set(names));
    }
  });
  chat.mount(viewGame);

  const cleanupSession = () => {
    state.showHitbox = false;
    minimap.setFullMapOpen(false);
    drones.clear();
    emoteWheel.close();
    chat.close();
    chat.clearMessages();
    musicManager.stop();
  };

  const hud = new HudController(state, {
    onLeaveGame: () => {
      cleanupSession();
      networkManager.send(MessageType.LEAVE_ROOM, {});
      switchView(viewGame, viewMain);
    }
  });

  const updateStatus = () => updateStatusBar(wsStatus, state);
  const spectator = new SpectatorController(state, () => {
    if (state.spectator.active && transformationWheel.getIsOpen()) transformationWheel.toggle();
    if (state.spectator.active && emoteWheel.getIsOpen()) emoteWheel.close();
    weapons.updateHud();
    updateStatus();
  });

  registerGameNetworkHandlers({
    state,
    weapons,
    effects,
    drones,
    vfx,
    chat,
    hunterAnimator,
    spectator,
    roundHud,
    updateStatus,
    returnToLobby: (onlyIfInGame) => {
      if (!viewLobby) return;
      if (onlyIfInGame && !viewGame.classList.contains('active')) return;
      hud.setPauseMenuOpen(false);
      minimap.setFullMapOpen(false);
      emoteWheel.close();
      chat.close();
      switchView(viewGame, viewLobby);
    },
    onKicked: (reason) => {
      if (!viewGame.classList.contains('active')) return;
      hud.setPauseMenuOpen(false);
      cleanupSession();
      spectator.exit();
      roundHud.hideRoundEnd();
      roundHud.hideBlindfold();
      switchView(viewGame, viewMain);
      alert(reason || "Vous avez été expulsé de la partie par l'hôte.");
    }
  });

  registerGameInput({
    state,
    canvas,
    viewGame,
    transformationWheel,
    emoteWheel,
    weapons,
    spectator,
    chat,
    hud,
    minimap
  });

  // --- Boucle de jeu ---
  let lastVx = 0;
  let lastVy = 0;
  let lastVfxTime = performance.now();

  /** Entrées, envoi de l'intention de mouvement, interpolation et mise à jour des drones / animations */
  const update = () => {
    const { player } = state;
    const freezeMovement = transformationWheel.getIsOpen() || emoteWheel.getIsOpen() || chat.getIsOpen();
    let { vx, vy } = freezeMovement ? { vx: 0, vy: 0 } : readMovementInput(state);

    if (spectator.isActive) {
      spectator.updateCamera(vx, vy);
      vx = 0;
      vy = 0;
    } else if ((vx !== lastVx || vy !== lastVy) && networkManager.localPlayerId) {
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

    const lerpFactor = 0.3;
    player.x += (player.targetX - player.x) * lerpFactor;
    player.y += (player.targetY - player.y) * lerpFactor;

    const remoteVelocities = new Map<string, { dx: number; dy: number }>();
    state.otherPlayers.forEach((op, id) => {
      const dx = op.targetX - op.x;
      const dy = op.targetY - op.y;
      op.x += dx * lerpFactor;
      op.y += dy * lerpFactor;
      remoteVelocities.set(id, { dx, dy });
    });

    drones.sync(state, vx, vy, remoteVelocities);
    weapons.syncActiveZap();
    hunterAnimator.sync(state, vx, vy, remoteVelocities);
  };

  /** Rendu d'une image complète */
  const render = (dtVfx: number) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    applyCamera(ctx, canvas, state);

    // 1. Sol, murs et mines armées au sol
    map.drawGround(ctx);
    effects.drawMines(ctx, mineGroundImage);
    // 2. Personnages triés par profondeur
    const characters = collectCharacters(state, hunterAnimator);
    characters.forEach(c => drawCharacter(ctx, c, propImages, state.showHitbox, hunterSprites, emoteImages));
    // 3. Drones accompagnants + armes orientées, aides à la visée, effets combat et VFX monde
    weapons.drawHeldWeapons(ctx, effects, drones);
    effects.draw(ctx);
    vfx.updateAndDrawWorld(ctx, dtVfx);
    // 4. Calque "above" (haut des murs / piliers), transparent autour du point de vue
    map.drawAbove(ctx, state.camera.x, state.camera.y - 16);

    ctx.restore();

    // 5. Vignette & flash d'impact en espace écran
    vfx.updateAndDrawScreen(ctx, canvas.width, canvas.height, dtVfx);

    // 6. Réticule, HUD unifié, roues radiales et minimap
    const wheelOpen = transformationWheel.getIsOpen() || emoteWheel.getIsOpen();
    if (!wheelOpen) drawCrosshair(ctx, state, weapons, effects);
    weapons.updateHud();
    if (wheelOpen) canvas.style.cursor = 'default';
    if (transformationWheel.getIsOpen()) {
      transformationWheel.setCurrentEquippedPropId(state.player.currentProp.id);
      transformationWheel.render(ctx, canvas.width, canvas.height);
    } else if (emoteWheel.getIsOpen()) {
      emoteWheel.render(ctx, canvas.width, canvas.height);
    }
    hud.update();
    minimap.render();
  };

  const gameLoop = () => {
    const nowPerf = performance.now();
    const dtVfx = Math.min(0.05, (nowPerf - lastVfxTime) / 1000);
    lastVfxTime = nowPerf;

    if (viewGame.classList.contains('active')) {
      update();
      render(dtVfx);
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
  }
  const zoom = (Math.min(canvas.width, canvas.height) / (VISION_RADIUS * 2)) * (spectator.active ? spectator.zoom : 1);

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
function createTransformationWheel(
  state: GameState,
  propImages: Map<string, HTMLImageElement>,
  vfx: VisualEffectsManager
): TransformationWheel {
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
      vfx.spawnTransformPoof(player.x, player.y);

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
  return wheel;
}
