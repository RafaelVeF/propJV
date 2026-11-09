/**
 * systems/chat.ts — Module métier de gestion du chat et des commandes textuelles en jeu.
 *
 * Responsabilités :
 * - Validation et filtrage des messages de chat.
 * - Diffusion aux joueurs connectés (broadcast).
 * - Exécution des commandes slash (/help, /role, /prop, /tp, /heal, /damage, /speed, /roll, /me, /whistle, /list, /ping).
 * - Retours d'erreurs clairs avec exemples d'utilisation en cas d'arguments manquants ou invalides.
 */

import { WebSocket } from 'ws';
import {
  MessageType,
  PlayerRole,
  type Player,
  type NetworkMessage,
  type Rectangle,
  DEFAULT_PROPS,
  CHAT_COMMANDS,
  type ChatMessagePayload
} from '@prop-hunt/shared';
import { checkCircleRectCollision } from './colision.js';
import { GAME_CONFIG } from '../config/game.js';

export interface ChatContext {
  ws: WebSocket;
  playerId: string;
  players: Map<string, Player>;
  broadcast: (msg: NetworkMessage) => void;
  playerRegenTimers: Map<string, number>;
  mapData?: any;
  staticObstacles?: Rectangle[];
}

/**
 * Traite un message de chat ou une commande envoyée par un joueur.
 */
export function handleChatMessage(payload: any, ctx: ChatContext): void {
  const { ws, playerId, players, broadcast, playerRegenTimers, mapData, staticObstacles } = ctx;

  if (!payload || typeof payload.text !== 'string') return;
  const trimmed = payload.text.trim();
  if (trimmed.length === 0 || trimmed.length > 250) return;

  const sender = players.get(playerId);
  const senderName = sender?.name || `Joueur ${playerId.substring(0, 4)}`;

  // Envoi d'un message système privé à l'émetteur
  const sendSystemMessage = (text: string) => {
    ws.send(JSON.stringify({
      type: MessageType.CHAT_MESSAGE,
      payload: {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderId: 'system',
        senderName: 'Système',
        text,
        timestamp: Date.now(),
        isSystem: true
      } satisfies ChatMessagePayload
    }));
  };

  // Diffusion d'un message système à tous les joueurs
  const broadcastSystemMessage = (text: string) => {
    broadcast({
      type: MessageType.CHAT_MESSAGE,
      payload: {
        id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        senderId: 'system',
        senderName: 'Système',
        text,
        timestamp: Date.now(),
        isSystem: true
      } satisfies ChatMessagePayload
    });
  };

  // --- TRAITEMENT DES COMMANDES SLASH ('/...') ---
  if (trimmed.startsWith('/')) {
    const parts = trimmed.slice(1).split(' ').filter((p: string) => p.length > 0);
    if (parts.length === 0) {
      sendSystemMessage(`Tapez /help pour afficher la liste des commandes disponibles.`);
      return;
    }

    const rawCmd = parts[0].toLowerCase();
    const def = CHAT_COMMANDS.find(c => c.name === rawCmd || c.aliases?.includes(rawCmd));

    if (!def) {
      sendSystemMessage(`Commande inconnue "/${rawCmd}". Tapez /help pour afficher les commandes disponibles.`);
      return;
    }

    switch (def.name) {
      case 'help': {
        if (parts.length > 1) {
          const subQuery = parts[1].toLowerCase().replace(/^\//, '');
          const subDef = CHAT_COMMANDS.find(c => c.name === subQuery || c.aliases?.includes(subQuery));
          if (subDef) {
            sendSystemMessage(`Commande /${subDef.name} : ${subDef.description}\n• Utilisation : ${subDef.syntax}\n• Exemple : ${subDef.example}`);
          } else {
            sendSystemMessage(`Commande "${subQuery}" introuvable. Tapez /help pour afficher toutes les commandes.`);
          }
        } else {
          const listStr = CHAT_COMMANDS.map(c => `/${c.name}`).join(', ');
          sendSystemMessage(`Commandes disponibles : ${listStr}\n💡 Tapez /help <commande> pour voir la syntaxe et un exemple détaillé.`);
        }
        break;
      }

      case 'role': {
        if (parts.length < 2) {
          sendSystemMessage(`Argument manquant. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
          break;
        }
        const target = parts[1].toLowerCase();
        let targetRole: PlayerRole | null = null;
        if (target === 'hunter' || target === 'chasseur') targetRole = PlayerRole.HUNTER;
        if (target === 'prop') targetRole = PlayerRole.PROP;

        if (!targetRole) {
          sendSystemMessage(`Rôle "${parts[1]}" invalide. Choix : hunter, prop. (Exemple : /role hunter)`);
          break;
        }

        if (sender) {
          sender.role = targetRole;
          if (targetRole === PlayerRole.HUNTER) {
            sender.health = 100;
            sender.maxHealth = 100;
          } else if (targetRole === PlayerRole.PROP) {
            const defP = DEFAULT_PROPS[0];
            (sender as any).currentProp = defP;
            sender.health = defP.health;
            sender.maxHealth = defP.health;
          }
          players.set(playerId, sender);
          broadcastSystemMessage(`🔄 ${senderName} a changé son rôle en ${targetRole === PlayerRole.HUNTER ? 'CHASSEUR' : 'PROP'}.`);
        }
        break;
      }

      case 'switch': {
        if (sender) {
          const newRole = sender.role === PlayerRole.HUNTER ? PlayerRole.PROP : PlayerRole.HUNTER;
          sender.role = newRole;
          if (newRole === PlayerRole.HUNTER) {
            sender.health = 100;
            sender.maxHealth = 100;
          } else {
            const defP = DEFAULT_PROPS[0];
            (sender as any).currentProp = defP;
            sender.health = defP.health;
            sender.maxHealth = defP.health;
          }
          players.set(playerId, sender);
          broadcastSystemMessage(`${senderName} est maintenant ${newRole === PlayerRole.HUNTER ? 'CHASSEUR' : 'PROP'}.`);
        }
        break;
      }

      case 'prop': {
        if (!sender || sender.role !== PlayerRole.PROP) {
          sendSystemMessage(`Vous devez être en rôle PROP pour changer de prop. (Tapez /role prop pour changer de rôle)`);
          break;
        }
        if (parts.length < 2) {
          const propNames = DEFAULT_PROPS.filter(p => p.internalName !== 'prop_human').map(p => p.displayName).join(', ');
          sendSystemMessage(`Nom de prop manquant. Utilisation : ${def.syntax} (Exemple : ${def.example})\n• Props disponibles : ${propNames}`);
          break;
        }
        const query = parts.slice(1).join(' ').toLowerCase();
        const matchedProp = DEFAULT_PROPS.find(p =>
          p.internalName.toLowerCase().includes(query) ||
          p.displayName.toLowerCase().includes(query)
        );

        if (!matchedProp) {
          const propNames = DEFAULT_PROPS.filter(p => p.internalName !== 'prop_human').map(p => p.displayName).join(', ');
          sendSystemMessage(`Prop "${query}" introuvable. Props disponibles : ${propNames} (Exemple : /prop chaise)`);
          break;
        }

        (sender as any).currentProp = matchedProp;
        sender.maxHealth = matchedProp.health;
        sender.health = Math.min(sender.health, matchedProp.health);
        (sender as any).variantIndex = 0;
        players.set(playerId, sender);

        broadcast({
          type: MessageType.TRANSFORM_PROP,
          payload: {
            playerId,
            propId: matchedProp.id,
            variantIndex: 0,
            spriteKey: matchedProp.internalName,
            currentProp: matchedProp
          }
        });
        broadcastSystemMessage(`${senderName} s'est transformé en ${matchedProp.displayName} (${matchedProp.health} HP).`);
        break;
      }

      case 'tp': {
        if (parts.length < 3 || isNaN(Number(parts[1])) || isNaN(Number(parts[2]))) {
          sendSystemMessage(`Coordonnées manquantes ou invalides. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
          break;
        }
        const targetX = Math.round(Number(parts[1]));
        const targetY = Math.round(Number(parts[2]));
        if (sender) {
          sender.x = targetX;
          sender.y = targetY;
          players.set(playerId, sender);
          broadcast({
            type: MessageType.PLAYER_MOVE,
            payload: {
              playerId,
              x: targetX,
              y: targetY,
              vx: 0,
              vy: 0
            }
          });
          sendSystemMessage(`Téléportation réussie vers (${targetX}, ${targetY}).`);
        }
        break;
      }

      case 'getcoord': {
        if (!sender) {
          sendSystemMessage(`Impossible de récupérer les coordonnées : joueur introuvable.`);
          break;
        }

        const px = Math.round(sender.x * 10) / 10;
        const py = Math.round(sender.y * 10) / 10;

        const tileW = mapData?.tilewidth || 32;
        const tileH = mapData?.tileheight || 32;
        const mapW = mapData?.width || 0;
        const mapH = mapData?.height || 0;

        const tileX = Math.floor(sender.x / tileW);
        const tileY = Math.floor(sender.y / tileH);
        const isInsideMap = tileX >= 0 && tileX < mapW && tileY >= 0 && tileY < mapH;
        const tileIndex = isInsideMap ? tileY * mapW + tileX : -1;

        // Analyse des calques Tiled à la position de la tuile
        const layerDetails: string[] = [];
        let collisionTileGid = 0;
        const tileProperties: Record<string, any> = {};

        if (mapData && Array.isArray(mapData.layers) && isInsideMap) {
          for (const layer of mapData.layers) {
            if (layer.type === 'tilelayer' && Array.isArray(layer.data)) {
              const gid = layer.data[tileIndex] ?? 0;
              const isColLayer = layer.name.toLowerCase().includes('coli') || layer.name.toLowerCase().includes('coll');
              if (isColLayer && gid > 0) {
                collisionTileGid = gid;
              }
              const statusTag = isColLayer ? (gid > 0 ? ' [MUR / SOLIDE]' : ' [VIDE / LIBRE]') : '';
              layerDetails.push(`${layer.name}: GID ${gid}${statusTag}`);
            }
          }
        }

        // Hitbox du joueur et détection de collision physique
        const playerRadius = ('currentProp' in sender && (sender as any).currentProp?.hitboxRadius)
          ? (sender as any).currentProp.hitboxRadius
          : GAME_CONFIG.PLAYER_RADIUS;

        const playerCircle = { x: sender.x, y: sender.y, radius: playerRadius };
        let collidingCount = 0;
        const collidingObstacles: Rectangle[] = [];

        if (staticObstacles && staticObstacles.length > 0) {
          for (const obs of staticObstacles) {
            if (checkCircleRectCollision(playerCircle, obs)) {
              collidingCount++;
              if (collidingObstacles.length < 3) {
                collidingObstacles.push(obs);
              }
            }
          }
        }

        // Vérification des bordures serveur
        const inBounds = (
          sender.x - playerRadius >= 0 &&
          sender.x + playerRadius <= GAME_CONFIG.MAP_WIDTH &&
          sender.y - playerRadius >= 0 &&
          sender.y + playerRadius <= GAME_CONFIG.MAP_HEIGHT
        );

        // Propriétés de la tuile
        tileProperties['solide'] = collisionTileGid > 0;
        tileProperties['franchissable'] = collisionTileGid === 0;
        tileProperties['tuile_x'] = tileX;
        tileProperties['tuile_y'] = tileY;
        if (collisionTileGid > 0) {
          tileProperties['collision_gid'] = collisionTileGid;
        }

        // Recherche d'éventuelles propriétés custom dans le tileset Tiled
        if (mapData?.tilesets && Array.isArray(mapData.tilesets)) {
          for (const ts of mapData.tilesets) {
            if (Array.isArray(ts.tiles)) {
              const localTileId = collisionTileGid > 0 ? collisionTileGid - (ts.firstgid || 1) : -1;
              const foundTile = ts.tiles.find((t: any) => t.id === localTileId);
              if (foundTile && Array.isArray(foundTile.properties)) {
                foundTile.properties.forEach((p: any) => {
                  tileProperties[p.name] = p.value;
                });
              }
            }
          }
        }

        const propStr = Object.entries(tileProperties).map(([k, v]) => `${k}: ${v}`).join(', ');

        const lines: string[] = [
          `📍 [COORDONNÉES & DIAGNOSTIC TUILE]`,
          `• Position Joueur : X = ${px} px, Y = ${py} px`,
          `• Tuile Grille : [X: ${tileX}, Y: ${tileY}] (Index #${tileIndex >= 0 ? tileIndex : 'Hors-zone'})`,
          `• Carte : ${mapW}x${mapH} tuiles (${mapW * tileW}x${mapH * tileH} px, Tuile: ${tileW}x${tileH} px)`,
          `• Calques : ${layerDetails.length > 0 ? layerDetails.join(' | ') : 'Aucun'}`,
          `• Obstacle Tiled sur tuile : ${collisionTileGid > 0 ? `⚠️ OUI (GID: ${collisionTileGid})` : `✅ NON (franchissable)`}`,
          `• Hitbox Joueur : Rayon ${playerRadius} px (Rôle: ${sender.role}${sender.role === PlayerRole.PROP && (sender as any).currentProp ? ` - ${(sender as any).currentProp.displayName}` : ''})`,
          `• Collision Physique : ${collidingCount > 0 ? `🚨 EN COLLISION (${collidingCount} obstacle(s) en contact, ex: [x:${collidingObstacles[0].x}, y:${collidingObstacles[0].y}])` : `✅ LIBRE (aucun obstacle en contact)`}`,
          `• Limites Serveur : ${inBounds ? `✅ DANS LES BORNES ([0..${GAME_CONFIG.MAP_WIDTH}] x [0..${GAME_CONFIG.MAP_HEIGHT}])` : `⚠️ HORS LIMITES ([0..${GAME_CONFIG.MAP_WIDTH}] x [0..${GAME_CONFIG.MAP_HEIGHT}])`}`,
          `• Propriétés : { ${propStr} }`
        ];

        sendSystemMessage(lines.join('\n'));
        break;
      }

      case 'heal': {
        if (sender) {
          const maxH = (sender as any).currentProp?.health || sender.maxHealth || 100;
          let amount = maxH;
          if (parts.length > 1) {
            const parsed = Number(parts[1]);
            if (isNaN(parsed) || parsed <= 0) {
              sendSystemMessage(`Montant de soin invalide. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
              break;
            }
            amount = parsed;
          }
          sender.health = Math.min(maxH, sender.health + amount);
          players.set(playerId, sender);

          broadcast({
            type: MessageType.PLAYER_HIT,
            payload: {
              targetPlayerId: playerId,
              playerId,
              damage: 0,
              health: sender.health,
              maxHealth: maxH,
              lastHitTimestamp: sender.lastHitTimestamp || 0,
              isKilled: false
            }
          });
          sendSystemMessage(`Soin appliqué : ${sender.health}/${maxH} HP.`);
        }
        break;
      }

      case 'damage': {
        if (parts.length < 2 || isNaN(Number(parts[1])) || Number(parts[1]) <= 0) {
          sendSystemMessage(`Montant de dégâts invalide. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
          break;
        }
        if (sender) {
          const dmg = Number(parts[1]);
          const maxH = (sender as any).currentProp?.health || sender.maxHealth || 100;
          sender.health = Math.max(0, sender.health - dmg);
          sender.lastHitTimestamp = Date.now();
          playerRegenTimers.delete(playerId);
          players.set(playerId, sender);

          broadcast({
            type: MessageType.PLAYER_HIT,
            payload: {
              targetPlayerId: playerId,
              playerId,
              damage: dmg,
              health: sender.health,
              maxHealth: maxH,
              lastHitTimestamp: sender.lastHitTimestamp,
              isKilled: sender.health <= 0
            }
          });
          sendSystemMessage(`Dégâts subis : -${dmg} HP (${sender.health}/${maxH} HP).`);
        }
        break;
      }

      case 'speed': {
        if (parts.length < 2) {
          sendSystemMessage(`Valeur manquante. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
          break;
        }
        if (sender) {
          if (parts[1].toLowerCase() === 'reset') {
            (sender as any).speed = 5;
            sendSystemMessage(`⚡ Vitesse réinitialisée à 5.`);
          } else {
            const spd = Number(parts[1]);
            if (isNaN(spd) || spd < 1 || spd > 20) {
              sendSystemMessage(`Vitesse invalide (1 à 20). Utilisation : ${def.syntax} (Exemple : ${def.example})`);
              break;
            }
            (sender as any).speed = spd;
            sendSystemMessage(`Vitesse définie à ${spd}.`);
          }
          players.set(playerId, sender);
        }
        break;
      }

      case 'roll': {
        let max = 100;
        if (parts.length > 1) {
          const parsed = Number(parts[1]);
          if (isNaN(parsed) || parsed < 2) {
            sendSystemMessage(`Nombre maximal invalide (minimum 2). Utilisation : ${def.syntax} (Exemple : ${def.example})`);
            break;
          }
          max = Math.floor(parsed);
        }
        const result = Math.floor(Math.random() * max) + 1;
        broadcastSystemMessage(`${senderName} a lancé un dé (1-${max}) et obtient : ${result} !`);
        break;
      }

      case 'me': {
        if (parts.length < 2) {
          sendSystemMessage(`Action manquante. Utilisation : ${def.syntax} (Exemple : ${def.example})`);
          break;
        }
        const action = parts.slice(1).join(' ');
        broadcastSystemMessage(`* ${senderName} ${action}`);
        break;
      }

      case 'whistle': {
        broadcast({
          type: MessageType.PROP_WHISTLE,
          payload: { playerId, soundKey: 'whistle_default' }
        });
        broadcastSystemMessage(`🎵 ${senderName} a sifflé !`);
        break;
      }

      case 'list': {
        const playerLines: string[] = [];
        players.forEach((p, id) => {
          const isMe = id === playerId;
          const roleStr = p.role === PlayerRole.HUNTER ? 'CHASSEUR' : 'PROP';
          const propInfo = p.role === PlayerRole.PROP && (p as any).currentProp ? ` [${(p as any).currentProp.displayName}]` : '';
          playerLines.push(`• ${p.name || `Joueur ${id.substring(0, 4)}`} (${roleStr}${propInfo}) - ${p.health}/${p.maxHealth || 100} HP${isMe ? ' (Vous)' : ''}`);
        });
        sendSystemMessage(`Joueurs connectés (${players.size}) :\n${playerLines.join('\n')}`);
        break;
      }

      case 'ping': {
        sendSystemMessage(`Pong ! Connexion WebSocket active (Port 8080).`);
        break;
      }
    }
    return;
  }

  // --- MESSAGE NORMAL (BROADCAST) ---
  const chatMsg: ChatMessagePayload = {
    id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    senderId: playerId,
    senderName,
    senderRole: sender?.role,
    text: trimmed,
    timestamp: Date.now()
  };

  console.log(`[Chat] [${senderName}]: ${trimmed}`);

  broadcast({
    type: MessageType.CHAT_MESSAGE,
    payload: chatMsg
  });
}
