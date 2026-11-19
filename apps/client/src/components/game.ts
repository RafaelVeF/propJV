import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import { TransformationWheel } from '../game/ui/TransformationWheel';
import { DEFAULT_PROPS, MessageType, type PropDefinition } from '@prop-hunt/shared';
import { createGameState, VISION_RADIUS, type GameState } from '../game/state';
import { loadHunterSprites, loadPropImages, loadWeaponImages } from '../game/assets';
import { MapRenderer } from '../game/map/mapRenderer';
import { collectCharacters, drawCharacter } from '../game/render/characterRenderer';
import { HunterAnimator } from '../game/render/hunterAnimation';
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
    const hunterSprites = loadHunterSprites();
    const hunterAnimator = new HunterAnimator();
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
        const remoteVelocities = new Map<string, { dx: number; dy: number }>();
        player.x += (player.targetX - player.x) * lerpFactor;
        player.y += (player.targetY - player.y) * lerpFactor;
        state.otherPlayers.forEach((op, id) => {
            const dx = op.targetX - op.x;
            const dy = op.targetY - op.y;
            op.x += dx * lerpFactor;
            op.y += dy * lerpFactor;
            remoteVelocities.set(id, { dx, dy });
        });
        hunterAnimator.sync(state, vx, vy, remoteVelocities);
    };

    /** Rendu d'une image complète */
    const render = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        applyCamera(ctx, canvas, state);

        // 1. Sol et murs
        map.drawGround(ctx);
        // 2. Personnages triés par profondeur
        const characters = collectCharacters(state, hunterAnimator);
        characters.forEach(c => drawCharacter(ctx, c, propImages, state.showHitbox, hunterSprites));
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