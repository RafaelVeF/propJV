import { switchView } from './viewManager';
import { HUNTER_SPRITE_SPECS } from '../game/render/hunterSpriteSpecs';

export function renderHowToPlay(): string {
  return `
    <!-- Vue 6 : Comment Jouer — Duel Asymétrique HUNTERS (Violet) vs PROPS (Cyan) -->
    <div id="view-how-to-play" class="view howto-fullscreen-view hidden">
      <!-- 1. Barre supérieure unifiée -->
      <header class="local-top-bar">
        <div class="local-top-inner">
          <div class="local-top-left">
            <button type="button" class="local-back-btn" id="btn-back-main-from-how-to-play">
              ← RETOUR
            </button>
          </div>

          <h1 class="local-brand-title">
            <span class="purple-text">GUIDE TACTIQUE</span>
            <span class="stats-header-sep">·</span>
            <span class="blue-text">COMMENT JOUER</span>
          </h1>

          <div class="local-top-right">
            <span class="local-player-tag is-auth">30S CACHETTE · 3M30 CHASSE</span>
          </div>
        </div>
      </header>

      <!-- 2. Scène de duel asymétrique HUNTERS vs PROPS -->
      <main class="howto-stage">
        <div class="howto-duel-grid">
          <!-- CAMP 1 : HUNTERS / SEEKERS (Accent Violet) -->
          <section class="howto-camp howto-camp-hunter" aria-label="Camp Hunters">
            <div class="howto-camp-header">
              <div class="howto-camp-title-block">
                <span class="howto-camp-tag tag-hunter">CAMP TRAQUEURS · 50% DE L'ÉQUIPE</span>
                <h2 class="howto-camp-name purple-text">LES HUNTERS</h2>
                <p class="howto-camp-motto">Débusquez et éliminez chaque imposteur avant la fin du chronomètre.</p>
              </div>

              <div class="howto-sprite-showcase showcase-hunter">
                <canvas id="howto-hunter-canvas" width="96" height="96" aria-label="Sprite Seeker"></canvas>
                <div class="howto-weapons-strip" aria-label="Arsenal du Hunter">
                  <img src="/assets/weapons/rifle.png" alt="Fusil" class="pixel-sprite howto-weapon-icon" title="Fusil" />
                  <img src="/assets/weapons/wave_gun.png" alt="Canon à ondes" class="pixel-sprite howto-weapon-icon" title="Canon à ondes" />
                  <img src="/assets/weapons/launcher.png" alt="Lanceur" class="pixel-sprite howto-weapon-icon" title="Lanceur" />
                </div>
              </div>
            </div>

            <div class="howto-points-list">
              <div class="howto-point-item">
                <span class="howto-point-num purple-text">01</span>
                <div class="howto-point-body">
                  <h3 class="howto-point-title">VERROUILLAGE INITIAL (30 SEC)</h3>
                  <p class="howto-point-desc">
                    Au coup d'envoi, votre vision est masquée pendant <strong>30 secondes</strong> le temps que les Props prennent position dans le complexe.
                  </p>
                </div>
              </div>

              <div class="howto-point-item">
                <span class="howto-point-num purple-text">02</span>
                <div class="howto-point-body">
                  <h3 class="howto-point-title">ARSENAL TACTIQUE (<kbd class="keycap">1</kbd> <kbd class="keycap">2</kbd> <kbd class="keycap">3</kbd>)</h3>
                  <p class="howto-point-desc">
                    Alternez entre le <strong>Fusil</strong> à distance, le <strong>Canon à ondes</strong> au corps-à-corps et le <strong>Lanceur</strong> explosif (<kbd class="keycap">CLIC GAUCHE</kbd> pour tirer, <kbd class="keycap">R</kbd> pour recharger).
                  </p>
                </div>
              </div>

              <div class="howto-point-item">
                <span class="howto-point-num purple-text">03</span>
                <div class="howto-point-body">
                  <h3 class="howto-point-title">TRAQUE ACOUSTIQUE &amp; VISUELLE</h3>
                  <p class="howto-point-desc">
                    Repérez les objets mal alignés ou en surnombre et tendez l'oreille : les sifflets et railleries des Props trahissent leur position.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <!-- Séparateur central VS -->
          <div class="howto-vs-divider" aria-hidden="true">
            <span class="howto-vs-line"></span>
            <span class="howto-vs-badge">VS</span>
            <span class="howto-vs-line"></span>
          </div>

          <!-- CAMP 2 : PROPS / HIDERS (Accent Cyan) -->
          <section class="howto-camp howto-camp-prop" aria-label="Camp Props">
            <div class="howto-camp-header">
              <div class="howto-camp-title-block">
                <span class="howto-camp-tag tag-prop">CAMP CAMÉLÉONS · 50% DE L'ÉQUIPE</span>
                <h2 class="howto-camp-name blue-text">LES PROPS</h2>
                <p class="howto-camp-motto">Fondez-vous dans le décor, narguez les chasseurs et survivez jusqu'à 00:00.</p>
              </div>

              <div class="howto-sprite-showcase showcase-prop">
                <div class="howto-props-trio">
                  <img src="/assets/props/chair/Chair_F.png" alt="Chaise" class="pixel-sprite howto-prop-img prop-sm" />
                  <img src="/assets/props/vending_machine/Vending_machine_F.png" alt="Distributeur" class="pixel-sprite howto-prop-img prop-lg" />
                  <img src="/assets/props/can/Can_F.png" alt="Canette" class="pixel-sprite howto-prop-img prop-xs" />
                </div>
              </div>
            </div>

            <div class="howto-points-list">
              <div class="howto-point-item">
                <span class="howto-point-num blue-text">01</span>
                <div class="howto-point-body">
                  <h3 class="howto-point-title">ROUE DE MÉTAMORPHOSE (<kbd class="keycap">E</kbd>)</h3>
                  <p class="howto-point-desc">
                    Maintenez <kbd class="keycap">E</kbd> pour choisir un objet du décor. Un petit objet (Canette) est discret mais fragile ; un grand objet (Distributeur) encaisse davantage de dégâts.
                  </p>
                </div>
              </div>

              <div class="howto-point-item">
                <span class="howto-point-num blue-text">02</span>
                <div class="howto-point-body">
                  <h3 class="howto-point-title">IMMERSION &amp; VERROUILLAGE (<kbd class="keycap">ESPACE</kbd>)</h3>
                  <p class="howto-point-desc">
                    Alignez-vous contre un mur ou une rangée de mobilier et verrouillez votre position pour devenir indiscernable du vrai décor.
                  </p>
                </div>
              </div>

              <div class="howto-point-item">
                <span class="howto-point-num blue-text">03</span>
                <div class="howto-point-body">
                  <h3 class="howto-point-title">PROVOCATION &amp; BONUS D'OR (<kbd class="keycap">R</kbd>)</h3>
                  <p class="howto-point-desc">
                    Déclenchez vos <strong>Taunts</strong> en pleine chasse pour narguer les Hunters : chaque provocation réussie augmente votre gain de <strong>pièces d'or</strong> en fin de manche !
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  `;
}

export function initHowToPlay(): void {
  const viewMain = document.getElementById('view-main');
  const viewHowToPlay = document.getElementById('view-how-to-play');
  const btnBackMainFromHowToPlay = document.getElementById('btn-back-main-from-how-to-play');
  const hunterCanvas = document.getElementById('howto-hunter-canvas') as HTMLCanvasElement | null;

  if (btnBackMainFromHowToPlay) {
    btnBackMainFromHowToPlay.addEventListener('click', () => switchView(viewHowToPlay, viewMain));
  }

  // Animation pixel-art de IdleHuntRight.png dans la vitrine Hunter (en pause hors de la vue)
  if (hunterCanvas && viewHowToPlay) {
    const ctx = hunterCanvas.getContext('2d');
    const spec = HUNTER_SPRITE_SPECS.idle_right;
    const sheet = new Image();
    sheet.src = spec.assetPath;
    let rafId: number | null = null;

    const renderHunterPreview = (ts: number) => {
      if (!ctx) return;
      ctx.clearRect(0, 0, hunterCanvas.width, hunterCanvas.height);
      ctx.imageSmoothingEnabled = false;

      if (sheet.complete && sheet.naturalWidth > 0) {
        const frameIndex = Math.floor(ts / (1000 / spec.fps)) % spec.frameCount;
        const col = frameIndex % spec.cols;
        const row = Math.floor(frameIndex / spec.cols);
        ctx.drawImage(
          sheet,
          col * spec.frameWidth,
          row * spec.frameHeight,
          spec.frameWidth,
          spec.frameHeight,
          8,
          8,
          80,
          80
        );
      }

      rafId = requestAnimationFrame(renderHunterPreview);
    };

    const syncLoop = () => {
      const visible =
        viewHowToPlay.classList.contains('active') && !viewHowToPlay.classList.contains('hidden');
      if (visible && rafId === null) {
        rafId = requestAnimationFrame(renderHunterPreview);
      } else if (!visible && rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const observer = new MutationObserver(syncLoop);
    observer.observe(viewHowToPlay, { attributes: true, attributeFilter: ['class'] });
    syncLoop();
  }
}
