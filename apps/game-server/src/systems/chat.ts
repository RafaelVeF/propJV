import { WebSocket } from 'ws';
import {
  MessageType,
  PlayerRole,
  CHAT_COMMANDS,
  isAlive,
  type Player,
  type NetworkMessage,
  type ChatMessagePayload,
  type PlayerHitPayload
} from '@prop-hunt/shared';
import { GAME_CONFIG } from '../config/game.js';

export interface ChatContext {
  ws: WebSocket;
  playerId: string;
  roomKey: string;
  isHost: boolean;
  players: Map<string, Player>;
  broadcastToRoom: (roomKey: string, msg: NetworkMessage) => void;
  killTarget: (targetId: string) => void;
  damageTarget: (targetId: string, damage: number) => void;
  isGod: (targetId: string) => boolean;
  toggleGod: (targetId: string) => boolean;
  setSpeed: (targetId: string, multiplier: number) => void;
  swapRole: (targetId: string) => PlayerRole.HUNTER | PlayerRole.PROP | null;
  kickTarget: (targetId: string, kickerName: string) => boolean;
  adjustTime: (deltaSeconds: number) => { timeRemaining: number } | null;
  endMatch: () => boolean;
}

function buildSystemPayload(text: string): ChatMessagePayload {
  return {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    senderId: 'system',
    senderName: 'Système',
    text,
    timestamp: Date.now(),
    isSystem: true
  };
}

function findTargetPlayer(
  rawQuery: string,
  senderId: string,
  players: Map<string, Player>
): Player | undefined {
  const cleaned = rawQuery.startsWith('@') ? rawQuery.slice(1).trim() : rawQuery.trim();
  if (!cleaned) return undefined;

  const lower = cleaned.toLowerCase();
  if (lower === 'me' || lower === 'moi') {
    return players.get(senderId);
  }

  for (const p of players.values()) {
    if (p.name.toLowerCase() === lower) return p;
  }
  for (const p of players.values()) {
    if (p.id.toLowerCase() === lower) return p;
  }

  const prefixMatches = Array.from(players.values()).filter(p =>
    p.name.toLowerCase().startsWith(lower)
  );
  return prefixMatches.length === 1 ? prefixMatches[0] : undefined;
}

/**
 * Traite un message de chat ou une commande slash envoyé dans un salon.
 */
export function handleChatMessage(payload: unknown, ctx: ChatContext): void {
  const { ws, playerId, roomKey, isHost, players, broadcastToRoom } = ctx;

  if (!payload || typeof (payload as { text?: unknown }).text !== 'string') return;
  const trimmed = (payload as { text: string }).text.trim();
  if (trimmed.length === 0 || trimmed.length > 250) return;

  const sender = players.get(playerId);
  const senderName = sender?.name || `Joueur ${playerId.substring(0, 4)}`;

  const sendSystemMessage = (text: string) => {
    ws.send(JSON.stringify({
      type: MessageType.CHAT_MESSAGE,
      payload: buildSystemPayload(text)
    } satisfies NetworkMessage));
  };

  const broadcastSystemMessage = (text: string) => {
    broadcastToRoom(roomKey, {
      type: MessageType.CHAT_MESSAGE,
      payload: buildSystemPayload(text)
    });
  };

  const resolveOrNotify = (rawTarget: string | undefined, usage: string): Player | undefined => {
    if (!rawTarget) {
      sendSystemMessage(`Cible manquante. Utilisation : ${usage}`);
      return undefined;
    }
    const target = findTargetPlayer(rawTarget, playerId, players);
    if (!target) {
      const names = Array.from(players.values()).map(p => `@${p.name}`).join(', ');
      sendSystemMessage(`Joueur "${rawTarget}" introuvable. En ligne : ${names}`);
      return undefined;
    }
    return target;
  };

  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      sendSystemMessage('Tapez /help pour afficher les commandes disponibles.');
      return;
    }

    const rawCmd = parts[0].toLowerCase();
    const def = CHAT_COMMANDS.find(c => c.name === rawCmd || c.aliases?.includes(rawCmd));
    if (!def) {
      sendSystemMessage(`Commande inconnue "/${rawCmd}". Tapez /help pour voir la liste.`);
      return;
    }

    if (def.adminOnly && !isHost) {
      sendSystemMessage(`Commande /${def.name} réservée à l'hôte de la partie.`);
      return;
    }

    switch (def.name) {
      case 'help': {
        if (parts.length > 1) {
          const query = parts[1].toLowerCase().replace(/^\//, '');
          const target = CHAT_COMMANDS.find(c => c.name === query || c.aliases?.includes(query));
          if (target) {
            sendSystemMessage(`/${target.name} : ${target.description} (${target.syntax})`);
          } else {
            sendSystemMessage(`Commande "${query}" introuvable. Tapez /help.`);
          }
        } else {
          const available = CHAT_COMMANDS.filter(c => !c.adminOnly || isHost);
          sendSystemMessage(`Commandes : ${available.map(c => `/${c.name}`).join(', ')}`);
        }
        return;
      }

      case 'kill': {
        const target = resolveOrNotify(parts[1], def.syntax);
        if (!target) return;
        if (!isAlive(target)) {
          sendSystemMessage(`${target.name} est déjà éliminé.`);
          return;
        }
        ctx.killTarget(target.id);
        broadcastSystemMessage(`${target.name} a été éliminé par ${senderName}.`);
        return;
      }

      case 'damage': {
        const target = resolveOrNotify(parts[1], def.syntax);
        if (!target) return;
        const amount = Number(parts[2]);
        if (!Number.isFinite(amount) || amount <= 0) {
          sendSystemMessage(`Montant invalide. Utilisation : ${def.syntax}`);
          return;
        }
        if (!isAlive(target)) {
          sendSystemMessage(`${target.name} est déjà mort.`);
          return;
        }
        if (ctx.isGod(target.id)) {
          sendSystemMessage(`${target.name} est en mode God et ne subit aucun dégât.`);
          return;
        }
        const dmg = Math.round(amount);
        ctx.damageTarget(target.id, dmg);
        sendSystemMessage(`${target.name} a subi ${dmg} dégâts.`);
        return;
      }

      case 'health': {
        const target = resolveOrNotify(parts[1], def.syntax);
        if (!target) return;
        if (!isAlive(target)) {
          sendSystemMessage(`${target.name} est spectateur. Utilisez /swap @${target.name} pour le réintégrer.`);
          return;
        }
        const maxH = target.maxHealth || 100;
        let healAmount = maxH;
        if (parts[2] !== undefined) {
          const parsed = Number(parts[2]);
          if (!Number.isFinite(parsed) || parsed <= 0) {
            sendSystemMessage(`Montant invalide. Utilisation : ${def.syntax}`);
            return;
          }
          healAmount = Math.round(parsed);
        }
        target.health = Math.min(maxH, target.health + healAmount);
        target.lastHitTimestamp = 0;

        broadcastToRoom(roomKey, {
          type: MessageType.PLAYER_HIT,
          payload: {
            targetPlayerId: target.id,
            damage: 0,
            isKilled: false,
            health: target.health,
            maxHealth: maxH,
            lastHitTimestamp: 0
          } satisfies PlayerHitPayload
        });
        sendSystemMessage(`${target.name} soigné (${target.health}/${maxH} PV).`);
        return;
      }

      case 'tp': {
        let target: Player | undefined = sender;
        let rawX = parts[1];
        let rawY = parts[2];

        if (parts.length >= 4) {
          target = resolveOrNotify(parts[1], def.syntax);
          if (!target) return;
          rawX = parts[2];
          rawY = parts[3];
        }

        const x = Number(rawX);
        const y = Number(rawY);
        if (!target || !Number.isFinite(x) || !Number.isFinite(y)) {
          sendSystemMessage(`Coordonnées invalides. Utilisation : ${def.syntax}`);
          return;
        }

        const radius = ('currentProp' in target && target.currentProp?.hitboxRadius)
          ? target.currentProp.hitboxRadius
          : GAME_CONFIG.PLAYER_RADIUS;
        const clampedX = Math.max(radius, Math.min(GAME_CONFIG.MAP_WIDTH - radius, Math.round(x)));
        const clampedY = Math.max(radius, Math.min(GAME_CONFIG.MAP_HEIGHT - radius, Math.round(y)));

        target.x = clampedX;
        target.y = clampedY;
        sendSystemMessage(`${target.name} téléporté vers (${clampedX}, ${clampedY}).`);
        return;
      }

      case 'speed': {
        const target = resolveOrNotify(parts[1], def.syntax);
        if (!target) return;
        const rawVal = parts[2];
        if (!rawVal) {
          sendSystemMessage(`Valeur manquante. Utilisation : ${def.syntax}`);
          return;
        }
        let mult = 1;
        if (rawVal.toLowerCase() !== 'reset') {
          mult = Number(rawVal);
          if (!Number.isFinite(mult) || mult < 0.1 || mult > 10) {
            sendSystemMessage(`Vitesse invalide (0.1 à 10 ou reset). Utilisation : ${def.syntax}`);
            return;
          }
        }
        ctx.setSpeed(target.id, mult);
        broadcastSystemMessage(`${target.name} : vitesse définie à x${mult}.`);
        return;
      }

      case 'timeadd':
      case 'timesubs': {
        const sec = Number(parts[1]);
        if (!Number.isFinite(sec) || sec <= 0) {
          sendSystemMessage(`Durée invalide en secondes. Utilisation : ${def.syntax}`);
          return;
        }
        const delta = def.name === 'timeadd' ? Math.round(sec) : -Math.round(sec);
        const res = ctx.adjustTime(delta);
        if (!res) {
          sendSystemMessage('Aucune manche ou compte à rebours en cours.');
          return;
        }
        broadcastSystemMessage(
          `Chronomètre ${delta > 0 ? 'prolongé' : 'raccourci'} de ${Math.abs(delta)}s (${res.timeRemaining}s restantes).`
        );
        return;
      }

      case 'swap': {
        const target = resolveOrNotify(parts[1], def.syntax);
        if (!target) return;
        const newRole = ctx.swapRole(target.id);
        if (!newRole) {
          sendSystemMessage(`Impossible de changer le rôle de ${target.name}.`);
          return;
        }
        broadcastSystemMessage(
          `${target.name} est désormais ${newRole === PlayerRole.HUNTER ? 'CHASSEUR' : 'PROP'}.`
        );
        return;
      }

      case 'kick': {
        const target = resolveOrNotify(parts[1], def.syntax);
        if (!target) return;
        if (target.id === playerId) {
          sendSystemMessage('Vous ne pouvez pas vous expulser vous-même.');
          return;
        }
        const kicked = ctx.kickTarget(target.id, senderName);
        if (!kicked) {
          sendSystemMessage(`Impossible d'expulser ${target.name}.`);
          return;
        }
        broadcastSystemMessage(`${target.name} a été expulsé de la partie par ${senderName}.`);
        return;
      }

      case 'end': {
        const ended = ctx.endMatch();
        if (!ended) {
          sendSystemMessage('Aucune manche en cours à terminer.');
          return;
        }
        broadcastSystemMessage(`La manche a été terminée par ${senderName}.`);
        return;
      }

      case 'god': {
        const target = resolveOrNotify(parts[1], def.syntax);
        if (!target) return;
        const enabled = ctx.toggleGod(target.id);
        broadcastSystemMessage(`${target.name} : Mode God ${enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'}.`);
        return;
      }

      case 'hitbox': {
        let enabled: boolean | undefined;
        if (parts[1]) {
          const arg = parts[1].toLowerCase();
          if (arg === 'on' || arg === '1' || arg === 'true') enabled = true;
          else if (arg === 'off' || arg === '0' || arg === 'false') enabled = false;
          else {
            sendSystemMessage(`Option invalide. Utilisation : ${def.syntax}`);
            return;
          }
        }
        ws.send(JSON.stringify({
          type: MessageType.HITBOX_TOGGLE,
          payload: { enabled }
        } satisfies NetworkMessage));
        sendSystemMessage(
          enabled === undefined
            ? 'Affichage des hitboxes basculé.'
            : `Affichage des hitboxes ${enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'}.`
        );
        return;
      }

      case 'me': {
        const action = parts.slice(1).join(' ');
        if (!action) {
          sendSystemMessage(`Argument manquant. Utilisation : ${def.syntax}`);
          return;
        }
        broadcastSystemMessage(`* ${senderName} ${action}`);
        return;
      }

      case 'roll': {
        const max = parts.length > 1 ? Number(parts[1]) : 100;
        if (!Number.isFinite(max) || max < 2 || max > 1000000) {
          sendSystemMessage(`Nombre invalide (entre 2 et 1000000). Exemple : ${def.example}`);
          return;
        }
        const value = Math.floor(Math.random() * Math.floor(max)) + 1;
        broadcastSystemMessage(`${senderName} lance un dé (1-${Math.floor(max)}) et obtient ${value}.`);
        return;
      }

      case 'whistle': {
        if (!sender || !isAlive(sender) || sender.role !== PlayerRole.PROP) {
          sendSystemMessage('Seuls les Props vivants peuvent siffler.');
          return;
        }
        const sounds = ['whistle', 'chicken', 'evil_laugh'];
        const soundKey = sounds[Math.floor(Math.random() * sounds.length)];
        broadcastToRoom(roomKey, {
          type: MessageType.PROP_WHISTLE,
          payload: { playerId, soundKey }
        });
        broadcastSystemMessage(`${senderName} a sifflé pour narguer les Chasseurs.`);
        return;
      }

      case 'list': {
        const lines = Array.from(players.values()).map(p => {
          const role = p.role === PlayerRole.HUNTER ? 'Chasseur' : p.role === PlayerRole.SPECTATOR ? 'Spectateur' : 'Prop';
          const status = isAlive(p) ? 'Vivant' : 'Mort';
          return `${p.name} (${role}, ${status})`;
        });
        sendSystemMessage(`Joueurs (${lines.length}) : ${lines.join(' • ')}`);
        return;
      }

      case 'clear': {
        return;
      }
    }
  }

  // Message normal diffusé au salon
  broadcastToRoom(roomKey, {
    type: MessageType.CHAT_MESSAGE,
    payload: {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      senderId: playerId,
      senderName,
      senderRole: sender?.role,
      text: trimmed,
      timestamp: Date.now()
    } satisfies ChatMessagePayload
  });
}
