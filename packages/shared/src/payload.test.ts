import { 
  MessageType, 
  NetworkMessage, 
  PlayerMovePayload, 
  TransformPropPayload,
  HunterShootPayload,
  PlayerHitPayload,
  PropLockPayload,
  PropWhistlePayload,
  Player,
  PlayerRole
} from './index.js';

// 1. Test de l'union discriminée des Joueurs (Player)
const propPlayer: Player = {
  id: 'player_01',
  name: 'LeCacheur',
  role: PlayerRole.PROP,
  x: 100,
  y: 200,
  health: 100,
  isLocked: true,
  currentSpriteKey: 'chair'
};

const hunterPlayer: Player = {
  id: 'player_02',
  name: 'LeChasseur',
  role: PlayerRole.HUNTER,
  x: 150,
  y: 220,
  health: 100,
  ammo: 10
};

// 2. Test des paquets d'actions de jeu
const moveMessage: NetworkMessage<PlayerMovePayload> = {
  type: MessageType.PLAYER_MOVE,
  payload: { playerId: propPlayer.id, vx: 1.5, vy: 0 },
  timestamp: Date.now()
};

const transformMessage: NetworkMessage<TransformPropPayload> = {
  type: MessageType.TRANSFORM_PROP,
  payload: { playerId: propPlayer.id, spriteKey: 'barrel' },
  timestamp: Date.now()
};

const shootMessage: NetworkMessage<HunterShootPayload> = {
  type: MessageType.HUNTER_SHOOT,
  payload: { hunterId: hunterPlayer.id, targetX: 105, targetY: 200 },
  timestamp: Date.now()
};

const hitMessage: NetworkMessage<PlayerHitPayload> = {
  type: MessageType.PLAYER_HIT,
  payload: { targetPlayerId: propPlayer.id, damage: 25, isKilled: false },
  timestamp: Date.now()
};

const lockMessage: NetworkMessage<PropLockPayload> = {
  type: MessageType.PROP_LOCK,
  payload: { playerId: propPlayer.id, isLocked: true },
  timestamp: Date.now()
};

const whistleMessage: NetworkMessage<PropWhistlePayload> = {
  type: MessageType.PROP_WHISTLE,
  payload: { playerId: propPlayer.id, soundKey: 'taunt_01' },
  timestamp: Date.now()
};

console.log('Tous les types et payloads sont validés avec succès !');
console.log('Exemple Joueur Prop :', JSON.stringify(propPlayer, null, 2));
console.log('Exemple Tir Hunter :', JSON.stringify(shootMessage, null, 2));