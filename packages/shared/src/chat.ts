import { PlayerRole } from './index.js';

export interface ChatMessagePayload {
  id: string;
  senderId: string;
  senderName: string;
  senderRole?: PlayerRole;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export interface ChatCommandDefinition {
  name: string;
  aliases?: string[];
  description: string;
  syntax: string;
  example: string;
}

export const CHAT_COMMANDS: ChatCommandDefinition[] = [
  {
    name: 'help',
    aliases: ['aide', 'h'],
    description: 'Affiche la liste des commandes disponibles',
    syntax: '/help [commande]',
    example: '/help roll'
  },
  {
    name: 'me',
    aliases: ['action'],
    description: 'Envoie une action roleplay dans le chat',
    syntax: '/me <action>',
    example: '/me se cache discrètement'
  },
  {
    name: 'roll',
    aliases: ['de', 'dice'],
    description: 'Tire un nombre aléatoire entre 1 et N (100 par défaut)',
    syntax: '/roll [max]',
    example: '/roll 20'
  },
  {
    name: 'whistle',
    aliases: ['sifflet', 'taunt'],
    description: 'Déclenche le sifflet du prop pour narguer les chasseurs',
    syntax: '/whistle',
    example: '/whistle'
  },
  {
    name: 'list',
    aliases: ['joueurs', 'players'],
    description: 'Liste les joueurs présents dans le salon et leurs rôles',
    syntax: '/list',
    example: '/list'
  },
  {
    name: 'clear',
    aliases: ['cls', 'clean'],
    description: 'Efface l\'historique local du chat',
    syntax: '/clear',
    example: '/clear'
  }
];

