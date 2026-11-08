/**
 * ServerMessageHandler — Traitement des paquets réseau reçus du serveur WebSocket.
 *
 * Met à jour l'état du joueur local, des autres joueurs, et synchronise les roues UI.
 */
import {
  MessageType,
  type NetworkMessage,
  type Player,
  type PropDefinition,
  DEFAULT_PROPS,
  PlayerRole
} from '@prop-hunt/shared';
import type { TransformationWheel } from '../ui/TransformationWheel';

export interface LocalPlayerState {
  id: string | null;
  role: PlayerRole;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  health: number;
  maxHealth: number;
  lastHitTimestamp: number;
  currentProp: PropDefinition;
  variantIndex: number;
  speed: number;
}

export interface OtherPlayerState {
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  health: number;
  maxHealth: number;
  lastHitTimestamp?: number;
  name?: string;
  role?: PlayerRole;
  currentProp?: PropDefinition;
  variantIndex?: number;
}

export interface GameNetworkContext {
  player: LocalPlayerState;
  otherPlayers: Map<string, OtherPlayerState>;
  transformationWheel: TransformationWheel;
  onRoleChanged?: (newRole: PlayerRole) => void;
}

export function handleServerMessage(
  msg: NetworkMessage,
  ctx: GameNetworkContext
): void {
  const { player, otherPlayers, transformationWheel, onRoleChanged } = ctx;

  switch (msg.type) {
    case MessageType.WELCOME: {
      player.id = msg.payload.player.id;
      if (msg.payload.player.role) {
        player.role = msg.payload.player.role;
      }
      if (msg.payload.player.currentProp) {
        player.currentProp = msg.payload.player.currentProp;
      }
      if ('variantIndex' in msg.payload.player && msg.payload.player.variantIndex !== undefined) {
        player.variantIndex = msg.payload.player.variantIndex;
      }
      player.health = msg.payload.player.health ?? player.currentProp.health;
      player.maxHealth = msg.payload.player.maxHealth ?? player.currentProp.health;
      player.lastHitTimestamp = msg.payload.player.lastHitTimestamp ?? 0;
      transformationWheel.setCurrentEquippedPropId(player.currentProp.id);
      console.log('[WS] Bienvenue ! Mon ID joueur :', player.id, `(Role: ${player.role}, HP: ${player.health}/${player.maxHealth})`);
      break;
    }

    case MessageType.PLAYER_JOINED: {
      const newP: Player = msg.payload.player;
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
        role: newP.role,
        currentProp: propDef,
        variantIndex: ('variantIndex' in newP && newP.variantIndex !== undefined) ? newP.variantIndex : 0
      });
      console.log('[WS] Nouveau joueur rejoint :', newP.id, `(${newP.name || 'Anonyme'}, role: ${newP.role})`);
      break;
    }

    case MessageType.PLAYER_LEFT: {
      otherPlayers.delete(msg.payload.playerId);
      console.log('[WS] Joueur déconnecté :', msg.payload.playerId);
      break;
    }

    case MessageType.TRANSFORM_PROP: {
      const payload = msg.payload;
      const newProp: PropDefinition | undefined = payload.currentProp || DEFAULT_PROPS.find(p =>
        (payload.propId !== undefined && p.id === payload.propId) ||
        (payload.spriteKey && p.internalName === payload.spriteKey)
      );

      if (newProp) {
        if (payload.playerId === player.id) {
          player.currentProp = newProp;
          transformationWheel.setCurrentEquippedPropId(newProp.id);
          if (payload.variantIndex !== undefined) {
            player.variantIndex = payload.variantIndex;
          }
          player.maxHealth = newProp.health;
          if (player.health > newProp.health) {
            player.health = newProp.health;
          }
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
        }
      }
      break;
    }

    case MessageType.PLAYER_HIT: {
      const payload = msg.payload;
      const targetId = payload.targetPlayerId || payload.playerId;
      const hitTime = payload.lastHitTimestamp || Date.now();

      if (targetId === player.id) {
        player.lastHitTimestamp = hitTime;
        if (payload.health !== undefined) {
          player.health = payload.health;
        } else {
          player.health = Math.max(0, player.health - (payload.damage || 10));
        }
        console.log(`[COMBAT] Dégâts subis : -${payload.damage} HP (Vie restante : ${player.health}/${player.maxHealth})`);
      } else if (targetId && otherPlayers.has(targetId)) {
        const op = otherPlayers.get(targetId)!;
        op.lastHitTimestamp = hitTime;
        if (payload.health !== undefined) {
          op.health = payload.health;
        } else {
          op.health = Math.max(0, op.health - (payload.damage || 10));
        }
      }
      break;
    }

    case MessageType.SWITCH_ROLE: {
      const payload = msg.payload;
      if (payload.playerId === player.id) {
        player.role = payload.role;
        if (payload.role === PlayerRole.HUNTER) {
          player.health = 100;
          player.maxHealth = 100;
        } else if (payload.role === PlayerRole.PROP) {
          const defProp = DEFAULT_PROPS[0];
          player.currentProp = defProp;
          player.health = defProp.health;
          player.maxHealth = defProp.health;
          transformationWheel.setCurrentEquippedPropId(defProp.id);
        }
        if (onRoleChanged) {
          onRoleChanged(payload.role);
        }
        console.log(`[ROLE] Mon rôle a changé : ${payload.role}`);
      } else if (otherPlayers.has(payload.playerId)) {
        const op = otherPlayers.get(payload.playerId)!;
        op.role = payload.role;
        if (payload.role === PlayerRole.PROP) {
          op.currentProp = op.currentProp || DEFAULT_PROPS[0];
        }
        console.log(`[ROLE] Le joueur ${payload.playerId} est devenu : ${payload.role}`);
      }
      break;
    }

    case MessageType.GAME_STATE_UPDATE: {
      const playersList = msg.payload.players as Player[];
      const currentIds = new Set<string>();

      playersList.forEach(p => {
        currentIds.add(p.id);
        if (p.id === player.id) {
          player.targetX = p.x;
          player.targetY = p.y;
          if (p.health !== undefined) player.health = p.health;
          if ('maxHealth' in p && p.maxHealth !== undefined) player.maxHealth = p.maxHealth;
          if ('lastHitTimestamp' in p && p.lastHitTimestamp !== undefined) player.lastHitTimestamp = p.lastHitTimestamp;
          if (p.role && p.role !== player.role) {
            player.role = p.role;
            if (onRoleChanged) onRoleChanged(p.role);
          }
          if ('currentProp' in p && p.currentProp) {
            player.currentProp = p.currentProp;
          }
          if ('variantIndex' in p && p.variantIndex !== undefined) {
            player.variantIndex = p.variantIndex;
          }
        } else {
          const propDef = ('currentProp' in p && p.currentProp) ? p.currentProp : DEFAULT_PROPS[0];
          const pVariantIndex = ('variantIndex' in p && p.variantIndex !== undefined) ? p.variantIndex : 0;
          if (otherPlayers.has(p.id)) {
            const op = otherPlayers.get(p.id)!;
            op.targetX = p.x;
            op.targetY = p.y;
            op.role = p.role;
            if (p.health !== undefined) op.health = p.health;
            if ('maxHealth' in p && p.maxHealth !== undefined) op.maxHealth = p.maxHealth;
            if ('lastHitTimestamp' in p && p.lastHitTimestamp !== undefined) op.lastHitTimestamp = p.lastHitTimestamp;
            op.currentProp = propDef;
            op.variantIndex = pVariantIndex;
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
              role: p.role,
              currentProp: propDef,
              variantIndex: pVariantIndex
            });
          }
        }
      });

      // Nettoyage des joueurs qui ne sont plus dans le state
      otherPlayers.forEach((_, id) => {
        if (!currentIds.has(id)) otherPlayers.delete(id);
      });
      break;
    }
  }
}

