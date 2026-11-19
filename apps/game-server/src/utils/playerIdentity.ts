/** Choisit le nom définitif à afficher dans les salons. */
export function resolvePlayerName(options: {
    userId: number | null | undefined;
    authenticatedName?: string;
    customName?: string;
    playerId: string;
}): string {
    const authenticatedName = options.authenticatedName?.trim();
    if (options.userId != null && authenticatedName) {
        return authenticatedName;
    }

    // Ne jamais réutiliser un nom mis en cache : il peut provenir d'une session
    // authentifiée précédente sur la même connexion WebSocket.
    return options.customName?.trim() || `Player_${options.playerId.substring(0, 4)}`;
}
