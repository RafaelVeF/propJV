import {
  DEFAULT_PROPS,
  GamePhase,
  MessageType,
  PlayerRole,
  WeaponType,
  getPlayerHurtbox,
  type GrenadeExplodedPayload,
  type HitboxTogglePayload,
  type KickedPayload,
  type LobbyStatePayload,
  type Player,
  type PlayerDiedPayload,
  type PlayerHitPayload,
  type PropDefinition,
  type RoundEndPayload,
  type RoundStartPayload,
  type RoundTimerTickPayload,
  type ShotFiredPayload,
  type WeaponStatePayload,
  type ChatMessagePayload
} from '@prop-hunt/shared';
import { networkManager } from '../../network/networkManager';
import { getPlayerRenderInfo, type GameState } from '../state';
import type { CombatEffects } from '../combat/combatEffects';
import type { DroneController } from '../combat/droneController';
import type { WeaponController } from '../combat/weaponController';
import type { SpectatorController } from '../spectator/spectatorController';
import type { ChatManager } from '../ui/ChatManager';
import type { RoundHud } from '../ui/roundHud';
import type { VisualEffectsManager } from '../ui/VisualEffects';

export interface GameNetworkDeps {
  state: GameState;
  weapons: WeaponController;
  effects: CombatEffects;
  drones: DroneController;
  vfx: VisualEffectsManager;
  chat: ChatManager;
  spectator: SpectatorController;
  roundHud: RoundHud;
  /** Rafraîchit le bandeau de statut (connexion + touches) */
  updateStatus: () => void;
  /** Revient à l'écran du salon. onlyIfInGame : uniquement si l'écran de jeu est affiché */
  returnToLobby: (onlyIfInGame: boolean) => void;
  /** Nettoie l'écran de jeu et ramène au menu principal si expulsé (/kick) */
  onKicked: (reason?: string) => void;
}

/** Abonne l'écran de jeu à tous les messages du serveur */
export function registerGameNetworkHandlers(deps: GameNetworkDeps): void {
  const { state, weapons, effects, drones, vfx, chat, spectator, roundHud, updateStatus, returnToLobby, onKicked } = deps;
  const { player, otherPlayers } = state;

  networkManager.onOpen(updateStatus);
  networkManager.onClose(updateStatus);
  updateStatus();

  // --- CHAT & ADMINISTRATION ---

  networkManager.on<ChatMessagePayload>(MessageType.CHAT_MESSAGE, (payload) => {
    chat.addMessage(payload);
  });

  networkManager.on<HitboxTogglePayload>(MessageType.HITBOX_TOGGLE, (payload) => {
    state.showHitbox = payload?.enabled !== undefined ? payload.enabled : !state.showHitbox;
  });

  networkManager.on<KickedPayload>(MessageType.KICKED, (payload) => {
    onKicked(payload?.reason);
  });

  // --- JOUEURS ---

  networkManager.on(MessageType.WELCOME, (payload) => {
    if (payload.player?.name) {
      state.localPlayerName = payload.player.name;
    }
    if (payload.player.currentProp) {
      player.currentProp = payload.player.currentProp;
    }
    if ('variantIndex' in payload.player && payload.player.variantIndex !== undefined) {
      player.variantIndex = payload.player.variantIndex;
    }
    player.health = payload.player.health ?? player.currentProp.health;
    player.maxHealth = payload.player.maxHealth ?? player.currentProp.health;
    player.lastHitTimestamp = payload.player.lastHitTimestamp ?? 0;
    console.log('[WS] Bienvenue ! Mon ID joueur :', networkManager.localPlayerId, `(HP: ${player.health}/${player.maxHealth})`);
  });

  networkManager.on(MessageType.PLAYER_JOINED, (payload) => {
    const newP: Player = payload.player;
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
  });

  networkManager.on(MessageType.PLAYER_LEFT, (payload) => {
    otherPlayers.delete(payload.playerId);
    effects.hunterAim.delete(payload.playerId);
    drones.delete(payload.playerId);
    console.log('[WS] Joueur déconnecté :', payload.playerId);
    if (spectator.isActive && payload.playerId === state.spectator.targetId) spectator.cycleTarget(1);
  });

  networkManager.on(MessageType.TRANSFORM_PROP, (payload) => {
    const newProp: PropDefinition | undefined = payload.currentProp || DEFAULT_PROPS.find(p =>
      (payload.propId !== undefined && p.id === payload.propId) ||
      (payload.spriteKey && p.internalName === payload.spriteKey)
    );
    if (!newProp) return;

    if (payload.playerId === networkManager.localPlayerId) {
      player.currentProp = newProp;
      if (payload.variantIndex !== undefined) {
        player.variantIndex = payload.variantIndex;
      }
      player.maxHealth = newProp.health;
      if (player.health > newProp.health) {
        player.health = newProp.health;
      }
      vfx.spawnTransformPoof(player.x, player.y);
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
      vfx.spawnTransformPoof(op.x, op.y);
    }
  });

  networkManager.on<PlayerHitPayload & { playerId?: string }>(MessageType.PLAYER_HIT, (payload) => {
    const targetId = payload.targetPlayerId || payload.playerId;
    const hitTime = payload.lastHitTimestamp || Date.now();
    const victim = targetId ? getPlayerRenderInfo(state, targetId, networkManager.localPlayerId) : null;
    if (victim && payload.damage > 0) {
      const box = getPlayerHurtbox(victim.x, victim.y, victim.prop, victim.variantIndex);
      effects.addDamageNumber(victim.x, box.y - 4, payload.damage, targetId === networkManager.localPlayerId ? '#f87171' : '#fde68a');
    }
    if (targetId === networkManager.localPlayerId) {
      player.lastHitTimestamp = hitTime;
      if (payload.damage > 0) vfx.triggerDamageFlash();
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
  });

  networkManager.on(MessageType.GAME_STATE_UPDATE, (payload) => {
    const playersList = payload.players as Player[];
    const currentIds = new Set<string>();
    playersList.forEach(p => {
      currentIds.add(p.id);
      if (p.id === networkManager.localPlayerId) {
        player.targetX = p.x;
        player.targetY = p.y;
        if (p.name) state.localPlayerName = p.name;
        if (p.health !== undefined) player.health = p.health;
        if ('maxHealth' in p && p.maxHealth !== undefined) player.maxHealth = p.maxHealth;
        if ('lastHitTimestamp' in p && p.lastHitTimestamp !== undefined) player.lastHitTimestamp = p.lastHitTimestamp;
        if ('currentProp' in p && p.currentProp) {
          player.currentProp = p.currentProp;
        }
        if ('variantIndex' in p && p.variantIndex !== undefined) {
          player.variantIndex = p.variantIndex;
        }
        // Synchronisation spectateur & changement de rôle (/swap)
        if (p.role === PlayerRole.SPECTATOR && !spectator.isActive && state.currentPhase !== GamePhase.LOBBY) {
          spectator.enter();
        } else if (p.role !== PlayerRole.SPECTATOR) {
          if (spectator.isActive) {
            spectator.exit();
          }
          if (p.role !== state.localPlayerRole) {
            state.localPlayerRole = p.role;
            weapons.updateHud();
            updateStatus();
            roundHud.syncBlindfold(state.currentPhase, state.localPlayerRole);
          }
        }
      } else {
        const propDef = ('currentProp' in p && p.currentProp) ? p.currentProp : DEFAULT_PROPS[0];
        const pVariantIndex = ('variantIndex' in p && p.variantIndex !== undefined) ? p.variantIndex : 0;
        const op = otherPlayers.get(p.id);
        if (op) {
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
    spectator.ensureValidTarget();
  });

  // --- COMBAT : résultats calculés par le serveur ---

  networkManager.on<WeaponStatePayload>(MessageType.WEAPON_STATE, (payload) => {
    weapons.applyServerState(payload);
  });

  networkManager.on<ShotFiredPayload>(MessageType.HUNTER_SHOOT, (payload) => {
    const hit = payload.hitPlayerIds.length > 0;
    if (hit && payload.hunterId === networkManager.localPlayerId) effects.hitMarkerAt = Date.now();
    const dronePos = drones.getOrigin(payload.hunterId, payload.originX, payload.originY);
    const angle = Math.atan2(payload.impactY - dronePos.y, payload.impactX - dronePos.x);
    drones.triggerRecoil(payload.hunterId);
    const muzzle = drones.getMuzzle(dronePos.x, dronePos.y, angle, payload.weapon);
    effects.addShot({
      ...payload,
      originX: muzzle.x,
      originY: muzzle.y,
      angle,
      hit
    });
  });

  networkManager.on<GrenadeExplodedPayload>(MessageType.GRENADE_EXPLODED, (payload) => {
    effects.addExplosion(payload.grenadeId, payload.x, payload.y, payload.radius);
    // Petite secousse d'écran si l'explosion est proche de la caméra
    const dist = Math.hypot(payload.x - state.view.camX, payload.y - state.view.camY);
    if (dist < 400) state.screenShake = Math.max(state.screenShake, 6 * (1 - dist / 400));
    if (payload.hitPlayerIds.length > 0 && payload.hunterId === networkManager.localPlayerId) effects.hitMarkerAt = Date.now();
  });

  networkManager.on<PlayerDiedPayload>(MessageType.PLAYER_DIED, (payload) => {
    effects.spawnDeathEffect(payload.x, payload.y, payload.playerName);
    drones.delete(payload.playerId);
    console.log(`[MORT] ${payload.playerName} est mort${payload.killerName ? ` (tué par ${payload.killerName})` : ''}`);
    if (payload.playerId === networkManager.localPlayerId) {
      spectator.enter(payload);
    } else {
      const op = otherPlayers.get(payload.playerId);
      if (op) {
        op.role = PlayerRole.SPECTATOR;
        op.health = 0;
      }
      spectator.onOtherPlayerGone(payload.playerId);
    }
  });

  // --- MANCHES ---

  networkManager.on<RoundStartPayload>(MessageType.ROUND_START, (payload) => {
    state.localPlayerRole = payload.role;
    state.currentPhase = GamePhase.HIDING;
    spectator.exit();
    weapons.resetView();
    weapons.select(WeaponType.PISTOL);
    effects.resetRound();
    drones.clear();
    updateStatus();
    roundHud.showRoundStart(payload);
  });

  networkManager.on<RoundTimerTickPayload>(MessageType.ROUND_TIMER_TICK, (payload) => {
    const previousPhase = state.currentPhase;
    state.currentPhase = payload.phase;
    roundHud.showTimer(payload.phase, payload.timeRemaining, state.localPlayerRole);

    if (previousPhase !== state.currentPhase) {
      weapons.updateHud();
      if (state.currentPhase === GamePhase.LOBBY) spectator.exit();
    }

    // Retour automatique au salon lorsque le serveur repasse en LOBBY après ROUND_END
    if (payload.phase === GamePhase.LOBBY && previousPhase === GamePhase.ROUND_END) {
      roundHud.hideRoundEnd();
      roundHud.hideBlindfold();
      returnToLobby(true);
    }
  });

  networkManager.on<RoundEndPayload>(MessageType.ROUND_END, (payload) => {
    state.currentPhase = GamePhase.ROUND_END;
    weapons.updateHud();
    effects.grenades.length = 0;
    roundHud.showRoundEnd(payload);
  });

  networkManager.on<LobbyStatePayload>(MessageType.LOBBY_STATE, (payload) => {
    if (payload.roomKey?.startsWith('FREEPLAY-')) {
      state.localPlayerRole = PlayerRole.PROP;
      state.currentPhase = GamePhase.LOBBY;
      roundHud.showFreeplay();
      return;
    }

    if (state.currentPhase === GamePhase.ROUND_END) {
      state.currentPhase = GamePhase.LOBBY;
      spectator.exit();
      weapons.updateHud();
      roundHud.hideRoundEnd();
      returnToLobby(false);
    }
  });
}
