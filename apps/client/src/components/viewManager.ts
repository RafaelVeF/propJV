export const VIEWS = {
  MAIN: 'view-main',
  LOCAL: 'view-local',
  LOBBY: 'view-lobby',
  SETTINGS: 'view-settings',
  PROFILE: 'view-profile',
  HOW_TO_PLAY: 'view-how-to-play',
  FRIENDS: 'view-friends',
  STATS: 'view-stats',
  GAME: 'view-game',
  ACHIEVEMENTS: 'view-achievements',
} as const;

export type ViewKey = keyof typeof VIEWS;

/**
 * Registre des identifiants des vues du client
 */
export const registeredViews: Record<string, string> = {
  main: 'view-main',
  local: 'view-local',
  lobby: 'view-lobby',
  settings: 'view-settings',
  profile: 'view-profile',
  howToPlay: 'view-how-to-play',
  friends: 'view-friends',
  stats: 'view-stats',
  game: 'view-game',
  achievements: 'view-achievements',
};

export function switchView(hideView: HTMLElement | null, showView: HTMLElement | null) {
  if (hideView) {
    hideView.classList.remove('active');
    setTimeout(() => {
      hideView.classList.add('hidden');
    }, 300);
  }

  if (showView) {
    setTimeout(() => {
      showView.classList.remove('hidden');
      setTimeout(() => {
        showView.classList.add('active');
      }, 50);
    }, hideView ? 300 : 0);
  }
}

export function navigateTo(targetViewKey: string, currentViewKey?: string): void {
  const targetId = registeredViews[targetViewKey] || targetViewKey;
  const currentId = currentViewKey ? (registeredViews[currentViewKey] || currentViewKey) : undefined;

  const showEl = document.getElementById(targetId);
  const hideEl = currentId
    ? document.getElementById(currentId)
    : (document.querySelector('.view.active') as HTMLElement | null);

  switchView(hideEl, showEl);
}

