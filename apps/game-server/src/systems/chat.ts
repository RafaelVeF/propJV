import { WebSocket } from 'ws';
import {
  MessageType,
  PlayerRole,
  CHAT_COMMANDS,
  isAlive,
  type Player,
  type NetworkMessage,
  type ChatMessagePayload
} from '@prop-hunt/shared';

export interface ChatContext {
  ws: WebSocket;
  playerId: string;
  roomKey: string;
  players: Map<string, Player>;
  broadcastToRoom: (roomKey: string, msg: NetworkMessage) => void;
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

/**
 * Traite un message de chat ou une commande slash envoyé dans un salon.
 */
export function handleChatMessage(payload: unknown, ctx: ChatContext): void {
  const { ws, playerId, roomKey, players, broadcastToRoom } = ctx;

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
          sendSystemMessage(`Commandes : ${CHAT_COMMANDS.map(c => `/${c.name}`).join(', ')}`);
        }
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
          const role = p.role === PlayerRole.HUNTER ? 'Chasseur' : 'Prop';
          const status = isAlive(p) ? 'Vivant' : 'Mort';
          return `${p.name} (${role}, ${status})`;
        });
        sendSystemMessage(`Joueurs (${lines.length}) : ${lines.join(' • ')}`);
        return;
      }

      case 'clear': {
        // Exécuté côté client ; aucun effet serveur nécessaire
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
