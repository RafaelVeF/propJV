export type TelemetryRole = 'HIDER' | 'SEEKER';
export type WinningTeam = 'HIDER' | 'SEEKER' | 'DRAW';

export interface TelemetryInitPlayer {
    playerId: string;
    userId: number | null;
    username: string;
    role: TelemetryRole;
    initialProp?: string | null;
    seekerClass?: string | null;
}

export interface TrackedPlayerStats {
    playerId: string;
    userId: number | null;
    username: string;
    role: TelemetryRole;
    survived: boolean;
    eliminatedAtSec: number | null;
    survivalTimeSec: number;
    scoreEarned: number;
    currencyEarned: number;
    eliminations: number;
    transformationsCount: number;
    propsUsed: string[];
    finalProp: string | null;
    seekerClass: string | null;
    tauntsUsed: number;
    propsDestroyed: number;
    damageDealt: number;
    damageTaken: number;
    shotsFired: number;
    shotsHit: number;
    hadActivity: boolean;
}

export interface TelemetryEvent {
    t: number;
    type: 'TRANSFORM' | 'TAUNT' | 'HIT' | 'ELIMINATION';
    userId: number | null;
    targetId?: number | null;
    prop?: string;
    taunt?: string;
    nearestSeekerDist?: number | null;
}

export interface MatchReportPayload {
    serverId: string;
    mapName: string;
    isFreeplay?: boolean;
    startTime: string;
    endTime: string;
    durationSec: number;
    winningTeam: WinningTeam;
    players: Array<{
        playerId: string;
        userId: number | null;
        username: string;
        role: TelemetryRole;
        survived: boolean;
        survivalTimeSec: number;
        scoreEarned: number;
        currencyEarned: number;
        eliminations: number;
        transformationsCount: number;
        propsUsed: string[];
        finalProp: string | null;
        seekerClass: string | null;
        tauntsUsed: number;
        propsDestroyed: number;
        damageDealt: number;
        damageTaken: number;
        shotsFired: number;
        shotsHit: number;
    }>;
    events: TelemetryEvent[];
}

export class MatchTelemetryTracker {
    private active = false;
    private mapName = 'map_01_32p';
    private startTimeMs = 0;
    private players = new Map<string, TrackedPlayerStats>();
    private events: TelemetryEvent[] = [];

    public isActive(): boolean {
        return this.active;
    }

    private getElapsedSec(nowMs: number = Date.now()): number {
        if (this.startTimeMs <= 0) return 0;
        return Math.max(0, Math.floor((nowMs - this.startTimeMs) / 1000));
    }

    public startMatch(mapName: string, initialPlayers: TelemetryInitPlayer[]): void {
        this.active = true;
        this.mapName = mapName;
        this.startTimeMs = Date.now();
        this.players.clear();
        this.events = [];

        for (const p of initialPlayers) {
            const initialProp = p.role === 'HIDER' ? (p.initialProp ?? null) : null;
            const propsUsed = initialProp ? [initialProp] : [];

            this.players.set(p.playerId, {
                playerId: p.playerId,
                userId: p.userId,
                username: p.username,
                role: p.role,
                survived: true,
                eliminatedAtSec: null,
                survivalTimeSec: 0,
                scoreEarned: 0,
                currencyEarned: 0,
                eliminations: 0,
                transformationsCount: 0,
                propsUsed,
                finalProp: initialProp,
                seekerClass: p.role === 'SEEKER' ? (p.seekerClass ?? 'seeker_recruit') : null,
                tauntsUsed: 0,
                propsDestroyed: 0,
                damageDealt: 0,
                damageTaken: 0,
                shotsFired: 0,
                shotsHit: 0,
                hadActivity: false,
            });
        }
    }

    public registerPlayer(p: TelemetryInitPlayer): void {
        if (!this.active || this.players.has(p.playerId)) return;
        const initialProp = p.role === 'HIDER' ? (p.initialProp ?? null) : null;
        const propsUsed = initialProp ? [initialProp] : [];

        this.players.set(p.playerId, {
            playerId: p.playerId,
            userId: p.userId,
            username: p.username,
            role: p.role,
            survived: true,
            eliminatedAtSec: null,
            survivalTimeSec: 0,
            scoreEarned: 0,
            currencyEarned: 0,
            eliminations: 0,
            transformationsCount: 0,
            propsUsed,
            finalProp: initialProp,
            seekerClass: p.role === 'SEEKER' ? (p.seekerClass ?? 'seeker_recruit') : null,
            tauntsUsed: 0,
            propsDestroyed: 0,
            damageDealt: 0,
            damageTaken: 0,
            shotsFired: 0,
            shotsHit: 0,
            hadActivity: false,
        });
    }

    public recordActivity(playerId: string): void {
        if (!this.active) return;
        const p = this.players.get(playerId);
        if (p) {
            p.hadActivity = true;
        }
    }

    public recordTransform(
        playerId: string,
        propName: string,
        nearestSeekerDist: number | null
    ): void {
        if (!this.active) return;
        const player = this.players.get(playerId);
        if (!player || player.role !== 'HIDER') return;

        player.transformationsCount += 1;
        player.finalProp = propName;
        player.hadActivity = true;
        if (!player.propsUsed.includes(propName)) {
            player.propsUsed.push(propName);
        }

        const event: TelemetryEvent = {
            t: this.getElapsedSec(),
            type: 'TRANSFORM',
            userId: player.userId,
            prop: propName,
        };
        if (nearestSeekerDist !== null) {
            event.nearestSeekerDist = Math.round(nearestSeekerDist);
        }
        this.events.push(event);
    }

    public recordTaunt(
        playerId: string,
        tauntName: string,
        nearestSeekerDist: number | null
    ): void {
        if (!this.active) return;
        const player = this.players.get(playerId);
        if (!player) return;

        player.tauntsUsed += 1;
        player.hadActivity = true;

        const event: TelemetryEvent = {
            t: this.getElapsedSec(),
            type: 'TAUNT',
            userId: player.userId,
            taunt: tauntName,
        };
        if (nearestSeekerDist !== null) {
            event.nearestSeekerDist = Math.round(nearestSeekerDist);
        }
        this.events.push(event);
    }

    public recordShot(seekerId: string): void {
        if (!this.active) return;
        const seeker = this.players.get(seekerId);
        if (!seeker || seeker.role !== 'SEEKER') return;

        seeker.shotsFired += 1;
        seeker.hadActivity = true;
    }

    public recordHit(
        seekerId: string | undefined,
        targetId: string,
        damage: number,
        isProp: boolean,
        nearestSeekerDist: number | null = null
    ): void {
        if (!this.active || damage <= 0) return;

        const seeker = seekerId ? this.players.get(seekerId) : undefined;
        const target = this.players.get(targetId);

        if (target) {
            target.damageTaken += Math.round(damage);
        }

        if (seeker && seeker.role === 'SEEKER' && seekerId !== targetId) {
            seeker.shotsHit += 1;
            seeker.damageDealt += Math.round(damage);
            seeker.hadActivity = true;
            if (isProp) {
                seeker.propsDestroyed += 1;
            }

            const event: TelemetryEvent = {
                t: this.getElapsedSec(),
                type: 'HIT',
                userId: seeker.userId,
                targetId: target?.userId ?? null,
            };
            if (nearestSeekerDist !== null) {
                event.nearestSeekerDist = Math.round(nearestSeekerDist);
            }
            this.events.push(event);
        }
    }

    public recordElimination(
        seekerId: string | undefined,
        hiderId: string,
        nearestSeekerDist: number | null = null
    ): void {
        if (!this.active) return;
        const t = this.getElapsedSec();
        const seeker = seekerId ? this.players.get(seekerId) : undefined;
        const hider = this.players.get(hiderId);

        if (hider && hider.survived) {
            hider.survived = false;
            hider.eliminatedAtSec = t;
            hider.survivalTimeSec = t;
        }

        if (seeker && seeker.role === 'SEEKER' && seekerId !== hiderId) {
            seeker.eliminations += 1;
            seeker.hadActivity = true;

            const event: TelemetryEvent = {
                t,
                type: 'ELIMINATION',
                userId: seeker.userId,
                targetId: hider?.userId ?? null,
            };
            if (nearestSeekerDist !== null) {
                event.nearestSeekerDist = Math.round(nearestSeekerDist);
            }
            this.events.push(event);
        }
    }

    public finalizeMatch(winningTeam: WinningTeam, serverId: string): MatchReportPayload | null {
        if (!this.active) return null;

        const endTimeMs = Date.now();
        const durationSec = Math.max(1, Math.floor((endTimeMs - this.startTimeMs) / 1000));
        this.active = false;

        const finalizedPlayers = Array.from(this.players.values()).map((p) => {
            const survivalTimeSec =
                p.role === 'HIDER'
                    ? (p.survived ? durationSec : (p.eliminatedAtSec ?? durationSec))
                    : durationSec;
            p.survivalTimeSec = survivalTimeSec;

            const isTeamWinner = winningTeam === p.role;
            const isActiveParticipant = durationSec > 0 && (survivalTimeSec > 0 || p.hadActivity);

            // --- Barème des pièces (currencyEarned) ---
            let currencyEarned = 0;
            if (isActiveParticipant) {
                // Participation active : +10 pièces
                currencyEarned += 10;

                // Victoire de l'équipe : +25 pièces
                if (isTeamWinner) {
                    currencyEarned += 25;
                }

                if (p.role === 'HIDER') {
                    // +1 pièce / 15s de survie (max +15)
                    currencyEarned += Math.min(15, Math.floor(survivalTimeSec / 15));
                    // +5 pièces / taunt (plafonné à 3 taunts max = +15)
                    currencyEarned += Math.min(3, p.tauntsUsed) * 5;
                    // +10 pièces de bonus de survie finale
                    if (p.survived) {
                        currencyEarned += 10;
                    }
                } else {
                    // SEEKER : +15 pièces par élimination
                    currencyEarned += p.eliminations * 15;
                    // +2 pièces par prop ennemi détruit (max +10)
                    currencyEarned += Math.min(10, p.propsDestroyed * 2);
                }
            }

            // --- Calcul du score (points de classement) ---
            let scoreEarned = 0;
            if (isTeamWinner) {
                scoreEarned += 250;
            }
            if (p.role === 'HIDER') {
                scoreEarned += survivalTimeSec + p.tauntsUsed * 25 + (p.survived ? 100 : 0);
            } else {
                scoreEarned += p.eliminations * 100 + p.shotsHit * 10 + Math.floor(p.damageDealt * 0.5);
            }

            p.scoreEarned = scoreEarned;
            p.currencyEarned = currencyEarned;

            return {
                playerId: p.playerId,
                userId: p.userId,
                username: p.username,
                role: p.role,
                survived: p.survived,
                survivalTimeSec: p.survivalTimeSec,
                scoreEarned: p.scoreEarned,
                currencyEarned: p.currencyEarned,
                eliminations: p.eliminations,
                transformationsCount: p.transformationsCount,
                propsUsed: [...p.propsUsed],
                finalProp: p.finalProp,
                seekerClass: p.seekerClass,
                tauntsUsed: p.tauntsUsed,
                propsDestroyed: p.propsDestroyed,
                damageDealt: p.damageDealt,
                damageTaken: p.damageTaken,
                shotsFired: p.shotsFired,
                shotsHit: p.shotsHit,
            };
        });

        return {
            serverId,
            mapName: this.mapName,
            startTime: new Date(this.startTimeMs).toISOString(),
            endTime: new Date(endTimeMs).toISOString(),
            durationSec,
            winningTeam,
            players: finalizedPlayers,
            events: [...this.events],
        };
    }

    public reset(): void {
        this.active = false;
        this.players.clear();
        this.events = [];
    }
}
