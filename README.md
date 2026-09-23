# Prop Hunt 2D - SAE BUT3

Jeu multijoueur asymétrique en 2D (Phaser.js) avec serveur autoritaire (Node.js/WebSockets) et encapsulation Desktop (Electron).

## Prérequis

Avant de commencer, assurez-vous d'avoir installé :
- **Node.js** (v20 ou v22 recommandée)
- **pnpm** (Gestionnaire de paquets obligatoire pour ce monorepo)

Si vous n'avez pas pnpm, installez-le globalement via npm :
```bash
npm install -g pnpm
```

# Verification 

Verifier que votre environnement est parfaitement OP via 
```bash
pnpm -r ls
pnpm run dev
```
Vous devriez voir :
Legend: production dependency, optional only, dev only

api-master@1.0.0 C:\Users\Rafae\Bureau\BUT\BUT3\SAE_PropJV\propJV\apps\api-master
│
│   dependencies:
├── cors@2.8.6
├── dotenv@18.0.3
├── express@5.2.1
├── mysql2@3.24.4
│
│   devDependencies:
├── @types/express@5.0.6
├── @types/node@26.6.2
├── tsx@4.23.15
└── typescript@7.0.2

client@0.0.0 C:\Users\Rafae\Bureau\BUT\BUT3\SAE_PropJV\propJV\apps\client (PRIVATE)
│
│   dependencies:
├── phaser@4.2.1
│
│   devDependencies:
├── typescript@6.0.3
└── vite@8.3.0

desktop@1.0.0 C:\Users\Rafae\Bureau\BUT\BUT3\SAE_PropJV\propJV\apps\desktop
│
│   dependencies:
├── better-sqlite3@13.0.3
│
│   devDependencies:
├── @types/better-sqlite3@9.6.0
├── electron@44.4.4
├── tsx@4.23.15
└── typescript@7.0.2

game-server@1.0.0 C:\Users\Rafae\Bureau\BUT\BUT3\SAE_PropJV\propJV\apps\game-server
│
│   dependencies:
├── ws@8.21.3
│
│   devDependencies:
├── @types/node@26.6.2
├── @types/ws@8.18.1
├── tsx@4.23.15
└── typescript@7.0.2

Puis, 
la commande run dev ne devrait retourner aucune erreur : 
$ pnpm run dev:client & pnpm run dev:api
$ pnpm --filter client dev

$ vite
HH:MM:SS [vite] (client) Re-optimizing dependencies because lockfile has changed

  VITE v8.3.0  ready in xxx ms

  ➜  Local:   http://localhost:xxxx/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help^
$


## Développement
Pour lancer l'environnement de travail complet (Client Web + API) d'un seul coup, tapez à la racine :
```bash
pnpm run dev
```

Commandes individuelles
Si vous souhaitez ne lancer qu'une seule brique :

```bash
pnpm run dev:client
```
(Lance uniquement le jeu sur Vite)

```bash
pnpm run dev:api 
```
(Lance uniquement l'API Maître)

```bash
pnpm run dev:server
```
(Lance le serveur temps réel local)

# Structure du Projet
    /apps/client : Moteur de jeu (Phaser 3) et UI (Vite + HTML/CSS).

    /apps/api-master : Serveur HTTP (Express) pour le matchmaking et la BDD (MySQL).

    /apps/game-server : Serveur temps réel local (WebSockets) gérant les parties et la triche.

    /apps/desktop : Encapsulation native (Electron + SQLite).

    /packages/shared : Types, constantes et logique partagée entre le client et les serveurs.