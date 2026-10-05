import { MessageType, NetworkMessage, PlayerMovePayload, TransformPropPayload } from './index.js';

// 1. Test du payload de déplacement
const movePayload: PlayerMovePayload = {
  playerId: 'player_01',
  x: 100,
  y: 200,
  vx: 1.5,
  vy: 0
};

const moveMessage: NetworkMessage<PlayerMovePayload> = {
  type: MessageType.PLAYER_MOVE,
  payload: movePayload,
  timestamp: Date.now()
};

// 2. Test du payload de transformation
const transformPayload: TransformPropPayload = {
  playerId: 'player_01',
  spriteKey: 'chair'
};

const transformMessage: NetworkMessage<TransformPropPayload> = {
  type: MessageType.TRANSFORM_PROP,
  payload: transformPayload,
  timestamp: Date.now()
};

console.log('✅ Payloads validés avec succès !');
console.log('Exemple de paquet déplacement :', JSON.stringify(moveMessage, null, 2));