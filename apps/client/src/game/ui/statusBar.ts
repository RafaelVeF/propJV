import { PlayerRole } from '@prop-hunt/shared';
import { networkManager } from '../../network/networkManager';
import type { GameState } from '../state';

/** Bandeau en haut à droite : état de la connexion et rappel des touches selon le rôle */
export function updateStatusBar(statusEl: HTMLElement | null, state: GameState): void {
  if (!statusEl) return;
  if (!networkManager.isConnected) {
    statusEl.innerText = 'WS: Déconnecté';
    statusEl.style.color = '#f87171';
    return;
  }

  if (state.spectator.active) {
    statusEl.innerText = 'WS: Connecté | Mode spectateur';
  } else if (state.localPlayerRole === PlayerRole.HUNTER) {
    statusEl.innerText = 'WS: Connecté | Clic: Attaquer | 1/2/3 ou Molette: Arme | R: Recharger';
  } else {
    statusEl.innerText = 'WS: Connecté | E: Changer Prop | R: Tourner Prop | K: Dégâts (-15)';
  }
  statusEl.style.color = '#4ade80';
}
