import logoUrl from '../assets/propJV_logo.png';
import { switchView } from './viewManager';
import { networkManager } from '../network/networkManager';
import {
  MessageType,
  DEFAULT_HUNTER_EMOTES,
  type HunterEmoteDefinition,
} from '@prop-hunt/shared';
import {
  HUNTER_SPRITE_SPECS,
  type HunterSpriteSpec,
} from '../game/render/hunterSpriteSpecs';
import { isAuthenticated, onAuthChange } from '../services/authService';
import { fetchFriendsOverview } from '../services/friendsService';

export function renderMainMenu(): string {
  return `
    <!-- Vue 1 : Menu Principal (Asymétrique 100vw x 100vh - 100% Souris - Diorama Pixel-Art) -->
    <div id="view-main" class="view main-screen active">
      <!-- Scène d'arrière-plan animée (Diorama Pixel-Art avec spritesheets) -->
      <canvas id="main-menu-diorama" class="mm-diorama-canvas" aria-hidden="true"></canvas>
      <!-- Dégradé directionnel sombre à gauche + vignettage subtil -->
      <div class="mm-scrim" aria-hidden="true"></div>

      <!-- Composition asymétrique 3 zones pleine hauteur (100vh) -->
      <div class="mm-shell">
        <!-- 1. Barre supérieure -->
        <header class="mm-top-bar">
          <div class="mm-top-right">
            <div class="mm-auth-group auth-top-widget">
              <button type="button" class="mm-top-btn auth-status-btn" id="btn-auth-status" title="Se connecter ou créer un compte">
                <span class="auth-status-dot" aria-hidden="true"></span>
                <span class="auth-status-label" id="auth-status-label">CONNEXION</span>
              </button>
              <button type="button" class="mm-top-btn mm-logout-btn auth-logout-btn" id="btn-auth-logout" title="Se déconnecter" hidden>
                DÉCONNEXION
              </button>
            </div>

            <span class="mm-top-sep" aria-hidden="true"></span>

            <nav class="mm-utility-nav" aria-label="Accès rapides">
              <button type="button" class="mm-top-btn" id="btn-profile" data-mm-nav="profile">
                PROFIL / CASIER
              </button>
              <button type="button" class="mm-top-btn" id="btn-friends" data-mm-nav="friends">
                <span>AMIS</span>
                <span class="mm-notif-badge" id="friends-notif-badge" hidden>0</span>
              </button>
              <button type="button" class="mm-top-btn" id="btn-settings" data-mm-nav="settings">
                PARAMÈTRES
              </button>
            </nav>
          </div>
        </header>

        <!-- 2. Corps asymétrique : colonne de navigation à gauche + zone droite ouverte -->
        <div class="mm-body">
          <aside class="mm-left-col" aria-label="Menu principal">
            <div class="mm-brand-block">
              <img src="${logoUrl}" alt="PropJV" class="mm-logo" />
              <div class="mm-brand-text">
                <h1 class="mm-brand-title">PROPJV</h1>
                <span class="mm-brand-sub">PROP HUNT MULTIJOUER</span>
              </div>
            </div>

            <div class="mm-play-group">
              <button type="button" class="mm-cta-play" id="btn-local" data-mm-nav="local">
                <span class="mm-cta-bar" aria-hidden="true"></span>
                <span class="mm-cta-content">
                  <span class="mm-cta-title">JOUER</span>
                  <span class="mm-cta-sub">MULTIJOUEUR</span>
                </span>
                <span class="mm-cta-arrow" aria-hidden="true">→</span>
              </button>

              <button type="button" class="mm-freeplay-link" id="btn-freeplay" data-mm-nav="freeplay">
                <span>MODE FREEPLAY · ENTRAÎNEMENT SOLO</span>
                <span class="mm-link-arrow" aria-hidden="true">→</span>
              </button>
            </div>

            <nav class="mm-secondary-nav" aria-label="Sections du jeu">
              <button type="button" class="mm-sec-btn" id="btn-how-to-play" data-mm-nav="how-to-play">
                <span class="mm-sec-bar" aria-hidden="true"></span>
                <span class="mm-sec-label">COMMENT JOUER</span>
              </button>
              <button type="button" class="mm-sec-btn" id="btn-stats" data-mm-nav="stats">
                <span class="mm-sec-bar" aria-hidden="true"></span>
                <span class="mm-sec-label">STATISTIQUES</span>
              </button>
              <button type="button" class="mm-sec-btn" id="btn-achievements" data-mm-nav="achievements">
                <span class="mm-sec-bar" aria-hidden="true"></span>
                <span class="mm-sec-label">SUCCÈS</span>
              </button>
            </nav>
          </aside>

          <!-- 3. Zone droite ouverte laissant respirer le diorama pixel-art -->
          <div class="mm-right-stage" aria-hidden="true"></div>
        </div>
      </div>
    </div>
  `;
}

function loadSprite(src: string): HTMLImageElement {
  const img = new Image();
  img.src = src;
  return img;
}

function isSpriteReady(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return Boolean(img && img.complete && img.naturalWidth > 0);
}

/**
 * Découpe et dessine une frame d'une spritesheet (Seeker ou Emote) selon sa spec.
 */
function drawSheetFrame(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement,
  spec: { cols: number; frameWidth: number; frameHeight: number; frameCount: number; fps?: number },
  elapsedMs: number,
  destCenterX: number,
  destBottomY: number,
  destHeight: number
): void {
  const fps = spec.fps ?? 8;
  const frameMs = 1000 / fps;
  const frameIndex = Math.floor(Math.max(0, elapsedMs) / frameMs) % spec.frameCount;
  const col = frameIndex % spec.cols;
  const row = Math.floor(frameIndex / spec.cols);

  const scale = destHeight / spec.frameHeight;
  const drawW = Math.round(spec.frameWidth * scale);
  const drawH = Math.round(spec.frameHeight * scale);
  const drawX = Math.round(destCenterX - drawW * 0.5);
  const drawY = Math.round(destBottomY - drawH);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    sheet,
    col * spec.frameWidth,
    row * spec.frameHeight,
    spec.frameWidth,
    spec.frameHeight,
    drawX,
    drawY,
    drawW,
    drawH
  );
  ctx.restore();
}

function initDioramaCanvas(viewMain: HTMLElement): void {
  const canvas = document.getElementById('main-menu-diorama') as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Spritesheets du Seeker selon hunterSpriteSpecs.ts
  const seekerSpecs: Record<'move_e' | 'move_w' | 'idle_right' | 'idle_left', HunterSpriteSpec> = {
    move_e: HUNTER_SPRITE_SPECS.move_e,
    move_w: HUNTER_SPRITE_SPECS.move_w,
    idle_right: HUNTER_SPRITE_SPECS.idle_right,
    idle_left: HUNTER_SPRITE_SPECS.idle_left,
  };

  const seekerSheets: Record<keyof typeof seekerSpecs, HTMLImageElement> = {
    move_e: loadSprite(seekerSpecs.move_e.assetPath),
    move_w: loadSprite(seekerSpecs.move_w.assetPath),
    idle_right: loadSprite(seekerSpecs.idle_right.assetPath),
    idle_left: loadSprite(seekerSpecs.idle_left.assetPath),
  };

  // Sprites unitaires des Props du jeu
  const vendingImg = loadSprite('/assets/props/vending_machine/Vending_machine_F.png');
  const chairImg = loadSprite('/assets/props/chair/Chair_F.png');
  const bagImg = loadSprite('/assets/props/bag/Bag_F.png');
  const canImg = loadSprite('/assets/props/can/Can_F.png');

  // Emotes animées (EmoteAmazed.png et EmoteDance.png depuis DEFAULT_HUNTER_EMOTES)
  const amazedEmoteDef: HunterEmoteDefinition =
    DEFAULT_HUNTER_EMOTES.find((e) => e.id === 'amazed') ?? {
      id: 'amazed',
      name: 'Étonné',
      assetPath: '/assets/emotes/EmoteAmazed.png',
      cols: 3,
      rows: 3,
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 7,
      previewFrame: 4,
      fps: 8,
    };
  const danceEmoteDef: HunterEmoteDefinition =
    DEFAULT_HUNTER_EMOTES.find((e) => e.id === 'dance') ?? {
      id: 'dance',
      name: 'Danse',
      assetPath: '/assets/emotes/EmoteDance.png',
      cols: 4,
      rows: 4,
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 15,
      previewFrame: 10,
      fps: 10,
    };

  const emoteDefs = [amazedEmoteDef, danceEmoteDef];
  const emoteSheets = new Map<string, HTMLImageElement>([
    [amazedEmoteDef.id, loadSprite(amazedEmoteDef.assetPath)],
    [danceEmoteDef.id, loadSprite(danceEmoteDef.assetPath)],
  ]);

  let rafId: number | null = null;
  let width = window.innerWidth;
  let height = window.innerHeight;

  function resize(): void {
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function drawShadow(cx: number, cy: number, rx: number, ry: number, alpha = 0.45): void {
    ctx!.save();
    ctx!.fillStyle = `rgba(0, 0, 0, ${alpha})`;
    ctx!.beginPath();
    ctx!.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx!.fill();
    ctx!.restore();
  }

  /**
   * Calcule l'état de patrouille du Seeker :
   * Cycle de 14 secondes :
   * - [0.0s .. 4.2s] : marche vers la droite (move_e)
   * - [4.2s .. 7.0s] : s'arrête et scrute les objets à droite puis à gauche (idle_right -> idle_left)
   * - [7.0s .. 11.2s] : repart vers la gauche (move_w)
   * - [11.2s .. 14.0s] : s'arrête et scrute autour de lui (idle_left -> idle_right)
   */
  function computeSeekerPatrol(
    tSec: number,
    minX: number,
    maxX: number
  ): {
    x: number;
    animKey: keyof typeof seekerSpecs;
    facingDir: 1 | -1;
    phaseElapsedMs: number;
    bobY: number;
  } {
    const cycleDur = 14.0;
    const c = tSec % cycleDur;

    if (c < 4.2) {
      const p = c / 4.2;
      // Interpolation douce aux extrémités
      const smooth = p * p * (3 - 2 * p);
      return {
        x: minX + (maxX - minX) * smooth,
        animKey: 'move_e',
        facingDir: 1,
        phaseElapsedMs: c * 1000,
        bobY: 0,
      };
    }

    if (c < 7.0) {
      const pauseElapsed = c - 4.2;
      // Regarde à droite vers la canette/chaise, puis jette un coup d'œil à gauche
      const lookLeft = pauseElapsed > 1.65;
      return {
        x: maxX,
        animKey: lookLeft ? 'idle_left' : 'idle_right',
        facingDir: lookLeft ? -1 : 1,
        phaseElapsedMs: pauseElapsed * 1000,
        bobY: Math.sin(pauseElapsed * 3.2) * 1.5,
      };
    }

    if (c < 11.2) {
      const moveElapsed = c - 7.0;
      const p = moveElapsed / 4.2;
      const smooth = p * p * (3 - 2 * p);
      return {
        x: maxX - (maxX - minX) * smooth,
        animKey: 'move_w',
        facingDir: -1,
        phaseElapsedMs: moveElapsed * 1000,
        bobY: 0,
      };
    }

    const pauseElapsed = c - 11.2;
    const lookRight = pauseElapsed > 1.5;
    return {
      x: minX,
      animKey: lookRight ? 'idle_right' : 'idle_left',
      facingDir: lookRight ? 1 : -1,
      phaseElapsedMs: pauseElapsed * 1000,
      bobY: Math.sin(pauseElapsed * 3.2) * 1.5,
    };
  }

  function renderFrame(timestamp: number): void {
    if (!ctx) return;
    const t = timestamp * 0.001;

    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = false;

    // 1. Fond architectural sombre (#131316) + perspective tactique sur la scène droite
    ctx.fillStyle = '#131316';
    ctx.fillRect(0, 0, width, height);

    const stageX = width * 0.68;
    const stageY = height * 0.56;

    // Halo d'ambiance violet/cyan derrière la scène droite
    const ambientGrad = ctx.createRadialGradient(
      stageX,
      stageY,
      20,
      stageX,
      stageY,
      Math.max(width, height) * 0.52
    );
    ambientGrad.addColorStop(0, 'rgba(170, 91, 240, 0.14)');
    ambientGrad.addColorStop(0.45, 'rgba(56, 189, 248, 0.07)');
    ambientGrad.addColorStop(1, 'rgba(19, 19, 22, 0)');
    ctx.fillStyle = ambientGrad;
    ctx.fillRect(0, 0, width, height);

    // Grille de sol tactique discrète
    const floorTop = height * 0.44;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.lineWidth = 1;

    const rows = 9;
    for (let i = 0; i <= rows; i++) {
      const ratio = i / rows;
      const y = floorTop + Math.pow(ratio, 1.35) * (height - floorTop);
      ctx.beginPath();
      ctx.moveTo(width * 0.25, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const cols = 12;
    const vanishX = width * 0.58;
    for (let i = -3; i <= cols; i++) {
      const bottomX = width * 0.3 + (i / cols) * (width * 0.85);
      ctx.beginPath();
      ctx.moveTo(vanishX + (bottomX - vanishX) * 0.28, floorTop);
      ctx.lineTo(bottomX, height);
      ctx.stroke();
    }
    ctx.restore();

    // Échelle pixel-art responsive (garantit un rendu net en 1280x720 comme en 1920x1080)
    const unit = Math.max(2.6, Math.min(4.4, Math.min(width / 390, height / 225)));

    // Positions des Props sur la scène droite (dégagées du couloir de patrouille du Seeker)
    const vScale = unit * 1.15;
    const vw = Math.round(48 * vScale);
    const vh = Math.round(64 * vScale);
    const vx = Math.round(width * 0.78 - vw * 0.5);
    const vy = Math.round(height * 0.5 - vh);

    const cScale = unit * 0.95;
    const cw = Math.round(32 * cScale);
    const ch = Math.round(64 * cScale);
    const cx = Math.round(width * 0.61 - cw * 0.5);
    const cy = Math.round(height * 0.54 - ch);

    const bScale = unit * 0.92;
    const bw = Math.round(32 * bScale);
    const bh = Math.round(32 * bScale);
    const bx = Math.round(width * 0.86 - bw * 0.5);
    const by = Math.round(height * 0.57 - bh);

    const kScale = unit * 0.92;
    const kw = Math.round(32 * kScale);
    const kh = Math.round(32 * kScale);
    const canBaseX = Math.round(width * 0.855 - kw * 0.5);
    const canBaseY = Math.round(height * 0.75 - kh);

    // Cycle de taunt / sursaut des props toutes les 3.8 secondes (alterne entre Canette, Sac et Chaise)
    const tauntPeriod = 3.8;
    const tauntIndex = Math.floor(t / tauntPeriod) % 3; // 0: can, 1: bag, 2: chair
    const tauntLocal = t % tauntPeriod;
    const isJumping = tauntLocal < 0.72;
    const jumpPhase = isJumping ? (tauntLocal / 0.72) * Math.PI : 0;
    const jumpOffset = isJumping ? -Math.abs(Math.sin(jumpPhase * 2)) * (9 * (unit / 3.2)) : 0;
    const jumpTilt = isJumping ? Math.sin(jumpPhase * 4) * 0.13 : 0;

    // 2. Plan arrière : Distributeur automatique (Vending Machine)
    if (isSpriteReady(vendingImg)) {
      drawShadow(vx + vw * 0.5, vy + vh - 4, vw * 0.52, 10, 0.5);
      ctx.drawImage(vendingImg, vx, vy, vw, vh);
    }

    // 3. Plan intermédiaire gauche : Chaise (sursaute quand tauntIndex === 2)
    if (isSpriteReady(chairImg)) {
      const hop = tauntIndex === 2 ? jumpOffset : 0;
      const tilt = tauntIndex === 2 ? jumpTilt : 0;
      drawShadow(cx + cw * 0.5, cy + ch - 3, cw * 0.46, 8, 0.45);
      ctx.save();
      ctx.translate(cx + cw * 0.5, cy + ch * 0.5 + hop);
      ctx.rotate(tilt);
      ctx.drawImage(chairImg, -cw * 0.5, -ch * 0.5, cw, ch);
      ctx.restore();
    }

    // 4. Plan intermédiaire droit : Sac à dos (sursaute quand tauntIndex === 1)
    if (isSpriteReady(bagImg)) {
      const hop = tauntIndex === 1 ? jumpOffset : 0;
      const tilt = tauntIndex === 1 ? jumpTilt : 0;
      drawShadow(bx + bw * 0.5, by + bh - 2, bw * 0.44, 6, 0.42);
      ctx.save();
      ctx.translate(bx + bw * 0.5, by + bh * 0.5 + hop);
      ctx.rotate(tilt);
      ctx.drawImage(bagImg, -bw * 0.5, -bh * 0.5, bw, bh);
      ctx.restore();
    }

    // 5. Seeker animé en patrouille (couloir dégagé entre 54% et 70% de la largeur, sans chevaucher la canette)
    const patrolMinX = width * 0.54;
    const patrolMaxX = width * 0.7;
    const patrol = computeSeekerPatrol(t, patrolMinX, patrolMaxX);
    const seekerFootY = Math.round(height * 0.69 + patrol.bobY);
    const seekerDrawH = Math.round(64 * unit * 1.15);

    // Faisceau de lampe torche directionnel émis par le Seeker
    const beamOriginX = patrol.x + patrol.facingDir * (seekerDrawH * 0.16);
    const beamOriginY = seekerFootY - seekerDrawH * 0.46;
    const beamLen = width * 0.2;
    const beamEndX = beamOriginX + patrol.facingDir * beamLen;
    const beamSweepY = Math.sin(t * 2.1) * 18;

    ctx.save();
    const beamGrad = ctx.createLinearGradient(
      beamOriginX,
      beamOriginY,
      beamEndX,
      beamOriginY + beamSweepY
    );
    beamGrad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
    beamGrad.addColorStop(0.55, 'rgba(56, 189, 248, 0.07)');
    beamGrad.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(beamOriginX, beamOriginY);
    ctx.lineTo(beamEndX, beamOriginY - 56 + beamSweepY);
    ctx.lineTo(beamEndX, beamOriginY + 64 + beamSweepY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawShadow(patrol.x, seekerFootY - 4, seekerDrawH * 0.28, 9, 0.52);

    const activeSeekerSheet = seekerSheets[patrol.animKey];
    const activeSeekerSpec = seekerSpecs[patrol.animKey];
    if (isSpriteReady(activeSeekerSheet)) {
      drawSheetFrame(
        ctx,
        activeSeekerSheet,
        activeSeekerSpec,
        patrol.phaseElapsedMs,
        patrol.x,
        seekerFootY,
        seekerDrawH
      );
    }

    // 6. Premier plan : Canette (sursaute quand tauntIndex === 0)
    if (isSpriteReady(canImg)) {
      const hop = tauntIndex === 0 ? jumpOffset : 0;
      const tilt = tauntIndex === 0 ? jumpTilt : 0;
      const shadowShrink = 1 - Math.abs(hop) / 48;
      drawShadow(
        canBaseX + kw * 0.5,
        canBaseY + kh - 3,
        kw * 0.38 * shadowShrink,
        6 * shadowShrink,
        0.42 * shadowShrink
      );
      ctx.save();
      ctx.translate(canBaseX + kw * 0.5, canBaseY + kh * 0.5 + hop);
      ctx.rotate(tilt);
      ctx.drawImage(canImg, -kw * 0.5, -kh * 0.5, kw, kh);
      ctx.restore();
    }

    // 7. Ondes "sifflet" + Emote animée (EmoteAmazed / EmoteDance) au-dessus du prop qui nargue
    if (tauntLocal < 1.45) {
      const targetCenterX =
        tauntIndex === 0
          ? canBaseX + kw * 0.5
          : tauntIndex === 1
          ? bx + bw * 0.5
          : cx + cw * 0.5;
      const targetTopY =
        tauntIndex === 0 ? canBaseY : tauntIndex === 1 ? by : cy;

      // Ondes sonores concentriques
      if (tauntLocal < 1.1) {
        const waveP = tauntLocal / 1.1;
        const radius = 12 + waveP * 54;
        const alpha = (1 - waveP) * 0.5;
        ctx.save();
        ctx.strokeStyle = `rgba(170, 91, 240, ${alpha.toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(targetCenterX, targetTopY + 14, radius, 0, Math.PI * 2);
        ctx.stroke();

        if (waveP > 0.22) {
          const waveP2 = (waveP - 0.22) / 0.78;
          ctx.strokeStyle = `rgba(56, 189, 248, ${((1 - waveP2) * 0.38).toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(targetCenterX, targetTopY + 14, 8 + waveP2 * 44, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Emote animée au-dessus du prop (alterne entre EmoteAmazed et EmoteDance)
      const emoteChoice = emoteDefs[Math.floor(t / tauntPeriod) % emoteDefs.length];
      const emoteSheet = emoteSheets.get(emoteChoice.id);
      if (isSpriteReady(emoteSheet)) {
        const emoteSize = Math.round(38 * (unit / 3.0));
        const floatY = targetTopY - 8 - Math.min(1, tauntLocal / 0.35) * 8;
        drawSheetFrame(
          ctx,
          emoteSheet,
          emoteChoice,
          tauntLocal * 1000,
          targetCenterX,
          floatY,
          emoteSize
        );
      }
    }

    rafId = window.requestAnimationFrame(renderFrame);
  }

  function isMainMenuVisible(): boolean {
    return (
      !document.hidden &&
      !viewMain.classList.contains('hidden') &&
      viewMain.classList.contains('active')
    );
  }

  function startLoop(): void {
    if (rafId !== null || !isMainMenuVisible()) return;
    resize();
    rafId = window.requestAnimationFrame(renderFrame);
  }

  function stopLoop(): void {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  window.addEventListener('resize', () => {
    if (isMainMenuVisible()) {
      resize();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (isMainMenuVisible()) {
      startLoop();
    } else {
      stopLoop();
    }
  });

  const observer = new MutationObserver(() => {
    if (isMainMenuVisible()) {
      startLoop();
    } else {
      stopLoop();
    }
  });
  observer.observe(viewMain, { attributes: true, attributeFilter: ['class'] });

  startLoop();
}

async function refreshFriendsNotifBadge(): Promise<void> {
  const badge = document.getElementById('friends-notif-badge');
  if (!badge) return;

  if (!isAuthenticated()) {
    badge.hidden = true;
    badge.textContent = '0';
    return;
  }

  try {
    const overview = await fetchFriendsOverview();
    const count = overview.incomingRequests?.length ?? 0;
    badge.textContent = String(count);
    badge.hidden = count <= 0;
  } catch {
    badge.hidden = true;
  }
}

export function initMainMenu(): void {
  const viewMain = document.getElementById('view-main');
  if (!viewMain) return;

  const viewLocal = document.getElementById('view-local');
  const viewGame = document.getElementById('view-game');
  const viewSettings = document.getElementById('view-settings');
  const viewProfile = document.getElementById('view-profile');
  const viewHowToPlay = document.getElementById('view-how-to-play');
  const viewFriends = document.getElementById('view-friends');
  const viewStats = document.getElementById('view-stats');
  const viewAchievements = document.getElementById('view-achievements');

  // Délégation d'événements centralisée 100 % souris sur #view-main
  viewMain.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const navBtn = target.closest<HTMLElement>('[data-mm-nav]');
    if (!navBtn) return;

    switch (navBtn.dataset.mmNav) {
      case 'local':
        switchView(viewMain, viewLocal);
        break;
      case 'freeplay':
        networkManager.send(MessageType.CREATE_ROOM, { isFreeplay: true });
        if (viewGame) switchView(viewMain, viewGame);
        break;
      case 'how-to-play':
        switchView(viewMain, viewHowToPlay);
        break;
      case 'stats':
        switchView(viewMain, viewStats);
        break;
      case 'achievements':
        switchView(viewMain, viewAchievements);
        break;
      case 'profile':
        switchView(viewMain, viewProfile);
        break;
      case 'friends':
        switchView(viewMain, viewFriends);
        break;
      case 'settings':
        switchView(viewMain, viewSettings);
        break;
    }
  });

  // Synchronisation du badge de notifications d'amis dans la top-bar
  onAuthChange(() => {
    void refreshFriendsNotifBadge();
  });
  const menuObserver = new MutationObserver(() => {
    if (viewMain.classList.contains('active') && !viewMain.classList.contains('hidden')) {
      void refreshFriendsNotifBadge();
    }
  });
  menuObserver.observe(viewMain, { attributes: true, attributeFilter: ['class'] });
  void refreshFriendsNotifBadge();

  initDioramaCanvas(viewMain);

  setTimeout(() => viewMain.classList.add('active'), 100);
}
