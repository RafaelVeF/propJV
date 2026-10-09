import { switchView } from './viewManager';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  reward: number;
  unlocked: boolean;
  icon: string;
  category: string;
}

export const MOCK_ACHIEVEMENTS: Achievement[] = [
  {
    id: 'ach_first_win',
    title: 'Première victoire',
    description: 'Remportez votre première partie en tant que Seeker ou Hider.',
    reward: 50,
    unlocked: true,
    icon: '🏆',
    category: 'Général',
  },
  {
    id: 'ach_chameleon',
    title: 'Caméléon',
    description: 'Survivez à une partie complète sans changer une seule fois d’objet.',
    reward: 100,
    unlocked: true,
    icon: '🦎',
    category: 'Hider',
  },
  {
    id: 'ach_cleaner',
    title: 'Nettoyeur',
    description: 'Éliminez 3 objets cachés dans la même partie en tant que Seeker.',
    reward: 150,
    unlocked: false,
    icon: '🎯',
    category: 'Seeker',
  },
];

export function renderAchievements(): string {
  const unlockedCount = MOCK_ACHIEVEMENTS.filter((a) => a.unlocked).length;
  const totalCount = MOCK_ACHIEVEMENTS.length;
  const progressPercent = Math.round((unlockedCount / totalCount) * 100);
  const totalCoinsEarned = MOCK_ACHIEVEMENTS.filter((a) => a.unlocked).reduce(
    (sum, a) => sum + a.reward,
    0
  );

  const achievementsCardsHtml = MOCK_ACHIEVEMENTS.map((ach) => {
    const cardClass = ach.unlocked
      ? 'achievement-card-wide unlocked'
      : 'achievement-card-wide locked';

    const statusBadge = ach.unlocked
      ? `<span class="ach-status-badge unlocked"><span class="badge-dot"></span>DÉBLOQUÉ</span>`
      : `<span class="ach-status-badge locked"><span class="lock-icon">🔒</span>VERROUILLÉ</span>`;

    return `
      <div class="${cardClass}" data-achievement-id="${ach.id}">
        <div class="ach-card-top">
          <span class="ach-category-tag">${ach.category}</span>
          ${statusBadge}
        </div>

        <div class="ach-card-center">
          <div class="ach-icon-circle ${ach.unlocked ? 'glow-gold' : 'dimmed'}">
            <span class="ach-emoji">${ach.icon}</span>
          </div>
          <h4 class="ach-card-title">${ach.title}</h4>
          <p class="ach-card-desc">${ach.description}</p>
        </div>

        <div class="ach-card-footer">
          <div class="ach-reward-badge">
            <span class="coin-icon">🪙</span>
            <span class="reward-text">+${ach.reward} pièces</span>
          </div>
          ${
            ach.unlocked
              ? `<span class="ach-check-mark">✓ Terminé</span>`
              : `<span class="ach-lock-mark">🔒 En attente</span>`
          }
        </div>
      </div>
    `;
  }).join('');

  return `
    <!-- Vue : Succès (Grand Format Horizontal) -->
    <div id="view-achievements" class="view modal-view achievements-modal hidden">
      <div class="achievements-dashboard-wrapper">
        <!-- En-tête supérieur -->
        <div class="achievements-top-bar">
          <div class="top-title-group">
            <h2 class="view-title purple-text">SUCCÈS & HAUTS FAITS</h2>
            <span class="top-subtitle">Débloquez des défis en partie pour remporter des pièces et des récompenses</span>
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
              <span class="banner-progress-counter">${unlockedCount} / ${totalCount} Débloqués (${progressPercent}%)</span>
            </div>
            <div class="banner-progress-track">
              <div class="banner-progress-bar" style="width: ${progressPercent}%;"></div>
            </div>
          </div>
          <div class="banner-rewards-box">
            <span class="rewards-box-label">RÉCOMPENSES GAGNÉES</span>
            <div class="rewards-box-value">
              <span class="coin-icon">🪙</span>
              <strong>+${totalCoinsEarned}</strong> pièces
            </div>
          </div>
        </div>

        <!-- Grille large des cartes de succès (3 colonnes horizontales) -->
        <div class="achievements-grid-wide">
          ${achievementsCardsHtml}
        </div>
      </div>
    </div>
  `;
}

export function initAchievements(): void {
  const viewMain = document.getElementById('view-main');
  const viewAchievements = document.getElementById('view-achievements');
  const btnBackTop = document.getElementById('btn-back-main-from-achievements-top');

  const goBack = () => switchView(viewAchievements, viewMain);

  if (btnBackTop) {
    btnBackTop.addEventListener('click', goBack);
  }
}
