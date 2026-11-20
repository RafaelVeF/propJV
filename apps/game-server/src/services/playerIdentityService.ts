export interface AuthenticatedPlayerIdentity {
    userId: number;
    username: string;
}

interface AuthMeResponse {
    success?: unknown;
    user?: {
        userId?: unknown;
        username?: unknown;
    };
}

/** Validate the JWT through api-master and use the current database username. */
export async function fetchAuthenticatedPlayerIdentity(
    token: string,
    apiOrigin: string,
    fetcher: typeof fetch = fetch
): Promise<AuthenticatedPlayerIdentity | null> {
    const cleanToken = token.trim();
    let cleanOrigin = apiOrigin.trim();
    while (cleanOrigin.endsWith('/')) {
        cleanOrigin = cleanOrigin.slice(0, -1);
    }
    if (!cleanToken || !cleanOrigin) return null;

    try {
        const response = await fetcher(`${cleanOrigin}/api/auth/me`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${cleanToken}` }
        });
        if (!response.ok) return null;

        const data = await response.json() as AuthMeResponse;
        const userId = Number(data.user?.userId);
        const username = typeof data.user?.username === 'string'
            ? data.user.username.trim()
            : '';
        if (data.success !== true || !Number.isInteger(userId) || userId <= 0 || !username) {
            return null;
        }

        return { userId, username };
    } catch {
        return null;
    }
}
