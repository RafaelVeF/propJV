### Données attendus (`propjv`)

#### A. Collection `active_servers`
Annuaire temps réel des instances `game-server` en ligne, interrogé par le client via `api-master` pour afficher les salons rejoignables.
* **Index unique :** `serverId`
* **Index TTL :** `20 secondes` sur `lastHeartbeat` (tout serveur qui n'envoie plus de ping est automatiquement purgé par MongoDB).

```jsonc
{
  "_id": "ObjectId",
  "serverId": "srv-eu-01",                  // string (requis, unique) - Identifiant unique de l'instance
  "name": "Serveur Officiel #1",            // string (requis) - Nom affiché dans la liste des salons
  "host": "10.1.136.62",                    // string (requis) - IP ou domaine du game-server
  "port": 8080,                             // number (requis) - Port WebSocket du serveur de jeu
  "map": "map_01_32p",                      // string (requis) - Nom interne de la carte chargée
  "status": "WAITING",                      // string (requis) - Valeurs : "WAITING" | "IN_GAME"
  "playersCount": 4,                        // number (requis) - Nombre de joueurs actuellement connectés
  "maxPlayers": 16,                         // number (requis) - Capacité maximale du salon
  "lastHeartbeat": "2026-11-16T13:00:00Z"   // Date ISO (requis, TTL 20s) - Horodatage du dernier signal reçu
}
```

#### B. Collection `match_telemetry`
Rapport détaillé enregistré en fin de manche pour alimenter les statistiques avancées et la validation des succès contextuels.
* **Index unique :** `matchId` (corrélé avec `matches.match_id` dans TiDB Cloud)
* **Index de recherche :** `players.userId` (ascendant), `playedAt` (descendant)

```jsonc
{
  "_id": "ObjectId",
  "matchId": 1,                             // number (requis, unique) - ID du match dans TiDB
  "serverId": "srv-eu-01",                  // string (requis) - Serveur ayant hébergé la partie
  "map": "map_01_32p",                      // string (requis) - Nom interne de la carte
  "durationSec": 225,                       // number (requis) - Durée totale en secondes
  "winnerTeam": "HIDER",                    // string (requis) - Valeurs : "HIDER" | "SEEKER" | "DRAW"
  "playedAt": "2026-11-16T13:05:00Z",       // Date ISO (requis) - Horodatage de fin de partie
  "players": [                              // Array<Object> (requis) - Détail des performances par joueur
    {
      "userId": 2,                          // number (requis) - ID utilisateur TiDB
      "role": "HIDER",                      // string (requis) - Valeurs : "HIDER" | "SEEKER"
      "survived": true,                     // boolean (requis) - true si vivant en fin de manche
      "survivalTimeSec": 225,               // number (requis) - Temps de survie en secondes
      "transformationsCount": 0,            // number (Hider) - Nombre de changements de prop
      "propsUsed": ["prop_can"],            // Array<string> (Hider) - Liste des props incarnés
      "tauntsUsed": 4,                      // number (Hider) - Nombre de taunts déclenchés
      "eliminations": 0,                    // number (Seeker) - Nombre de Hiders éliminés
      "shotsFired": 0,                      // number (Seeker) - Tirs effectués
      "shotsHit": 0,                        // number (Seeker) - Tirs ayant touché un Hider
      "damageDealt": 0,                     // number (requis) - Dégâts infligés
      "damageTaken": 0                      // number (requis) - Dégâts subis
    }
  ],
  "events": [                               // Array<Object> (optionnel) - Chronologie pour succès contextuels
    {
      "t": 45,                              // number - Seconde écoulée depuis le début du match
      "type": "TAUNT",                      // string - "TRANSFORM" | "TAUNT" | "HIT" | "ELIMINATION"
      "userId": 2,                          // number - Joueur à l'origine de l'action
      "targetId": 3,                        // number (optionnel) - Joueur cible (pour HIT / ELIMINATION)
      "prop": "prop_can",                   // string (optionnel) - Prop concerné (pour TRANSFORM)
      "taunt": "taunt_chicken",             // string (optionnel) - Son joué (pour TAUNT)
      "nearestSeekerDist": 85               // number (optionnel) - Distance en px du Seeker le plus proche
    }
  ]
}
```

#### C. Collection `server_logs`
Centralisation des erreurs critiques et alertes de sécurité remontées par `api-master` et `game-server`.
* **Index de recherche :** `(level, timestamp)`, `(serverId, timestamp)`
* **Index TTL :** `14 jours` (`1209600 secondes`) sur `timestamp` pour la purge automatique des anciens logs.

```jsonc
{
  "_id": "ObjectId",
  "timestamp": "2026-11-16T13:06:00Z",      // Date ISO (requis, TTL 14j) - Date et heure de l'événement
  "service": "game-server",                 // string (requis) - Valeurs : "api-master" | "game-server"
  "serverId": "srv-eu-01",                  // string (requis) - Identifiant de l'instance
  "level": "WARN",                          // string (requis) - Valeurs : "INFO" | "WARN" | "ERROR"
  "event": "SPEED_ANOMALY",                 // string (requis) - Code technique de l'événement
  "userId": 3,                              // number (optionnel) - ID du joueur impliqué
  "details": {                              // Object (optionnel) - Contexte libre de l'erreur ou de l'alerte
    "expectedMax": 200,
    "measured": 480
  }
}
```