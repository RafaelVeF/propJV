import { PlayerRole } from './index.js';

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
    name: 'getcoord',
    aliases: ['coord', 'coords', 'pos', 'position', 'tile'],
    description: 'Affiche les coordonnées x/y, la tuile courante et ses propriétés',
    syntax: '/getcoord',
    example: '/getcoord',
    category: 'system'
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

