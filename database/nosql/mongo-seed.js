// Jeu de données de test pour MongoDB Atlas (Base : propjv)
// Exécution : mongosh "<MONGO_URI>" database/nosql/mongo-seed.js

const targetDb = db.getSiblingDB('propjv');
const now = new Date();

// Nettoyage préalable pour rendre le script ré-exécutable à volonté
targetDb.active_servers.deleteMany({});
targetDb.match_telemetry.deleteMany({});
targetDb.server_logs.deleteMany({});

// 1. Serveurs actifs (visibles pendant 20s grâce à l'index TTL sur lastHeartbeat)
targetDb.active_servers.insertMany([
  {
    serverId: 'srv-eu-01',
    name: 'Serveur Officiel #1 - FR',
    host: 'localhost',
    port: 8080,
    map: 'map_01_32p',
    status: 'WAITING',
    playersCount: 3,
    maxPlayers: 16,
    lastHeartbeat: now
  },
  {
    serverId: 'srv-eu-02',
    name: 'Serveur Compétitif #2 - FR',
    host: 'localhost',
    port: 8081,
    map: 'map_01_16p',
    status: 'IN_GAME',
    playersCount: 8,
    maxPlayers: 8,
    lastHeartbeat: now
  }
]);

// 2. Télémétrie (corrélée avec match_id = 1 dans sql/seed.sql)
targetDb.match_telemetry.insertOne({
  matchId: 1,
  serverId: 'srv-eu-01',
  map: 'map_test',
  durationSec: 225,
  winnerTeam: 'HIDER',
  playedAt: new Date('2026-10-06T14:03:45Z'),
  players: [
    {
      userId: 2, // Hidertest
      role: 'HIDER',
      survived: true,
      survivalTimeSec: 225,
      transformationsCount: 0,
      propsUsed: ['prop_can'],
      tauntsUsed: 4,
      eliminations: 0,
      shotsFired: 0,
      shotsHit: 0,
      damageDealt: 0,
      damageTaken: 0
    },
    {
      userId: 3, // Seekertest
      role: 'SEEKER',
      survived: true,
      survivalTimeSec: 225,
      transformationsCount: 0,
      propsUsed: [],
      tauntsUsed: 0,
      eliminations: 1,
      shotsFired: 12,
      shotsHit: 4,
      damageDealt: 100,
      damageTaken: 10
    },
    {
      userId: 4, // Noobtest
      role: 'HIDER',
      survived: false,
      survivalTimeSec: 110,
      transformationsCount: 3,
      propsUsed: ['prop_chair', 'prop_desk', 'prop_bag'],
      tauntsUsed: 1,
      eliminations: 0,
      shotsFired: 0,
      shotsHit: 0,
      damageDealt: 0,
      damageTaken: 100
    }
  ],
  events: [
    { t: 10, type: 'TRANSFORM', userId: 2, prop: 'prop_can', nearestSeekerDist: 320 },
    { t: 14, type: 'TRANSFORM', userId: 4, prop: 'prop_chair', nearestSeekerDist: 290 },
    { t: 45, type: 'TAUNT', userId: 2, taunt: 'taunt_chicken', nearestSeekerDist: 85 },
    { t: 92, type: 'HIT', userId: 3, targetId: 4, nearestSeekerDist: 24 },
    { t: 110, type: 'ELIMINATION', userId: 3, targetId: 4, nearestSeekerDist: 18 },
    { t: 195, type: 'TAUNT', userId: 2, taunt: 'taunt_evil_laugh', nearestSeekerDist: 42 }
  ]
});

// 3. Logs serveur  (rétention 14 jours)
targetDb.server_logs.insertMany([
  {
    timestamp: new Date(now.getTime() - 120000),
    service: 'game-server',
    serverId: 'srv-eu-01',
    level: 'INFO',
    event: 'SERVER_STARTED',
    details: { port: 8080, tickRate: 20, map: 'map_01_32p' }
  },
  {
    timestamp: new Date(now.getTime() - 60000),
    service: 'game-server',
    serverId: 'srv-eu-01',
    level: 'WARN',
    event: 'SPEED_ANOMALY',
    userId: 4,
    details: { expectedMax: 200, measured: 480, action: 'POSITION_CLAMPED' }
  },
  {
    timestamp: now,
    service: 'api-master',
    serverId: 'srv-eu-01',
    level: 'ERROR',
    event: 'MATCH_REPORT_TIMEOUT',
    details: { matchId: 1, retryCount: 1 }
  }
]);

print('Seed MongoDB PropJV insérée avec succès.');