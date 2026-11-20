import { WEAPON_ORDER, WEAPONS } from '@prop-hunt/shared';

/** Structure HTML de l'écran de jeu (canvas + HUD unifié + overlays) */
export function renderGameView(): string {
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

      <!-- Haut Centre : Chrono + Phase + Compteur Survivants -->
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

      <!-- Menu Pause (regroupe Audio & Quitter la partie) -->
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
            : '';
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
        [ZQSD] Bouger • [T] Chat • [Échap] Menu • [Clic Minimap] Plan
      </div>
    </div>
  `;
}
