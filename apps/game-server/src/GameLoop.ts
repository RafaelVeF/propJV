import { GAME_CONFIG } from './config/game.js';

export class GameLoop {
    private intervalId: NodeJS.Timeout | null = null;
    private onTickCallback: (deltaTime: number) => void;
    private lastTime: number = Date.now();

    constructor(onTick: (deltaTime: number) => void) {
        this.onTickCallback = onTick;
    }

    public start(): void {
        if (this.intervalId) return;

        console.log(`[GameLoop] Démarrage de la boucle de jeu à ${GAME_CONFIG.TICK_RATE} ticks/sec.`);
        this.lastTime = Date.now();

        this.intervalId = setInterval(() => {
            const now = Date.now();
            const deltaTime = (now - this.lastTime) / 1000; // Delta en secondes
            this.lastTime = now;

            // Exécution de la logique du tick serveur
            this.onTickCallback(deltaTime);

        }, GAME_CONFIG.TICK_INTERVAL);
    }

    public stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log("[GameLoop] Arrêt de la boucle de jeu.");
        }
    }
}   