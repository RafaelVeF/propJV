import type { MatchReportPayload } from '../systems/telemetryTracker.js';

export interface ServerHeartbeatPayload {
    serverId: string;
    name: string;
    host: string;
    port: number;
    map: string;
    status: 'WAITING' | 'IN_GAME' | 'FULL';
    playersCount: number;
    maxPlayers: number;
}

export interface ServerLogPayload {
    service?: string;
    serverId: string;
    level: 'INFO' | 'WARN' | 'ERROR';
    event: string;
    userId?: number | null;
    details?: Record<string, unknown>;
}

function getApiBaseUrl(): string {
    let url = process.env.API_MASTER_URL || 'http://localhost:3000';
    while (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    return url;
}

function getInternalSecret(): string {
    return process.env.INTERNAL_API_SECRET?.trim() || '';
}

async function postInternal(path: string, body: unknown, label: string): Promise<boolean> {
    const secret = getInternalSecret();
    if (!secret) {
        console.warn(`[InternalAPI] ${label} ignoré : INTERNAL_API_SECRET non configuré.`);
        return false;
    }

    const url = `${getApiBaseUrl()}/api/internal${path}`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-internal-secret': secret,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.warn(
                `[InternalAPI] Échec ${label} (${response.status}) : ${errText.slice(0, 200)}`
            );
            return false;
        }
        return true;
    } catch (error) {
        console.warn(
            `[InternalAPI] Erreur réseau sur ${label} (${url}) :`,
            (error as Error).message
        );
        return false;
    }
}

export async function sendServerHeartbeat(payload: ServerHeartbeatPayload): Promise<boolean> {
    return postInternal('/servers/heartbeat', payload, 'heartbeat');
}

export async function sendServerLog(payload: ServerLogPayload): Promise<boolean> {
    return postInternal(
        '/servers/log',
        {
            service: 'game-server',
            ...payload,
        },
        `log:${payload.event}`
    );
}

export async function sendMatchReport(payload: MatchReportPayload): Promise<boolean> {
    return postInternal('/matches/report', payload, 'match-report');
}