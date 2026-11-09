export const GAME_NAME = "PropJV - Games";

export enum MessageType {
  // Les Etats
  WELCOME = 'WELCOME',
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',

  // Actions de jeu
  PLAYER_MOVE = 'PLAYER_MOVE',
  TRANSFORM_PROP = 'TRANSFORM_PROP',
  HUNTER_SHOOT = 'HUNTER_SHOOT',
  PLAYER_HIT = 'PLAYER_HIT',
  PROP_LOCK = 'PROP_LOCK',
  PROP_WHISTLE = 'PROP_WHISTLE',
  CHAT_MESSAGE = 'CHAT_MESSAGE',

  // Etat Générale
  GAME_START = 'GAME_START',
  ROUND_START = 'ROUND_START',
  ROUND_END = 'ROUND_END',
  GAME_END = 'GAME_END',
  GAME_STATE_UPDATE = 'GAME_STATE_UPDATE'
}

// Les roles existants dans le jeu
export enum PlayerRole {
  HUNTER = 'HUNTER',
  PROP = 'PROP',
  SPECTATOR = 'SPECTATOR'
}

// Configuration du gameplay et des mécaniques de survie
export interface GameplayConfig {
  /** Durée d'affichage des infos et de la barre de vie après un hit (en ms, ex: 5000 = 5s) */
  shows_infos_duration: number;
  /** Temps sans dégâts avant que la régénération ne commence (en ms, ex: 10000 = 10s) */
  regeneration_cooldown: number;
  /** Intervalle entre chaque tick de régénération (en ms, ex: 500 = 0.5s) */
  regeneration_interval: number;
  /** PVs régénérés à chaque intervalle */
  regeneration_amount: number;
}

export const GAMEPLAY_CONFIG: GameplayConfig = {
  shows_infos_duration: 5000,      // 5 secondes
  regeneration_cooldown: 10000,    // 10 secondes après le dernier hit
  regeneration_interval: 500,      // Toutes les 0.5 secondes
  regeneration_amount: 1           // +1 PV
};

export interface BasePlayer {
  id: string;
  name: string;
  x: number;
  y: number;
  health: number;
  maxHealth?: number;
  lastHitTimestamp?: number; // Timestamp du dernier hit reçu
}

export interface PropVariant {
  assetPath: string;
  width: number;
  height: number;
  orientationName?: string;
}

export interface PropDefinition {
  id: number;
  internalName: string;
  displayName: string;
  health: number;
  hitboxRadius: number;
  variants: PropVariant[];
  // Rétro-compatibilité / raccourcis vers la variante par défaut
  assetPath: string;
  width: number;
  height: number;
}

export const DEFAULT_PROPS: PropDefinition[] = [
  {
    id: 1,
    internalName: 'prop_human',
    displayName: 'Humain',
    health: 100,
    hitboxRadius: 15,
    variants: [
      { assetPath: '', width: 24, height: 48, orientationName: 'Face' }
    ],
    assetPath: '',
    width: 24,
    height: 48
  },
  {
    id: 2,
    internalName: 'prop_wall_painting',
    displayName: 'Tableau Mural',
    health: 50,
    hitboxRadius: 15,
    variants: [
      { assetPath: '/assets/props/board/Tableau_Mur.png', width: 32, height: 32, orientationName: 'Face' }
    ],
    assetPath: '/assets/props/board/Tableau_Mur.png',
    width: 32,
    height: 32
  },
  {
    id: 3,
    internalName: 'prop_chair',
    displayName: 'Chaise',
    health: 40,
    hitboxRadius: 15,
    variants: [
      { assetPath: '/assets/props/chair/Chair_F.png', width: 32, height: 64, orientationName: 'Face (Sud)' },
      { assetPath: '/assets/props/chair/Chair_R.png', width: 32, height: 64, orientationName: 'Droite (Est)' },
      { assetPath: '/assets/props/chair/Chair_B.png', width: 32, height: 64, orientationName: 'Dos (Nord)' },
      { assetPath: '/assets/props/chair/Chair_L.png', width: 32, height: 64, orientationName: 'Gauche (Ouest)' }
    ],
    assetPath: '/assets/props/chair/Chair_F.png',
    width: 32,
    height: 64
  },
  {
    id: 4,
    internalName: 'prop_desk',
    displayName: 'Bureau',
    health: 80,
    hitboxRadius: 15,
    variants: [
      { assetPath: '/assets/props/desk/Desk_F.png', width: 64, height: 32, orientationName: 'Face (Sud)' },
      { assetPath: '/assets/props/desk/Desk_R.png', width: 32, height: 64, orientationName: 'Droite (Est)' }
    ],
    assetPath: '/assets/props/desk/Desk_F.png',
    width: 64,
    height: 32
  },
  {
    id: 5,
    internalName: 'prop_bag',
    displayName: 'Sac à dos',
    health: 45,
    hitboxRadius: 14,
    variants: [
      { assetPath: '/assets/props/bag/Bag_F.png', width: 32, height: 32, orientationName: 'Face (Sud)' },
      { assetPath: '/assets/props/bag/Bag_B.png', width: 32, height: 32, orientationName: 'Dos (Nord)' }
    ],
    assetPath: '/assets/props/bag/Bag_F.png',
    width: 32,
    height: 32
  },
  {
    id: 6,
    internalName: 'prop_can',
    displayName: 'Canette',
    health: 20,
    hitboxRadius: 10,
    variants: [
      { assetPath: '/assets/props/can/Can_F.png', width: 32, height: 32, orientationName: 'Face (Sud)' },
      { assetPath: '/assets/props/can/Can_B.png', width: 32, height: 32, orientationName: 'Dos (Nord)' }
    ],
    assetPath: '/assets/props/can/Can_F.png',
    width: 32,
    height: 32
  },
  {
    id: 7,
    internalName: 'prop_vending_machine',
    displayName: 'Distributeur',
    health: 150,
    hitboxRadius: 22,
    variants: [
      { assetPath: '/assets/props/vending_machine/Vending_machine_F.png', width: 48, height: 64, orientationName: 'Face (Sud)' }
    ],
    assetPath: '/assets/props/vending_machine/Vending_machine_F.png',
    width: 48,
    height: 64
  }
];

// Joueur Prop
export interface PropPlayer extends BasePlayer {
  role: PlayerRole.PROP;
  isLocked: boolean;
  currentProp?: PropDefinition;
  variantIndex?: number;
  currentSpriteKey?: string;
}

// Joueur Hunter
export interface HunterPlayer extends BasePlayer {
  role: PlayerRole.HUNTER;
  ammo?: number;
}

// Joueur Spectateur
export interface SpectatorPlayer extends BasePlayer {
  role: PlayerRole.SPECTATOR;
}

export type Player = PropPlayer | HunterPlayer | SpectatorPlayer;

// Les Payload pour chaque actions (les principaux)

export interface PlayerMovePayload {
  playerId: string;
  vx: number;
  vy: number;
  x?: number;
  y?: number;
}

export interface TransformPropPayload {
  playerId: string;
  propId?: number;
  variantIndex?: number;
  spriteKey?: string; // Objet de la transformation
  currentProp?: PropDefinition;
}

export interface HunterShootPayload {
  hunterId: string;
  targetX: number;
  targetY: number;
}

export interface PlayerHitPayload {
  targetPlayerId: string;
  damage: number;
  isKilled: boolean;
}

// Message de chat textuel
export interface ChatMessagePayload {
  id: string;
  senderId: string;
  senderName: string;
  senderRole?: PlayerRole;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

// Définitions des commandes du chat
export interface ChatCommandDefinition {
  name: string;
  aliases?: string[];
  description: string;
  syntax: string;
  example: string;
  category?: 'gameplay' | 'action' | 'fun' | 'system';
}

export const CHAT_COMMANDS: ChatCommandDefinition[] = [
  {
    name: 'help',
    aliases: ['aide', 'h'],
    description: 'Affiche la liste des commandes ou le détail d\'une commande',
    syntax: '/help [commande]',
    example: '/help role',
    category: 'system'
  },
  {
    name: 'role',
    aliases: ['switch'],
    description: 'Bascule de rôle entre Chasseur et Prop (mode Freeplay)',
    syntax: '/role <hunter|prop>',
    example: '/role hunter',
    category: 'gameplay'
  },
  {
    name: 'prop',
    aliases: ['transfo'],
    description: 'Transformation directe dans un prop spécifique',
    syntax: '/prop <chaise|canette|bureau|vending|sac|tableau>',
    example: '/prop bureau',
    category: 'gameplay'
  },
  {
    name: 'tp',
    aliases: ['teleport'],
    description: 'Téléporte le joueur aux coordonnées (x, y)',
    syntax: '/tp <x> <y>',
    example: '/tp 300 450',
    category: 'gameplay'
  },
  {
    name: 'heal',
    aliases: ['soin'],
    description: 'Restaure la santé (PV max par défaut)',
    syntax: '/heal [montant]',
    example: '/heal 50',
    category: 'gameplay'
  },
  {
    name: 'damage',
    aliases: ['dmg'],
    description: 'S\'inflige des dégâts pour tester la survie et la régénération',
    syntax: '/damage <montant>',
    example: '/damage 20',
    category: 'gameplay'
  },
  {
    name: 'speed',
    aliases: ['vitesse'],
    description: 'Ajuste la vitesse de déplacement du joueur',
    syntax: '/speed <valeur|reset>',
    example: '/speed 8',
    category: 'gameplay'
  },
  {
    name: 'roll',
    aliases: ['de', 'dice'],
    description: 'Tire un nombre aléatoire entre 1 et N (100 par défaut)',
    syntax: '/roll [max]',
    example: '/roll 20',
    category: 'fun'
  },
  {
    name: 'me',
    aliases: ['action'],
    description: 'Envoie une action roleplay stylisée',
    syntax: '/me <action>',
    example: '/me se cache discrètement',
    category: 'fun'
  },
  {
    name: 'whistle',
    aliases: ['sifflet', 'taunt'],
    description: 'Déclenche le sifflet du prop pour narguer les chasseurs',
    syntax: '/whistle',
    example: '/whistle',
    category: 'action'
  },
  {
    name: 'list',
    aliases: ['joueurs', 'players'],
    description: 'Liste les joueurs connectés et leurs rôles',
    syntax: '/list',
    example: '/list',
    category: 'system'
  },
  {
    name: 'ping',
    aliases: ['latence'],
    description: 'Vérifie la latence de la connexion avec le serveur',
    syntax: '/ping',
    example: '/ping',
    category: 'system'
  },
  {
    name: 'clear',
    aliases: ['cls', 'clean'],
    description: 'Efface l\'historique des messages du chat local',
    syntax: '/clear',
    example: '/clear',
    category: 'system'
  }
];

// Enveloppe globale du paquet réseau
export interface NetworkMessage<T = any> {
  type: MessageType;
  payload: T;
  timestamp?: number;
}

//Action de Props
export interface PropLockPayload {
  playerId: string;
  isLocked: boolean;
}

export interface PropWhistlePayload {
  playerId: string;
  soundKey?: string;
}

// Démarage d'une partie
export interface GameStartPayload {
  mapId: string;
}

// Gestion des colisions
export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}