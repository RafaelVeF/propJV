import { WEAPON_ORDER, WEAPONS } from '@prop-hunt/shared';

/** Structure HTML de l'écran de jeu (canvas + éléments d'interface superposés) */
export function renderGameView(): string {
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
    </div>
  `;
}
