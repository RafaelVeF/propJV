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

export interface HitboxTogglePayload {
  enabled?: boolean;
}

export interface ChatCommandDefinition {
  name: string;
  aliases?: string[];
  description: string;
  syntax: string;
  example: string;
  adminOnly?: boolean;
}

export const CHAT_COMMANDS: ChatCommandDefinition[] = [
  {
    name: 'help',
    aliases: ['aide', 'h'],
    description: 'Affiche la liste des commandes disponibles',
    syntax: '/help [commande]',
    example: '/help kill'
  },
  {
    name: 'kill',
    description: 'Élimine immédiatement le joueur ciblé',
    syntax: '/kill @joueur',
    example: '/kill @Alice',
    adminOnly: true
  },
  {
    name: 'damage',
    aliases: ['dmg'],
    description: 'Inflige des dégâts à un joueur',
    syntax: '/damage @cible <montant>',
    example: '/damage @Alice 25',
    adminOnly: true
  },
  {
    name: 'health',
    aliases: ['heal', 'soin'],
    description: 'Soigne un joueur (ou restaure ses PV max sans montant)',
    syntax: '/health @cible [montant]',
    example: '/health @Alice 50',
    adminOnly: true
  },
  {
    name: 'tp',
    aliases: ['teleport'],
    description: 'Téléporte vers (x, y) ou téléporte une cible',
    syntax: '/tp [@cible] <x> <y>',
    example: '/tp 400 350',
    adminOnly: true
  },
  {
    name: 'speed',
    aliases: ['vitesse'],
    description: 'Modifie le multiplicateur de vitesse d\'un joueur (0.1 à 10 ou reset)',
    syntax: '/speed @cible <valeur|reset>',
    example: '/speed @Alice 2',
    adminOnly: true
  },
  {
    name: 'timeadd',
    description: 'Prolonge le chronomètre de la manche en secondes',
    syntax: '/timeadd <secondes>',
    example: '/timeadd 30',
    adminOnly: true
  },
  {
    name: 'timesubs',
    aliases: ['timesub'],
    description: 'Raccourcit le chronomètre de la manche en secondes',
    syntax: '/timesubs <secondes>',
    example: '/timesubs 30',
    adminOnly: true
  },
  {
    name: 'swap',
    aliases: ['switch'],
    description: 'Inverse le rôle d\'un joueur entre Chasseur et Prop',
    syntax: '/swap @cible',
    example: '/swap @Alice',
    adminOnly: true
  },
  {
    name: 'kick',
    description: 'Expulse un joueur de la partie et du salon',
    syntax: '/kick @cible',
    example: '/kick @Alice',
    adminOnly: true
  },
  {
    name: 'end',
    description: 'Termine immédiatement la manche en cours',
    syntax: '/end',
    example: '/end',
    adminOnly: true
  },
  {
    name: 'god',
    description: 'Active/désactive le mode God (0 dégât + traverse les murs)',
    syntax: '/god @cible',
    example: '/god @Alice',
    adminOnly: true
  },
  {
    name: 'hitbox',
    aliases: ['hitboxes'],
    description: 'Active ou désactive l\'affichage des hitboxes',
    syntax: '/hitbox [on|off]',
    example: '/hitbox',
    adminOnly: true
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
