import { switchView } from './viewManager';

export interface SeekerClassData {
  id: string;
  name: string;
  hp: number;
  price: number;
  isOwned: boolean;
  role: string;
  speed: string;
  description: string;
  icon: string;
}

export interface TauntData {
  id: string;
  name: string;
  audioPath: string;
  icon: string;
  price: number;
  isOwned: boolean;
}

export const SEEKER_CLASSES: SeekerClassData[] = [
  {
    id: 'recruit',
    name: 'Recrue',
    hp: 100,
    price: 0,
    isOwned: true,
    role: 'Chasseur Équilibré',
    speed: 'Standard',
    description: 'Classe de base agile et polyvalente, équipée pour la traque et le repérage.',
    icon: '🎯',
  },
  {
    id: 'juggernaut',
    name: 'Colosse',
    hp: 160,
    price: 500,
    isOwned: false, // À acheter en boutique
    role: 'Chasseur Blindé',
    speed: 'Légèrement réduite',
    description: 'Armure lourde renforcée absorbant les attaques. Nécessite 500 pièces.',
    icon: '🛡️',
  },
];

export const TAUNTS_COLLECTION: TauntData[] = [
  {
    id: 'chicken',
    name: 'Cot-cot',
    audioPath: '/assets/audio/chicken.ogg',
    icon: '🐔',
    price: 0,
    isOwned: true,
  },
  {
    id: 'evil_laugh',
    name: 'Rire machiavélique',
    audioPath: '/assets/audio/evil_laugh.ogg',
    icon: '😈',
    price: 150,
    isOwned: true,
  },
  {
    id: 'whistle',
    name: 'Sifflement',
    audioPath: '/assets/audio/whistle.ogg',
    icon: '😙',
    price: 100,
    isOwned: false, // À acheter en boutique
  },
];

interface ProfileState {
  username: string;
  coins: number;
  score: number;
  seekerWins: number;
  hiderWins: number;
  activeTab: 'taunts' | 'classes';
  tauntSlots: (string | null)[]; // 5 slots de roue
  selectedSlotIndex: number | null; // Slot cible sélectionné pour assignation rapide
  currentlyPlayingId: string | null;
  notificationMessage: string | null;
}

const state: ProfileState = {
  username: 'Seekertest',
  coins: 250,
  score: 4200,
  seekerWins: 26,
  hiderWins: 4,
  activeTab: 'taunts',
  tauntSlots: ['chicken', null, null, null, null], // Slot 1 = Cot-cot, 2 à 5 = Vide
  selectedSlotIndex: null,
  currentlyPlayingId: null,
  notificationMessage: null,
};

let currentAudioInstance: HTMLAudioElement | null = null;
let notificationTimeout: number | null = null;

function showToast(message: string): void {
  state.notificationMessage = message;
  if (notificationTimeout) clearTimeout(notificationTimeout);
  notificationTimeout = window.setTimeout(() => {
    state.notificationMessage = null;
    const toast = document.getElementById('profile-toast-message');
    if (toast) toast.classList.remove('show');
  }, 2600);
}

function playTauntAudio(tauntId: string, audioPath: string, onEnded?: () => void): void {
  try {
    if (currentAudioInstance) {
      currentAudioInstance.pause();
      currentAudioInstance.currentTime = 0;
    }

    state.currentlyPlayingId = tauntId;
    const audio = new Audio(audioPath);
    currentAudioInstance = audio;

    audio.onended = () => {
      state.currentlyPlayingId = null;
      if (onEnded) onEnded();
    };

    audio.onerror = () => {
      state.currentlyPlayingId = null;
      if (onEnded) onEnded();
    };

    audio.play().catch((err) => {
      console.warn(`Lecture audio (${audioPath}) bloquée :`, err);
      state.currentlyPlayingId = null;
      if (onEnded) onEnded();
    });
  } catch (err) {
    console.warn('Erreur audio :', err);
    state.currentlyPlayingId = null;
    if (onEnded) onEnded();
  }
}

// ----------------------------------------------------
// RENDU : LES 5 SLOTS DU LOADOUT
// ----------------------------------------------------
function renderWheelSlotsHtml(): string {
  return state.tauntSlots
    .map((tauntId, index) => {
      const slotNum = index + 1;
      const isSelected = state.selectedSlotIndex === index;
      const taunt = tauntId ? TAUNTS_COLLECTION.find((t) => t.id === tauntId) : null;

      if (taunt) {
        return `
          <div class="wheel-slot-capsule slot-filled ${isSelected ? 'is-target' : ''}" 
               data-slot-index="${index}" 
               title="Slot ${slotNum} : ${taunt.name} (Cliquez pour cibler ou vider)">
            <span class="capsule-num">#${slotNum}</span>
            <span class="capsule-icon">${taunt.icon}</span>
            <span class="capsule-name">${taunt.name}</span>
            <button class="capsule-clear-btn" data-slot-index="${index}" title="Vider ce slot">✕</button>
          </div>
        `;
      }

      return `
        <div class="wheel-slot-capsule slot-empty ${isSelected ? 'is-target' : ''}" 
             data-slot-index="${index}" 
             title="Slot ${slotNum} : Vide (Cliquez pour y équiper un taunt)">
          <span class="capsule-num">#${slotNum}</span>
          <span class="capsule-icon empty-icon">➕</span>
          <span class="capsule-name empty-name">Vide</span>
        </div>
      `;
    })
    .join('');
}

// ----------------------------------------------------
// RENDU : VITRINE DES TAUNTS (GRILLE DE TUILES SHOWCASE)
// ----------------------------------------------------
function renderTauntsShowcaseHtml(): string {
  return TAUNTS_COLLECTION.map((taunt) => {
    const isPlaying = state.currentlyPlayingId === taunt.id;
    const slotIndex = state.tauntSlots.indexOf(taunt.id);
    const isEquipped = slotIndex !== -1;

    let statusBadgeHtml = '';
    let actionBtnHtml = '';

    if (!taunt.isOwned) {
      statusBadgeHtml = `<span class="tile-status-badge locked-badge">🔒 ${taunt.price} 🪙</span>`;
      actionBtnHtml = `
        <button class="tile-action-btn btn-buy-taunt" data-taunt-id="${taunt.id}">
          Acheter (${taunt.price} 🪙)
        </button>
      `;
    } else if (isEquipped) {
      statusBadgeHtml = `<span class="tile-status-badge equipped-badge">✓ SLOT ${slotIndex + 1}</span>`;
      actionBtnHtml = `
        <button class="tile-action-btn btn-unequip-taunt" data-taunt-id="${taunt.id}">
          Retirer du Slot ${slotIndex + 1}
        </button>
      `;
    } else {
      statusBadgeHtml = `<span class="tile-status-badge owned-badge">DISPONIBLE</span>`;
      const targetText =
        state.selectedSlotIndex !== null
          ? `Équiper sur Slot #${state.selectedSlotIndex + 1}`
          : `Équiper`;
      actionBtnHtml = `
        <button class="tile-action-btn btn-equip-taunt ${state.selectedSlotIndex !== null ? 'is-targeted' : ''}" 
                data-taunt-id="${taunt.id}">
          ${targetText}
        </button>
      `;
    }

    return `
      <div class="taunt-showcase-tile ${!taunt.isOwned ? 'tile-locked' : ''} ${isEquipped ? 'tile-equipped' : ''}" 
           data-taunt-id="${taunt.id}">
        <div class="tile-top-bar">
          ${statusBadgeHtml}
          <button class="tile-audio-btn ${isPlaying ? 'playing' : ''}" 
                  data-taunt-id="${taunt.id}" 
                  data-audio-path="${taunt.audioPath}" 
                  title="Écouter l'extrait audio">
            ${isPlaying ? '🔊' : '▶'}
          </button>
        </div>

        <div class="tile-center">
          <span class="tile-hero-icon">${taunt.icon}</span>
          <h4 class="tile-title">${taunt.name}</h4>
        </div>

        <div class="tile-bottom">
          ${actionBtnHtml}
        </div>
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------
// RENDU : VITRINE DES CLASSES SEEKER (SHOWCASE INVENTAIRE SANS ÉQUIPEMENT)
// ----------------------------------------------------
function renderSeekerClassesShowcaseHtml(): string {
  return SEEKER_CLASSES.map((cls) => {
    return `
      <div class="class-showcase-card ${cls.isOwned ? 'card-owned' : 'card-locked'}" data-class-id="${cls.id}">
        <div class="card-status-banner">
          ${
            cls.isOwned
              ? `<span class="tile-status-badge owned-badge">POSSÉDÉ</span>`
              : `<span class="tile-status-badge locked-badge">🔒 ${cls.price} 🪙</span>`
          }
          <span class="class-hp-tag">${cls.hp} PV</span>
        </div>

        <div class="card-visual-center">
          <div class="card-class-avatar">
            <span class="avatar-icon">${cls.icon}</span>
          </div>
          <h3 class="card-class-title">${cls.name}</h3>
          <span class="card-class-role">${cls.role}</span>
        </div>

        <div class="card-specs-box">
          <div class="spec-row">
            <span>Points de vie</span>
            <div class="spec-bar-wrapper">
              <div class="spec-bar-fill" style="width: ${(cls.hp / 160) * 100}%;"></div>
            </div>
            <strong>${cls.hp} PV</strong>
          </div>
          <div class="spec-row">
            <span>Vitesse</span>
            <strong>${cls.speed}</strong>
          </div>
        </div>

        <p class="card-desc">${cls.description}</p>

        ${
          !cls.isOwned
            ? `
              <div class="card-footer-info">
                <button class="tile-action-btn btn-buy-taunt btn-attempt-buy-class" data-class-id="${cls.id}">
                  Acheter (${cls.price} 🪙)
                </button>
              </div>
            `
            : ''
        }
      </div>
    `;
  }).join('');
}

// ----------------------------------------------------
// RENDU PRINCIPAL DU PROFIL (GRAND FORMAT BIEN RANGÉ)
// ----------------------------------------------------
export function renderProfile(): string {
  const ownedTauntsCount = TAUNTS_COLLECTION.filter((t) => t.isOwned).length;
  const equippedTauntsCount = state.tauntSlots.filter((s) => s !== null).length;
  const ownedClassesCount = SEEKER_CLASSES.filter((c) => c.isOwned).length;

  return `
    <!-- Vue 5 : Profil & Inventaire (Grand Format Harmonieux) -->
    <div id="view-profile" class="view modal-view profile-modal hidden">
      <div class="profile-dashboard-top-bar">
        <div class="top-title-group">
          <h2 class="view-title blue-text">PROFIL & INVENTAIRE</h2>
          <span class="top-subtitle">Gérez vos répliques sonores et consultez votre équipement de traqueur</span>
        </div>
        <button class="btn back top-back-btn" id="btn-back-main-from-profile-top">
          ← RETOUR
        </button>
      </div>

      <!-- Toast contextuel pour retours d'actions -->
      <div class="profile-toast ${state.notificationMessage ? 'show' : ''}" id="profile-toast-message">
        ${state.notificationMessage || ''}
      </div>

      <div class="profile-scroll-container">
        <!-- 1. En-tête Profil Unifié en Pleine Largeur (Bien Rangé) -->
        <div class="profile-header-card">
          <!-- Identité Joueur -->
          <div class="profile-player-identity">
            <div class="profile-avatar-glow">
              <span class="profile-avatar-emoji">🕵️</span>
              <span class="status-indicator-dot online" title="En ligne"></span>
            </div>
            <div class="profile-user-info">
              <div class="profile-username-tag">
                <span class="profile-username" id="profile-display-username">${state.username}</span>
                <span class="profile-badge-online">En ligne</span>
              </div>
              <span class="profile-rank-tag">Joueur Vétéran • Rang Or</span>
            </div>
          </div>

          <!-- Statistiques de Combat -->
          <div class="profile-stats-row">
            <div class="profile-stat-box">
              <span class="stat-box-label">SCORE GLOBAL</span>
              <span class="stat-box-value text-cyan">${state.score}</span>
            </div>
            <div class="profile-stat-box">
              <span class="stat-box-label">VICTOIRES SEEKER</span>
              <span class="stat-box-value text-purple">${state.seekerWins} victoires</span>
            </div>
            <div class="profile-stat-box">
              <span class="stat-box-label">VICTOIRES HIDER</span>
              <span class="stat-box-value text-purple">${state.hiderWins} victoires</span>
            </div>
          </div>

          <!-- Solde de Pièces -->
          <div class="profile-balance-widget" id="profile-coins-display">
            <span class="coin-icon">🪙</span>
            <div class="balance-text-group">
              <span class="balance-amount">${state.coins}</span>
              <span class="balance-label">pièces</span>
            </div>
          </div>
        </div>

        <!-- 2. Barre d'Onglets Horizontale Claire et Structurée -->
        <div class="inventory-tabs-bar">
          <button class="inventory-tab-btn ${state.activeTab === 'taunts' ? 'active' : ''}" data-tab="taunts">
            <span>🔊 ROUE & TAUNTS</span>
            <span class="tab-badge" id="badge-taunts-equipped">${equippedTauntsCount}/5 équipés</span>
          </button>
          <button class="inventory-tab-btn ${state.activeTab === 'classes' ? 'active' : ''}" data-tab="classes">
            <span>🎯 ARMURERIE & CLASSES</span>
            <span class="tab-badge" id="badge-classes-owned">${ownedClassesCount}/2</span>
          </button>
        </div>

        <!-- 3. Contenu de l'onglet : Roue des Taunts (5 slots) & Collection -->
        <div class="inventory-tab-content ${state.activeTab === 'taunts' ? 'active' : 'hidden'}" id="tab-content-taunts">
          <!-- Loadout HUD des 5 slots -->
          <div class="taunt-hud-section">
            <div class="hud-header">
              <div class="hud-title-wrap">
                <span class="hud-title">ROUE DES TAUNTS (5 EMPLACEMENTS)</span>
                <span class="hud-helper-text">
                  ${
                    state.selectedSlotIndex !== null
                      ? `<strong class="gold-highlight">Slot #${state.selectedSlotIndex + 1} sélectionné</strong> — Cliquez sur « Équiper » pour l'assigner`
                      : 'Cliquez sur un emplacement pour le cibler, ou directement sur « Équiper » pour remplir le prochain slot'
                  }
                </span>
              </div>
              ${
                state.selectedSlotIndex !== null
                  ? `<button class="btn-cancel-slot-target" id="btn-cancel-slot-target">Annuler sélection</button>`
                  : ''
              }
            </div>

            <div class="wheel-capsules-grid" id="wheel-capsules-container">
              ${renderWheelSlotsHtml()}
            </div>
          </div>

          <!-- Vitrine Showcase des Taunts en Grille -->
          <div class="taunts-showcase-section">
            <div class="showcase-section-header">
              <div class="heading-group">
                <h3 class="section-heading">COLLECTION DE TAUNTS</h3>
                <span class="section-subtext">Pré-écoutez les voix et assignez-les à vos emplacements de roue</span>
              </div>
              <span class="section-counter">${ownedTauntsCount} possédés sur ${TAUNTS_COLLECTION.length}</span>
            </div>

            <div class="taunts-showcase-grid" id="taunts-showcase-container">
              ${renderTauntsShowcaseHtml()}
            </div>
          </div>
        </div>

        <!-- 4. Contenu de l'onglet : Inventaire des Classes Seeker (Vitrine d'inventaire) -->
        <div class="inventory-tab-content ${state.activeTab === 'classes' ? 'active' : 'hidden'}" id="tab-content-classes">
          <div class="classes-showcase-section">
            <div class="showcase-section-header">
              <div class="heading-group">
                <h3 class="section-heading">ARMURERIE DES CLASSES SEEKER</h3>
                <span class="section-subtext">Consultez les caractéristiques de vos classes de traqueur débloquées</span>
              </div>
              <span class="section-counter">${ownedClassesCount} / ${SEEKER_CLASSES.length} possédée(s)</span>
            </div>

            <div class="classes-showcase-grid" id="classes-showcase-container">
              ${renderSeekerClassesShowcaseHtml()}
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}

// ----------------------------------------------------
// CONTRÔLEUR ET INTERACTIONS DU PROFIL
// ----------------------------------------------------
export function initProfile(): void {
  const viewMain = document.getElementById('view-main');
  const viewProfile = document.getElementById('view-profile');
  const btnBackTop = document.getElementById('btn-back-main-from-profile-top');

  if (btnBackTop) {
    btnBackTop.addEventListener('click', () => switchView(viewProfile, viewMain));
  }

  const updateProfileUI = () => {
    // 1. Mise à jour de l'onglet actif
    const tabTaunts = document.getElementById('tab-content-taunts');
    const tabClasses = document.getElementById('tab-content-classes');
    const tabBtns = document.querySelectorAll('.inventory-tab-btn');

    tabBtns.forEach((btn) => {
      const tab = btn.getAttribute('data-tab');
      if (tab === state.activeTab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (tabTaunts && tabClasses) {
      if (state.activeTab === 'taunts') {
        tabTaunts.classList.remove('hidden');
        tabTaunts.classList.add('active');
        tabClasses.classList.add('hidden');
        tabClasses.classList.remove('active');
      } else {
        tabClasses.classList.remove('hidden');
        tabClasses.classList.add('active');
        tabTaunts.classList.add('hidden');
        tabTaunts.classList.remove('active');
      }
    }

    // 2. Solde en pièces
    const coinsDisplay = document.getElementById('profile-coins-display');
    if (coinsDisplay) {
      coinsDisplay.innerHTML = `
        <span class="coin-icon">🪙</span>
        <div class="balance-text-group">
          <span class="balance-amount">${state.coins}</span>
          <span class="balance-label">pièces</span>
        </div>
      `;
    }

    // 3. Capsules des 5 slots
    const capsulesContainer = document.getElementById('wheel-capsules-container');
    if (capsulesContainer) {
      capsulesContainer.innerHTML = renderWheelSlotsHtml();
    }

    // 4. Texte d'aide et bouton d'annulation de sélection
    const helperText = document.querySelector('.taunt-hud-section .hud-helper-text');
    if (helperText) {
      helperText.innerHTML =
        state.selectedSlotIndex !== null
          ? `<strong class="gold-highlight">Slot #${state.selectedSlotIndex + 1} sélectionné</strong> — Cliquez sur « Équiper » pour l'assigner`
          : 'Cliquez sur un emplacement pour le cibler, ou directement sur « Équiper » pour remplir le prochain slot';
    }

    const hudHeader = document.querySelector('.taunt-hud-section .hud-header');
    const cancelSlotBtn = document.getElementById('btn-cancel-slot-target');
    if (hudHeader) {
      if (state.selectedSlotIndex !== null && !cancelSlotBtn) {
        const btn = document.createElement('button');
        btn.className = 'btn-cancel-slot-target';
        btn.id = 'btn-cancel-slot-target';
        btn.textContent = 'Annuler sélection';
        hudHeader.appendChild(btn);
      } else if (state.selectedSlotIndex === null && cancelSlotBtn) {
        cancelSlotBtn.remove();
      }
    }

    // 5. Grille des taunts
    const tauntsContainer = document.getElementById('taunts-showcase-container');
    if (tauntsContainer) {
      tauntsContainer.innerHTML = renderTauntsShowcaseHtml();
    }

    // 6. Badges des onglets
    const equippedTauntsCount = state.tauntSlots.filter((s) => s !== null).length;
    const badgeTaunts = document.getElementById('badge-taunts-equipped');
    if (badgeTaunts) {
      badgeTaunts.textContent = `${equippedTauntsCount}/5 équipés`;
    }

    const ownedClassesCount = SEEKER_CLASSES.filter((c) => c.isOwned).length;
    const badgeClasses = document.getElementById('badge-classes-owned');
    if (badgeClasses) {
      badgeClasses.textContent = `${ownedClassesCount}/2`;
    }

    // 7. Toast message
    const toast = document.getElementById('profile-toast-message');
    if (toast && state.notificationMessage) {
      toast.textContent = state.notificationMessage;
      toast.classList.add('show');
    }

    // 8. Grille des classes Seeker
    const classesContainer = document.getElementById('classes-showcase-container');
    if (classesContainer) {
      classesContainer.innerHTML = renderSeekerClassesShowcaseHtml();
    }
  };

  if (!viewProfile) return;

  viewProfile.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;

    // A. Switch d'onglets
    const tabBtn = target.closest('.inventory-tab-btn');
    if (tabBtn) {
      const tab = tabBtn.getAttribute('data-tab') as 'taunts' | 'classes' | null;
      if (tab && state.activeTab !== tab) {
        state.activeTab = tab;
        updateProfileUI();
      }
      return;
    }

    // B. Annulation sélection slot cible
    if (target.id === 'btn-cancel-slot-target') {
      state.selectedSlotIndex = null;
      updateProfileUI();
      return;
    }

    // C. Clic pour vider un slot
    const clearBtn = target.closest('.capsule-clear-btn');
    if (clearBtn) {
      const slotIdx = Number(clearBtn.getAttribute('data-slot-index'));
      if (!isNaN(slotIdx)) {
        const clearedTauntId = state.tauntSlots[slotIdx];
        const clearedTaunt = TAUNTS_COLLECTION.find((t) => t.id === clearedTauntId);
        state.tauntSlots[slotIdx] = null;
        if (state.selectedSlotIndex === slotIdx) state.selectedSlotIndex = null;
        showToast(`Slot #${slotIdx + 1} (${clearedTaunt?.name || 'Taunt'}) vidé.`);
        updateProfileUI();
      }
      return;
    }

    // D. Clic sur une capsule de slot (cibler ou basculer)
    const slotCapsule = target.closest('.wheel-slot-capsule');
    if (slotCapsule) {
      const slotIdx = Number(slotCapsule.getAttribute('data-slot-index'));
      if (!isNaN(slotIdx)) {
        if (state.selectedSlotIndex === slotIdx) {
          state.selectedSlotIndex = null;
        } else {
          state.selectedSlotIndex = slotIdx;
        }
        updateProfileUI();
      }
      return;
    }

    // E. Pré-écoute audio ▶ / 🔊
    const playAudioBtn = target.closest('.tile-audio-btn');
    if (playAudioBtn) {
      const tauntId = playAudioBtn.getAttribute('data-taunt-id');
      const audioPath = playAudioBtn.getAttribute('data-audio-path');
      if (tauntId && audioPath) {
        playTauntAudio(tauntId, audioPath, () => updateProfileUI());
        updateProfileUI();
      }
      return;
    }

    // F. Retirer un taunt de la roue
    const unequipBtn = target.closest('.btn-unequip-taunt');
    if (unequipBtn) {
      const tauntId = unequipBtn.getAttribute('data-taunt-id');
      const taunt = TAUNTS_COLLECTION.find((t) => t.id === tauntId);
      if (tauntId) {
        state.tauntSlots = state.tauntSlots.map((s) => (s === tauntId ? null : s));
        showToast(`« ${taunt?.name || 'Taunt'} » retiré de la roue.`);
        updateProfileUI();
      }
      return;
    }

    // G. Équiper un taunt (Slot sélectionné ou premier slot libre)
    const equipBtn = target.closest('.btn-equip-taunt');
    if (equipBtn) {
      const tauntId = equipBtn.getAttribute('data-taunt-id');
      const taunt = TAUNTS_COLLECTION.find((t) => t.id === tauntId);
      if (taunt) {
        if (state.selectedSlotIndex !== null) {
          const targetSlot = state.selectedSlotIndex;
          state.tauntSlots = state.tauntSlots.map((s, idx) =>
            idx === targetSlot ? tauntId : s === tauntId ? null : s
          );
          state.selectedSlotIndex = null;
          showToast(`« ${taunt.name} » placé sur le Slot #${targetSlot + 1} !`);
        } else {
          const firstEmptySlot = state.tauntSlots.indexOf(null);
          if (firstEmptySlot !== -1) {
            state.tauntSlots[firstEmptySlot] = tauntId;
            showToast(`« ${taunt.name} » équipé sur le Slot #${firstEmptySlot + 1} !`);
          } else {
            state.tauntSlots[0] = tauntId;
            showToast(`Roue pleine : « ${taunt.name} » assigné sur le Slot #1 !`);
          }
        }
        updateProfileUI();
      }
      return;
    }

    // H. Achat d'un taunt en boutique (Simulation interactive)
    const buyTauntBtn = target.closest('.btn-buy-taunt');
    if (buyTauntBtn) {
      const tauntId = buyTauntBtn.getAttribute('data-taunt-id');
      const taunt = TAUNTS_COLLECTION.find((t) => t.id === tauntId);
      if (taunt && !taunt.isOwned) {
        if (state.coins >= taunt.price) {
          state.coins -= taunt.price;
          taunt.isOwned = true;
          showToast(`Achat réussi ! « ${taunt.name} » débloqué (-${taunt.price} 🪙).`);
          updateProfileUI();
        } else {
          showToast(`Solde insuffisant : ${state.coins} / ${taunt.price} 🪙 requis.`);
        }
      }
      return;
    }

    // I. Tentative d'achat de classe Seeker (Colosse à 500 pièces)
    const buyClassBtn = target.closest('.btn-attempt-buy-class');
    if (buyClassBtn) {
      const classId = buyClassBtn.getAttribute('data-class-id');
      const cls = SEEKER_CLASSES.find((c) => c.id === classId);
      if (cls && !cls.isOwned) {
        if (state.coins >= cls.price) {
          state.coins -= cls.price;
          cls.isOwned = true;
          showToast(`Classe « ${cls.name} » débloquée avec succès !`);
          updateProfileUI();
        } else {
          showToast(`Pièces insuffisantes : ${state.coins} / ${cls.price} 🪙 nécessaires pour le Colosse.`);
        }
      }
      return;
    }
  });
}
