import { switchView } from './viewManager';
import {
  fetchAchievementsOverview,
  claimAchievementReward,
  AchievementsServiceError
} from '../services/achievementsService';
import { getSession, onAuthChange, fetchCurrentUser } from '../services/authService';
import type { AchievementItem, AchievementCategory } from '@prop-hunt/shared';

export interface AchievementCategoryTab {
  id: AchievementCategory;
  label: string;
}

const CATEGORIES: AchievementCategoryTab[] = [
  { id: 'all', label: 'TOUS' },
  { id: 'general', label: 'GÉNÉRAL' },
  { id: 'hunter', label: 'CHASSEUR' },
  { id: 'prop', label: 'PROP' },
  { id: 'fun', label: 'INSOLITES' }
];

// État local du module des succès
const COIN_ICON_HTML = '<img src="/assets/coin.svg" class="coin-icon" alt="🪙" />';
let currentCategory: AchievementCategory = 'all';
let achievementsList: AchievementItem[] = [];
let unclaimedCount = 0;
let totalUnlocked = 0;
let totalAchievements = 0;
let totalCoinsEarned = 0;
let isLoading = false;
let errorMessage: string | null = null;
let toastTimeout: number | null = null;

// Fallback preview pour le mode non connecté (16 succès officiels)
const PREVIEW_ACHIEVEMENTS: AchievementItem[] = [
  {
    id: 1,
    internalName: 'ach_first_win',
    displayName: 'Première Victoire',
    description: 'Remportez votre toute première partie en tant que Prop ou Chasseur.',
    reward: 50,
    targetValue: 1,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'general',
    icon: '🥇'
  },
  {
    id: 30003,
    internalName: 'ach_win_5',
    displayName: 'Habitué du Podium',
    description: 'Remportez 5 victoires au total.',
    reward: 100,
    targetValue: 5,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'general',
    icon: '🎖️'
  },
  {
    id: 30004,
    internalName: 'ach_win_10',
    displayName: 'Maître du Jeu',
    description: 'Remportez 10 victoires au total.',
    reward: 250,
    targetValue: 10,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'general',
    icon: '👑'
  },
  {
    id: 4,
    internalName: 'ach_win_25',
    displayName: 'Légende Vivante',
    description: 'Remportez 25 victoires au total.',
    reward: 500,
    targetValue: 25,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'general',
    icon: '🏆'
  },
  {
    id: 5,
    internalName: 'ach_kill_1',
    displayName: 'Premier Sang',
    description: 'Éliminez votre premier Prop en tant que Chasseur.',
    reward: 50,
    targetValue: 1,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'hunter',
    icon: '🎯'
  },
  {
    id: 6,
    internalName: 'ach_cleaner',
    displayName: 'Nettoyeur',
    description: 'Éliminez 5 Props au total.',
    reward: 150,
    targetValue: 5,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'hunter',
    icon: '💥'
  },
  {
    id: 3,
    internalName: 'ach_terminator',
    displayName: 'Terminator',
    description: 'Éliminez 20 Props au total.',
    reward: 300,
    targetValue: 20,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'hunter',
    icon: '☠️'
  },
  {
    id: 30009,
    internalName: 'ach_survive_time',
    displayName: "Survivant de l'Extrême",
    description: 'Cumulez 10 minutes (600 secondes) de survie en tant que Prop.',
    reward: 150,
    targetValue: 600,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'prop',
    icon: '⏱️'
  },
  {
    id: 30010,
    internalName: 'ach_rich',
    displayName: 'Plein aux As',
    description: 'Atteignez un solde de 1 000 pièces en banque.',
    reward: 200,
    targetValue: 1000,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'general',
    icon: '💰'
  },
  {
    id: 30011,
    internalName: 'ach_taunt_spam',
    displayName: 'La Poule Mouillée',
    description: 'Déclenchez 10 railleries (Cot-cot !) pour narguer les Chasseurs.',
    reward: 100,
    targetValue: 10,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'fun',
    icon: '🐔'
  },
  {
    id: 2,
    internalName: 'ach_chameleon',
    displayName: 'Caméléon Compulsif',
    description: 'Métamorphosez-vous au moins 15 fois en Prop.',
    reward: 100,
    targetValue: 15,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'prop',
    icon: '🦎'
  },
  {
    id: 30013,
    internalName: 'ach_props_smasher',
    displayName: 'Démolisseur',
    description: 'Détruisez 10 objets du décor ou faux props.',
    reward: 100,
    targetValue: 10,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'hunter',
    icon: '🔨'
  },
  {
    id: 30014,
    internalName: 'ach_streak_3',
    displayName: 'Série Brûlante',
    description: 'Enchaînez une série de 3 victoires consécutives.',
    reward: 150,
    targetValue: 3,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'general',
    icon: '🔥'
  },
  {
    id: 30015,
    internalName: 'ach_make_friend',
    displayName: "C'est Beau l'Amitié",
    description: "Ayez au moins 1 ami dans votre liste d'amis.",
    reward: 50,
    targetValue: 1,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'fun',
    icon: '🤝'
  },
  {
    id: 30016,
    internalName: 'ach_damage_dealer',
    displayName: 'Gros Calibres',
    description: 'Infligez un total de 500 dégâts aux adversaires.',
    reward: 150,
    targetValue: 500,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'hunter',
    icon: '🧨'
  },
  {
    id: 30017,
    internalName: 'ach_veteran',
    displayName: 'Vétéran de PropJV',
    description: 'Disputez au moins 10 parties complètes.',
    reward: 150,
    targetValue: 10,
    progress: 0,
    progressPercent: 0,
    isUnlocked: false,
    unlockedAt: null,
    isClaimed: false,
    category: 'general',
    icon: '⭐'
  }
];

function getCategoryLabel(category: AchievementCategory): string {
  switch (category) {
    case 'general':
      return 'Général';
    case 'hunter':
      return 'Chasseur';
    case 'prop':
      return 'Prop';
    case 'fun':
      return 'Insolite';
    default:
      return 'Défi';
  }
}

function showAchievementToast(msg: string): void {
  const toast = document.getElementById('ach-toast-message');
  if (!toast) return;

  toast.textContent = msg;
  toast.classList.add('show');

  if (toastTimeout) window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 3200);
}

function renderCard(ach: AchievementItem, isAuthenticated: boolean): string {
  const isClaimable = isAuthenticated && ach.isUnlocked && !ach.isClaimed;
  const isClaimed = isAuthenticated && ach.isUnlocked && ach.isClaimed;
  const isCompleted = ach.isUnlocked;

  let cardClasses = 'achievement-card-wide';
  if (isClaimable) cardClasses += ' claimable glow-pulse';
  else if (isClaimed) cardClasses += ' completed unlocked';
  else if (isCompleted) cardClasses += ' completed';
  else cardClasses += ' locked';

  // Badge de statut (en haut à droite)
  let statusBadgeHtml = '';
  if (isClaimable) {
    statusBadgeHtml = `
      <span class="ach-status-badge claimable" title="Récompense prête à être récupérée">
        <span class="badge-dot pulse"></span>RÉCOMPENSE DISPO
      </span>
    `;
  } else if (isCompleted) {
    statusBadgeHtml = `
      <span class="ach-status-badge completed" title="Défi validé à 100% !">
        <span class="badge-star-icon">★</span>COMPLÉTÉ
      </span>
    `;
  } else {
    statusBadgeHtml = `
      <span class="ach-status-badge locked">
        <span class="lock-icon">🔒</span>EN COURS
      </span>
    `;
  }

  // Action / Statut dans le pied de carte
  let actionFooterHtml = '';
  if (isClaimable) {
    actionFooterHtml = `
      <button class="btn-claim-reward" data-claim-id="${ach.id}" title="Récupérer +${ach.reward} pièces">
        RÉCLAMER +${ach.reward} ${COIN_ICON_HTML}
      </button>
    `;
  } else if (isClaimed) {
    actionFooterHtml = `<span class="ach-check-mark"><span class="badge-check-icon">✓</span> Récompense Récupérée</span>`;
  } else if (isCompleted) {
    actionFooterHtml = `<span class="ach-check-mark"><span class="badge-star-icon">★</span> Validé</span>`;
  } else {
    actionFooterHtml = `<span class="ach-lock-mark">🔒 En attente</span>`;
  }

  // Badge pourcentage dédié
  const percentBadgeHtml = `
    <span class="ach-percent-badge ${isCompleted ? 'completed' : ''}" title="${ach.progressPercent}% accompli">
      ${ach.progressPercent}%
    </span>
  `;

  // Icône personnalisée SVG (avec fallback sur l'émoji d'origine si l'image est indisponible)
  const customIconUrl = `/assets/achievements/${ach.internalName}.svg`;

  return `
    <div class="${cardClasses}" data-achievement-id="${ach.id}" data-category="${ach.category}">
      ${isCompleted ? '<div class="ach-card-completed-glow" aria-hidden="true"></div>' : ''}
      <div class="ach-card-top">
        <span class="ach-category-tag">${getCategoryLabel(ach.category)}</span>
        <div class="ach-top-badges-group">
          ${percentBadgeHtml}
          ${statusBadgeHtml}
        </div>
      </div>

      <div class="ach-card-center">
        <div class="ach-icon-circle ${isCompleted ? 'glow-gold' : 'dimmed'}">
          <img
            src="${customIconUrl}"
            alt="${ach.displayName}"
            class="ach-custom-icon"
            onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';"
          />
          <span class="ach-emoji fallback-emoji" style="display: none;">${ach.icon}</span>
        </div>
        <h4 class="ach-card-title">${ach.displayName}</h4>
        <p class="ach-card-desc">${ach.description}</p>
      </div>

      <div class="ach-card-progress-wrapper">
        <div class="ach-card-progress-labels">
          <span class="ach-prog-val">
            Progression : <strong class="ach-prog-num">${ach.progress}</strong> / ${ach.targetValue}
          </span>
          <span class="ach-prog-pct-text">${ach.progressPercent}%</span>
        </div>
        <div class="ach-card-progress-bar-bg ${isCompleted ? 'completed' : ''}">
          <div class="ach-card-progress-fill ${isCompleted ? 'completed' : ''}" style="width: ${ach.progressPercent}%;">
            ${isCompleted ? '<div class="ach-progress-shimmer"></div>' : ''}
          </div>
        </div>
      </div>

      <div class="ach-card-footer">
        <div class="ach-reward-badge">
          ${COIN_ICON_HTML}
          <span class="reward-text">+${ach.reward} pièces</span>
        </div>
        <div class="ach-card-action">
          ${actionFooterHtml}
        </div>
      </div>
    </div>
  `;
}

function updateAchievementsView(): void {
  const session = getSession();
  const isAuthenticated = Boolean(session);
  const activeList = isAuthenticated && achievementsList.length > 0 ? achievementsList : PREVIEW_ACHIEVEMENTS;

  // Filtrage selon la catégorie sélectionnée
  const filteredList = currentCategory === 'all'
    ? activeList
    : activeList.filter((a) => a.category === currentCategory);

  // Mise à jour de la grille
  const grid = document.getElementById('achievements-grid');
  if (grid) {
    if (isLoading) {
      grid.innerHTML = `
        <div class="achievements-loading-box">
          <div class="spinner"></div>
          <p>Chargement de vos succès en cours...</p>
        </div>
      `;
    } else if (errorMessage) {
      grid.innerHTML = `
        <div class="achievements-error-box">
          <span class="error-icon">⚠️</span>
          <p>${errorMessage}</p>
          <button class="btn retry-btn" id="btn-ach-retry">RÉESSAYER</button>
        </div>
      `;
    } else if (filteredList.length === 0) {
      grid.innerHTML = `
        <div class="achievements-empty-box">
          <p>Aucun succès trouvé dans cette catégorie.</p>
        </div>
      `;
    } else {
      grid.innerHTML = filteredList.map((ach) => renderCard(ach, isAuthenticated)).join('');
    }
  }

  // Mise à jour de la bannière supérieure
  const counterElem = document.getElementById('ach-banner-counter');
  const barElem = document.getElementById('ach-banner-bar');
  const rewardsElem = document.getElementById('ach-banner-rewards');
  const unclaimedBanner = document.getElementById('ach-unclaimed-notice');

  const effUnlocked = isAuthenticated ? totalUnlocked : 0;
  const effTotal = isAuthenticated ? totalAchievements : PREVIEW_ACHIEVEMENTS.length;
  const effPercent = effTotal > 0 ? Math.round((effUnlocked / effTotal) * 100) : 0;
  const effCoins = isAuthenticated ? totalCoinsEarned : 0;

  if (counterElem) {
    counterElem.textContent = `${effUnlocked} / ${effTotal} Débloqués`;
  }
  const percentChip = document.getElementById('ach-banner-percent-chip');
  if (percentChip) {
    percentChip.textContent = `${effPercent}%`;
  }
  if (barElem) {
    barElem.style.width = `${effPercent}%`;
  }
  if (rewardsElem) {
    rewardsElem.innerHTML = `${COIN_ICON_HTML}<strong>+${effCoins}</strong> pièces`;
  }

  // Bannière d'alerte pour récompenses non réclamées
  if (unclaimedBanner) {
    if (isAuthenticated && unclaimedCount > 0) {
      unclaimedBanner.style.display = 'flex';
      unclaimedBanner.innerHTML = `
        <span class="bell-icon">🔔</span>
        <span>Vous avez <strong>${unclaimedCount} récompense(s)</strong> en attente ! Réclamez vos pièces ci-dessous.</span>
      `;
    } else {
      unclaimedBanner.style.display = 'none';
    }
  }

  // Bannière / Overlay d'invitation à se connecter
  const authPrompt = document.getElementById('ach-auth-prompt');
  if (authPrompt) {
    authPrompt.style.display = isAuthenticated ? 'none' : 'flex';
  }

  // Mise à jour de la classe active sur les onglets
  const tabButtons = document.querySelectorAll<HTMLButtonElement>('.ach-tab-btn');
  tabButtons.forEach((btn) => {
    const cat = btn.getAttribute('data-category');
    if (cat === currentCategory) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

export async function loadAchievements(): Promise<void> {
  const session = getSession();
  if (!session) {
    achievementsList = [];
    unclaimedCount = 0;
    totalUnlocked = 0;
    totalAchievements = PREVIEW_ACHIEVEMENTS.length;
    totalCoinsEarned = 0;
    isLoading = false;
    errorMessage = null;
    updateAchievementsView();
    return;
  }

  isLoading = true;
  errorMessage = null;
  updateAchievementsView();

  try {
    const data = await fetchAchievementsOverview();
    achievementsList = data.achievements;
    unclaimedCount = data.unclaimedCount;
    totalUnlocked = data.totalUnlocked;
    totalAchievements = data.totalAchievements;
    totalCoinsEarned = data.achievements
      .filter((a) => a.isClaimed)
      .reduce((sum, a) => sum + a.reward, 0);

    isLoading = false;
    updateAchievementsView();
  } catch (err) {
    isLoading = false;
    if (err instanceof AchievementsServiceError && err.status === 401) {
      errorMessage = null;
    } else {
      errorMessage = (err as Error).message || 'Impossible de récupérer les succès.';
    }
    updateAchievementsView();
  }
}

export function renderAchievements(): string {
  const tabsHtml = CATEGORIES.map(
    (cat) => `
      <button class="ach-tab-btn ${cat.id === currentCategory ? 'active' : ''}" data-category="${cat.id}">
        ${cat.label}
      </button>
    `
  ).join('');

  return `
    <!-- Vue : Succès & Hauts Faits -->
    <div id="view-achievements" class="view modal-view achievements-modal hidden">
      <div class="achievements-dashboard-wrapper">
        <!-- En-tête supérieur avec titre et retour -->
        <div class="achievements-top-bar">
          <div class="top-title-group">
            <h2 class="view-title purple-text">SUCCÈS & HAUTS FAITS</h2>
            <span class="top-subtitle">Relevez des défis en partie pour remporter des pièces et enrichir votre profil</span>
          </div>
          <button class="btn back top-back-btn" id="btn-back-main-from-achievements-top">
            ← RETOUR
          </button>
        </div>

        <!-- Grande bannière de progression horizontale -->
        <div class="achievements-summary-banner-wide">
          <div class="banner-trophy-icon">🏆</div>
          <div class="banner-progress-content">
            <div class="banner-progress-header">
              <span class="banner-progress-title">PROGRESSION DES DÉFIS</span>
              <div class="banner-stat-chips">
                <span class="banner-percent-chip" id="ach-banner-percent-chip">0%</span>
                <span class="banner-progress-counter" id="ach-banner-counter">0 / 16 Débloqués</span>
              </div>
            </div>
            <div class="banner-progress-track">
              <div class="banner-progress-bar" id="ach-banner-bar" style="width: 0%;"></div>
            </div>
          </div>
          <div class="banner-rewards-box">
            <span class="rewards-box-label">RÉCOMPENSES RÉCUPÉRÉES</span>
            <div class="rewards-box-value" id="ach-banner-rewards">
              ${COIN_ICON_HTML}
              <strong>+0</strong> pièces
            </div>
          </div>
        </div>

        <!-- Notification spéciale si des récompenses sont en attente -->
        <div id="ach-unclaimed-notice" class="ach-unclaimed-banner" style="display: none;"></div>

        <!-- Bandeau d'invitation à la connexion si en mode invité -->
        <div id="ach-auth-prompt" class="ach-auth-prompt-banner" style="display: none;">
          <div class="prompt-text">
            <strong>MODE INVITÉ :</strong> Connectez-vous pour sauvegarder votre progression et réclamer vos pièces !
          </div>
          <button class="btn-ach-connect" id="btn-ach-login-cta">SE CONNECTER</button>
        </div>

        <!-- Barre d'onglets de filtrage par catégorie -->
        <div class="achievements-tabs-bar" id="ach-tabs-container">
          ${tabsHtml}
        </div>

        <!-- Grille responsive des cartes de succès -->
        <div class="achievements-grid-wide" id="achievements-grid">
          <!-- Les cartes sont générées dynamiquement par updateAchievementsView() -->
        </div>

        <!-- Toast de notification interne -->
        <div id="ach-toast-message" class="ach-toast" role="status" aria-live="polite"></div>
      </div>
    </div>
  `;
}

export function initAchievements(): void {
  const viewMain = document.getElementById('view-main');
  const viewAchievements = document.getElementById('view-achievements');
  const btnBackTop = document.getElementById('btn-back-main-from-achievements-top');
  const btnAchievements = document.getElementById('btn-achievements');
  const tabsContainer = document.getElementById('ach-tabs-container');
  const grid = document.getElementById('achievements-grid');
  const loginCta = document.getElementById('btn-ach-login-cta');

  // Navigation retour au menu principal
  if (btnBackTop) {
    btnBackTop.addEventListener('click', () => switchView(viewAchievements, viewMain));
  }

  // Clic sur l'icône succès dans le menu principal
  if (btnAchievements) {
    btnAchievements.addEventListener('click', () => {
      void loadAchievements();
    });
  }

  // Filtrage par onglets
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLButtonElement>('.ach-tab-btn');
      if (!target) return;
      const cat = target.getAttribute('data-category') as AchievementCategory;
      if (cat && cat !== currentCategory) {
        currentCategory = cat;
        updateAchievementsView();
      }
    });
  }

  // Réclamation de récompense
  if (grid) {
    grid.addEventListener('click', async (e) => {
      const claimBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('.btn-claim-reward');
      if (claimBtn) {
        const achIdStr = claimBtn.getAttribute('data-claim-id');
        if (!achIdStr) return;
        const achId = Number.parseInt(achIdStr, 10);
        if (Number.isNaN(achId)) return;

        claimBtn.disabled = true;
        claimBtn.textContent = 'RÉCLAMATION...';

        try {
          const res = await claimAchievementReward(achId);
          showAchievementToast(`🎉 Bravo ! +${res.rewardClaimed} pièces ajoutées à votre compte !`);

          // Mise à jour de la session utilisateur pour actualiser le solde
          void fetchCurrentUser().catch(() => {});

          // Rechargement des succès
          await loadAchievements();
        } catch (err) {
          claimBtn.disabled = false;
          claimBtn.textContent = 'RÉCLAMER';
          showAchievementToast(`Erreur : ${(err as Error).message}`);
        }
        return;
      }

      // Bouton Réessayer en cas d'erreur réseau
      const retryBtn = (e.target as HTMLElement).closest<HTMLButtonElement>('#btn-ach-retry');
      if (retryBtn) {
        void loadAchievements();
      }
    });
  }

  // CTA Connexion depuis le bandeau invité
  if (loginCta) {
    loginCta.addEventListener('click', () => {
      const btnAuthStatus = document.getElementById('btn-auth-status');
      if (btnAuthStatus) {
        btnAuthStatus.click();
      }
    });
  }

  // Rafraîchissement automatique lors de la connexion / déconnexion
  onAuthChange(() => {
    if (viewAchievements && !viewAchievements.classList.contains('hidden')) {
      void loadAchievements();
    }
  });

  // Chargement initial au démarrage
  updateAchievementsView();
}
