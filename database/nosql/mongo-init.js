// Script d'initialisation des collections et index MongoDB
const targetDb = db.getSiblingDB('propjv');

// 1. Serveurs actifs
targetDb.createCollection('active_servers');
targetDb.active_servers.createIndex({ serverId: 1 }, { unique: true });
targetDb.active_servers.createIndex(
  { lastHeartbeat: 1 },
  { expireAfterSeconds: 20 }
);

// 2. Télémétrie des parties
targetDb.createCollection('match_telemetry');
targetDb.match_telemetry.createIndex({ matchId: 1 }, { unique: true });
targetDb.match_telemetry.createIndex({ 'players.userId': 1 });
targetDb.match_telemetry.createIndex({ playedAt: -1 });

// 3. Logs serveur
targetDb.createCollection('server_logs');
targetDb.server_logs.createIndex({ level: 1, timestamp: -1 });
targetDb.server_logs.createIndex({ serverId: 1, timestamp: -1 });
targetDb.server_logs.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 1209600 } // 14 jours (14 * 86400s)
);

print('Collections et index PropJV initialisés avec succès.');