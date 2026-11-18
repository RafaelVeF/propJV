import { switchView, navigateTo } from './viewManager';
import { isAuthenticated, onAuthChange, getCurrentUser } from '../services/authService';
import {
  fetchMyStats,
  fetchMatchDetails,
  StatsServiceError,
  type MyStatsPayload,
  type RecentMatchItem,
  type MatchDetailsPayload,
  type MatchParticipant,
  type MatchTelemetryEvent,
  type MatchTelemetryPlayer,
} from '../services/statsService';

type StatsTabId = 'overview' | 'roles' | 'archives';
type RoleCamp = 'HIDER' | 'SEEKER';
type ArchiveFilter = 'ALL' | 'WINS' | 'LOSSES';
type ReportSubView = 'scoreboard' | 'timeline';

interface PropMeta {
  label: string;
  sprite: string;
}

const PROP_CATALOG: Record<string, PropMeta> = {
  prop_can: {
    label: 'Canette',
    sprite: '/assets/props/can/Can_F.png',
  },
  prop_chair: {
    label: 'Chaise',
    sprite: '/assets/props/chair/Chair_F.png',
  },
  prop_desk: {
    label: 'Bureau',
    sprite: '/assets/props/desk/Desk_F.png',
  },
  prop_bag: {
    label: 'Sac à dos',
    sprite: '/assets/props/bag/Bag_F.png',
  },
  prop_wall_painting: {
    label: 'Tableau mural',
    sprite: '/assets/props/board/Tableau_Mur.png',
  },
  prop_vending_machine: {
    label: 'Distributeur',
    sprite: '/assets/props/vending_machine/Vending_machine_F.png',
  },
};

const TAUNT_LABELS: Record<string, string> = {
  taunt_chicken: 'Cot-cot',
  taunt_evil_laugh: 'Rire machiavélique',
  taunt_whistle: 'Sifflement',
};

const CLASS_LABELS: Record<string, string> = {
  seeker_recruit: 'Recrue',
  seeker_juggernaut: 'Colosse',
};

const MAP_LABELS: Record<string, string> = {
  map_test: 'La map de test',
  map_01_16p: 'Complexe 16J',
  map_01_32p: 'Complexe 32J',
};

// Animation fluide des compteurs numériques (0 -> cible)
const activeCounterRafs = new Map<HTMLElement, number>();

function animateNumber(
  el: HTMLElement | null,
  target: number,
  formatter: (val: number) => string = (v) => String(Math.round(v)),
  durationMs = 420
): void {
  if (!el) return;
  const prevRaf = activeCounterRafs.get(el);
  if (prevRaf !== undefined) {
    cancelAnimationFrame(prevRaf);
  }

  const safeTarget = Number.isFinite(target) ? target : 0;
  if (safeTarget === 0) {
    el.textContent = formatter(0);
    return;
  }

  const startTime = performance.now();
  const step = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = safeTarget * eased;
    el.textContent = formatter(progress >= 1 ? safeTarget : current);
    if (progress < 1) {
      const id = requestAnimationFrame(step);
      activeCounterRafs.set(el, id);
    } else {
      activeCounterRafs.delete(el);
    }
  };

  const id = requestAnimationFrame(step);
  activeCounterRafs.set(el, id);
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPlaytime(totalSeconds: number): string {
  const safeSec = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safeSec / 3600);
  const minutes = Math.floor((safeSec % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

function formatDurationShort(totalSeconds: number | null | undefined): string {
  if (totalSeconds === null || totalSeconds === undefined || Number.isNaN(totalSeconds)) {
    return '—';
  }
  const safeSec = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSec / 60);
  const seconds = safeSec % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function formatTimelineClock(seconds: number | undefined): string {
  const safeSec = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(safeSec / 60)
    .toString()
    .padStart(2, '0');
  const secs = (safeSec % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function formatDateTime(dateInput: string | null | undefined): string {
  if (!dateInput) return '—';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return String(dateInput);
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getPropMeta(propInternalName: string | null | undefined): PropMeta | null {
  if (!propInternalName) return null;
  if (PROP_CATALOG[propInternalName]) {
    return PROP_CATALOG[propInternalName];
  }
  const fallbackLabel = propInternalName
    .replace(/^prop_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
  return {
    label: fallbackLabel,
    sprite: '/assets/props/can/Can_F.png',
  };
}

function formatTauntName(tauntInternalName: string | null | undefined): string {
  if (!tauntInternalName) return 'Taunt';
  if (TAUNT_LABELS[tauntInternalName]) {
    return TAUNT_LABELS[tauntInternalName];
  }
  return tauntInternalName
    .replace(/^taunt_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatClassName(classInternalName: string | null | undefined): string {
  if (!classInternalName) return 'Recrue';
  if (CLASS_LABELS[classInternalName]) {
    return CLASS_LABELS[classInternalName];
  }
  return classInternalName
    .replace(/^seeker_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatMapName(mapInternalName: string | null | undefined): string {
  if (!mapInternalName) return 'Carte inconnue';
  if (MAP_LABELS[mapInternalName]) {
    return MAP_LABELS[mapInternalName];
  }
  return mapInternalName.replace(/^map_/, 'Map ').replace(/_/g, ' ');
}

function isMatchVictory(match: RecentMatchItem): boolean {
  return match.winning_team !== null
    ? match.winning_team === match.role
    : match.role === 'HIDER' && Boolean(match.is_survivor);
}

export function renderStats(): string {
  return `
    <!-- Vue 8 : Statistiques (Plein Écran 100vw x 100vh - 100% Souris - Zéro Scroll Global) -->
    <div id="view-stats" class="view stats-fullscreen-view hidden">
      <!-- BARRE SUPÉRIEURE FIXE : Titre + Onglets + Action Retour Unique -->
      <header class="stats-sticky-header">
        <div class="stats-header-inner">
          <div class="stats-header-left">
            <h2 class="stats-brand-title purple-text">STATISTIQUES</h2>
          </div>

          <nav class="stats-tactical-tabs" id="stats-tactical-tabs" aria-label="Sous-menus des statistiques">
            <button type="button" class="stats-tab-btn is-active" data-tab="overview">
              <span class="stats-tab-label">VUE D'ENSEMBLE</span>
            </button>
            <button type="button" class="stats-tab-btn" data-tab="roles">
              <span class="stats-tab-label">RÔLES &amp; MAÎTRISE</span>
            </button>
            <button type="button" class="stats-tab-btn" data-tab="archives">
              <span class="stats-tab-label">ARCHIVES DES MATCHS</span>
            </button>
          </nav>

          <div class="stats-header-right">
            <button type="button" class="stats-nav-back-btn" id="btn-back-main-from-stats" data-action="back">
              <span id="stats-back-btn-label">← RETOUR</span>
            </button>
          </div>
        </div>
      </header>

      <!-- ZONE DE CONTENU FIXE 100VH -->
      <main class="stats-viewport-stage">
        <!-- Bannière d'état (Non connecté / Erreur / Synchronisation) -->
        <div id="stats-state-banner" class="stats-state-banner hidden"></div>

        <div id="stats-content-root" class="stats-stage-panels">
          <!-- ==========================================
               ONGLET 1 : VUE D'ENSEMBLE
          =========================================== -->
          <section class="stats-tab-panel is-active" id="stats-panel-overview" data-panel="overview" aria-label="Vue d'ensemble">
            <!-- 1. 4 Compteurs Héroïques -->
            <div class="stats-kpi-strip">
              <div class="stats-kpi-item">
                <span class="stats-kpi-label">PARTIES JOUÉES</span>
                <strong class="stats-kpi-value" id="stat-kpi-matches">0</strong>
                <span class="stats-kpi-sub" id="stat-kpi-score-sub">SCORE CUMULÉ : 0 PTS</span>
              </div>
              <div class="stats-kpi-item">
                <span class="stats-kpi-label">WINRATE GLOBAL</span>
                <strong class="stats-kpi-value cyan-text" id="stat-kpi-winrate">0%</strong>
                <span class="stats-kpi-sub" id="stat-kpi-wl-sub">0 VICTOIRES · 0 DÉFAITES</span>
              </div>
              <div class="stats-kpi-item">
                <span class="stats-kpi-label">TEMPS DE JEU CUMULÉ</span>
                <strong class="stats-kpi-value" id="stat-kpi-playtime">0h 00m</strong>
                <span class="stats-kpi-sub">EN PARTIES OFFICIELLES</span>
              </div>
              <div class="stats-kpi-item">
                <span class="stats-kpi-label">MEILLEURE SÉRIE</span>
                <strong class="stats-kpi-value purple-text" id="stat-kpi-streak">0</strong>
                <span class="stats-kpi-sub" id="stat-kpi-cur-streak">SÉRIE ACTUELLE : 0</span>
              </div>
            </div>

            <!-- 2. Jauge d'équilibre des camps (Typographie nette + barre bicolore) -->
            <div class="stats-balance-block">
              <div class="stats-balance-header">
                <div class="stats-camp-summary is-hider">
                  <span class="stats-camp-title purple-text">CAMP HIDER</span>
                  <div class="stats-camp-numbers">
                    <strong id="stat-ratio-hider-wins">0</strong> VICTOIRES · <span id="stat-ratio-hider-pct">50%</span>
                  </div>
                </div>

                <span class="stats-section-caption">ÉQUILIBRE DES VICTOIRES PAR CAMP</span>

                <div class="stats-camp-summary is-seeker">
                  <span class="stats-camp-title blue-text">CAMP SEEKER</span>
                  <div class="stats-camp-numbers">
                    <span id="stat-ratio-seeker-pct">50%</span> · <strong id="stat-ratio-seeker-wins">0</strong> VICTOIRES
                  </div>
                </div>
              </div>

              <div class="stats-ratio-bar-track">
                <div class="stats-ratio-bar-hider" id="stat-ratio-bar-hider" style="width: 50%"></div>
                <div class="stats-ratio-bar-seeker" id="stat-ratio-bar-seeker" style="width: 50%"></div>
              </div>
            </div>

            <!-- 3. Encart "Dernière partie jouée" -->
            <div class="stats-last-match-spotlight">
              <div class="stats-spotlight-header">
                <span class="stats-section-caption">DERNIÈRE PARTIE JOUÉE · ACCÈS RAPIDE AU RAPPORT</span>
                <button type="button" class="stats-link-btn" id="btn-overview-see-all-matches" data-action="see-all-matches">
                  VOIR TOUTES LES ARCHIVES →
                </button>
              </div>
              <div id="stats-last-match-slot" class="stats-last-match-slot"></div>
            </div>
          </section>

          <!-- ==========================================
               ONGLET 2 : RÔLES & MAÎTRISE
          =========================================== -->
          <section class="stats-tab-panel" id="stats-panel-roles" data-panel="roles" aria-label="Rôles et maîtrise">
            <!-- Toggle HIDER / SEEKER épuré à la souris -->
            <div class="stats-role-toggle-bar">
              <div class="stats-role-switch" role="tablist" aria-label="Choisir le camp">
                <div class="stats-role-switch-glider" id="stats-role-glider"></div>
                <button type="button" class="stats-role-switch-btn is-active" data-role="HIDER" id="btn-role-hider">
                  <span>MAÎTRISE HIDER</span>
                </button>
                <button type="button" class="stats-role-switch-btn" data-role="SEEKER" id="btn-role-seeker">
                  <span>MAÎTRISE SEEKER</span>
                </button>
              </div>
            </div>

            <!-- Scène interne basculable Hider vs Seeker -->
            <div class="stats-role-stage">
              <!-- SOUS-VUE HIDER -->
              <div class="stats-role-view is-active" id="stats-role-view-hider" data-camp-view="HIDER">
                <div class="stats-role-metrics-col">
                  <div class="stats-role-hero-metric">
                    <span class="stats-kpi-label">VICTOIRES EN TANT QUE HIDER</span>
                    <strong class="stats-kpi-value purple-text" id="stat-hider-wins">0</strong>
                  </div>
                  <div class="stats-flat-row">
                    <span class="stats-row-label">Temps de survie moyen (Télémétrie)</span>
                    <strong class="stats-row-val cyan-text" id="stat-hider-survival">—</strong>
                  </div>
                  <div class="stats-flat-row">
                    <span class="stats-row-label">Transformations totales</span>
                    <strong class="stats-row-val" id="stat-hider-transforms">0</strong>
                  </div>
                  <div class="stats-flat-row">
                    <span class="stats-row-label">Taunts sonores déclenchés</span>
                    <strong class="stats-row-val" id="stat-hider-taunts">0</strong>
                  </div>
                  <div class="stats-flat-row">
                    <span class="stats-row-label">Dégâts totaux encaissés</span>
                    <strong class="stats-row-val" id="stat-hider-damage-taken">0</strong>
                  </div>
                </div>

                <!-- Vitrine visuelle du Prop fétiche (illustrant la donnée MongoDB) -->
                <div class="stats-role-showcase-col">
                  <div class="stats-showcase-header">
                    <span class="stats-section-caption">PROP FÉTICHE (LE PLUS UTILISÉ)</span>
                    <strong class="stats-showcase-title purple-text" id="stat-hider-fav-prop-name">—</strong>
                  </div>

                  <div class="stats-sprite-stage" id="stat-hider-fav-prop-stage">
                    <span class="stats-no-prop-dash" id="stat-hider-fav-prop-empty">—</span>
                    <img
                      src="/assets/props/can/Can_F.png"
                      alt="Prop fétiche"
                      class="pixel-sprite stats-hero-sprite hidden"
                      id="stat-hider-fav-prop-img"
                    />
                  </div>
                </div>
              </div>

              <!-- SOUS-VUE SEEKER -->
              <div class="stats-role-view" id="stats-role-view-seeker" data-camp-view="SEEKER">
                <div class="stats-role-metrics-col">
                  <div class="stats-role-hero-metric">
                    <span class="stats-kpi-label">VICTOIRES EN TANT QUE SEEKER</span>
                    <strong class="stats-kpi-value cyan-text" id="stat-seeker-wins">0</strong>
                  </div>
                  <div class="stats-flat-row">
                    <span class="stats-row-label">Éliminations confirmées</span>
                    <strong class="stats-row-val" id="stat-seeker-elims">0</strong>
                  </div>
                  <div class="stats-flat-row">
                    <span class="stats-row-label">Props débusqués / détruits</span>
                    <strong class="stats-row-val" id="stat-seeker-destroyed">0</strong>
                  </div>
                  <div class="stats-flat-row">
                    <span class="stats-row-label">Dégâts totaux infligés</span>
                    <strong class="stats-row-val" id="stat-seeker-damage">0</strong>
                  </div>
                </div>

                <!-- Jauge circulaire épurée de Précision des tirs -->
                <div class="stats-role-showcase-col">
                  <div class="stats-showcase-header">
                    <span class="stats-section-caption">PRÉCISION DES TIRS (TÉLÉMÉTRIE)</span>
                    <strong class="stats-showcase-title blue-text" id="stat-seeker-accuracy-label">—</strong>
                  </div>

                  <div class="stats-seeker-visual-center">
                    <div class="stats-accuracy-gauge-wrap">
                      <svg class="stats-accuracy-ring" viewBox="0 0 120 120">
                        <circle class="stats-ring-bg" cx="60" cy="60" r="50" />
                        <circle
                          class="stats-ring-fill"
                          id="stat-seeker-accuracy-ring"
                          cx="60"
                          cy="60"
                          r="50"
                          stroke-dasharray="314.16"
                          stroke-dashoffset="314.16"
                        />
                      </svg>
                      <div class="stats-accuracy-center">
                        <strong class="stats-accuracy-val cyan-text" id="stat-seeker-accuracy">—</strong>
                        <span class="stats-accuracy-caption">TIRS AU BUT</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- ==========================================
               ONGLET 3 : ARCHIVES DES MATCHS (AVEC SLIDE-OVER)
          =========================================== -->
          <section class="stats-tab-panel" id="stats-panel-archives" data-panel="archives" aria-label="Archives des matchs">
            <div class="stats-archives-slider" id="stats-archives-slider">
              <!-- PANNEAU GAUCHE : LISTE FILTRABLE DES PARTIES -->
              <div class="stats-archives-list-pane" id="stats-archives-list-pane">
                <div class="stats-archives-toolbar">
                  <div class="stats-archives-title-wrap">
                    <h3 class="stats-section-title">HISTORIQUE DES PARTIES RÉCENTES</h3>
                    <span class="stats-recent-meta" id="stats-archives-count-label">0 PARTIE</span>
                  </div>

                  <div class="stats-filter-pills" role="group" aria-label="Filtrer les parties">
                    <button type="button" class="stats-filter-btn is-active" data-filter="ALL">TOUS</button>
                    <button type="button" class="stats-filter-btn" data-filter="WINS">VICTOIRES</button>
                    <button type="button" class="stats-filter-btn" data-filter="LOSSES">DÉFAITES</button>
                  </div>
                </div>

                <div class="stats-archives-table-head">
                  <span>RÉSULTAT</span>
                  <span>CAMP</span>
                  <span>CARTE &amp; DATE</span>
                  <span>DURÉE</span>
                  <span>SCORE</span>
                  <span>DÉTAIL</span>
                </div>

                <!-- Liste interne scrollable à hauteur fixe -->
                <div id="stats-recent-list" class="stats-recent-list-scroll"></div>
              </div>

              <!-- PANNEAU DROIT (SLIDE-OVER) : RAPPORT DÉTAILLÉ DE LA PARTIE -->
              <div class="stats-match-report-pane" id="stats-match-report-pane" aria-hidden="true">
                <div id="stats-match-detail-root" class="stats-match-detail-inner"></div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  `;
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = value;
  }
}

function renderRecentMatchRow(match: RecentMatchItem): string {
  const isWin = isMatchVictory(match);
  const isDraw = match.winning_team === 'DRAW';

  let outcomeLabel = 'DÉFAITE';
  let outcomeClass = 'is-loss';
  if (isDraw) {
    outcomeLabel = 'ÉGALITÉ';
    outcomeClass = 'is-draw';
  } else if (isWin) {
    outcomeLabel = 'VICTOIRE';
    outcomeClass = 'is-win';
  }

  const roleClass = match.role === 'HIDER' ? 'purple-text' : 'blue-text';
  const mapLabel = escapeHtml(formatMapName(match.map_name));
  const durationLabel = formatDurationShort(match.duration_seconds);
  const scoreLabel = `+${match.score_earned} PTS`;
  const dateLabel = formatDateTime(match.start_time);

  return `
    <div class="stats-match-row is-clickable" data-action="open-match" data-match-id="${match.match_id}" aria-label="Ouvrir le rapport de la partie #${match.match_id}">
      <span class="stats-match-outcome ${outcomeClass}">${outcomeLabel}</span>
      <span class="stats-match-role ${roleClass}">${match.role}</span>
      <span class="stats-match-map">${mapLabel} <small class="stats-match-date-inline">· ${dateLabel}</small></span>
      <span class="stats-match-duration">${durationLabel}</span>
      <strong class="stats-match-score">${scoreLabel}</strong>
      <button type="button" class="stats-match-cta-btn" data-action="open-match" data-match-id="${match.match_id}">
        Voir le détail →
      </button>
    </div>
  `;
}

function renderSpotlightMatch(match: RecentMatchItem | undefined): string {
  if (!match) {
    return `
      <div class="stats-empty-line">
        Aucune partie enregistrée. Lancez une session pour débloquer vos rapports de bataille.
      </div>
    `;
  }

  const isWin = isMatchVictory(match);
  const isDraw = match.winning_team === 'DRAW';
  const outcomeLabel = isDraw ? 'ÉGALITÉ' : isWin ? 'VICTOIRE' : 'DÉFAITE';
  const outcomeClass = isDraw ? 'is-draw' : isWin ? 'is-win' : 'is-loss';
  const roleClass = match.role === 'HIDER' ? 'purple-text' : 'blue-text';

  return `
    <div class="stats-spotlight-row is-clickable" data-action="open-match" data-match-id="${match.match_id}">
      <div class="stats-spotlight-left">
        <div class="stats-spotlight-info">
          <div class="stats-spotlight-tags">
            <span class="stats-match-outcome ${outcomeClass}">${outcomeLabel}</span>
            <span class="stats-header-sep">·</span>
            <span class="stats-match-role ${roleClass}">${match.role}</span>
            <span class="stats-header-sep">·</span>
            <span class="stats-spotlight-map">${escapeHtml(formatMapName(match.map_name))}</span>
          </div>
          <span class="stats-spotlight-date">Partie #${match.match_id} · ${formatDateTime(match.start_time)} · Durée ${formatDurationShort(match.duration_seconds)}</span>
        </div>
      </div>

      <div class="stats-spotlight-right">
        <div class="stats-spotlight-score-block">
          <span class="stats-kpi-label">SCORE OBTENU</span>
          <strong class="stats-spotlight-score cyan-text">+${match.score_earned} PTS</strong>
        </div>
        <button type="button" class="stats-spotlight-cta-btn" data-action="open-match" data-match-id="${match.match_id}">
          OUVRIR LE RAPPORT →
        </button>
      </div>
    </div>
  `;
}

function renderTeamParticipantRow(
  p: MatchParticipant,
  currentUserId: number | null,
  telemetryPlayer?: MatchTelemetryPlayer
): string {
  const isMe = currentUserId !== null && p.user_id === currentUserId;

  let statusText = '—';
  let statusClass = '';
  if (p.role === 'HIDER') {
    if (p.is_survivor) {
      statusText = `SURVIVANT (${formatDurationShort(p.survival_time_seconds)})`;
      statusClass = 'is-win';
    } else {
      statusText = `ÉLIMINÉ (${formatDurationShort(p.survival_time_seconds)})`;
      statusClass = 'is-loss';
    }
  } else {
    const acc =
      p.shots_fired > 0 ? `${Math.round((p.shots_hit / p.shots_fired) * 100)}% PRÉC.` : '0 TIR';
    statusText = `${p.eliminations} ÉLIM. · ${acc}`;
  }

  const extraMetric =
    p.role === 'HIDER'
      ? `${p.transformations_count} transf. · ${p.taunts_used} taunts`
      : `${p.damage_dealt} dégâts · ${p.props_destroyed} props`;

  // Côté Hider : on conserve uniquement le sprite du prop final à côté de son nom
  let loadoutHtml = '';
  if (p.role === 'HIDER') {
    const propMeta = getPropMeta(p.final_prop_name);
    if (propMeta) {
      loadoutHtml = `
        <div class="stats-tp-final-prop">
          <img src="${propMeta.sprite}" alt="${escapeHtml(propMeta.label)}" class="pixel-sprite stats-tp-prop-sprite" />
          <span>${escapeHtml(propMeta.label)}</span>
        </div>
      `;
    } else {
      loadoutHtml = `<span class="stats-tp-loadout-text">—</span>`;
    }
  } else {
    const className = formatClassName(p.seeker_class_name);
    loadoutHtml = `<span class="stats-tp-loadout-text">${escapeHtml(className)}</span>`;
  }

  const propsUsedNames =
    p.role === 'HIDER' && telemetryPlayer?.propsUsed && telemetryPlayer.propsUsed.length > 0
      ? telemetryPlayer.propsUsed
          .map((key) => getPropMeta(key)?.label ?? key)
          .join(', ')
      : null;

  return `
    <div class="stats-team-player-row ${isMe ? 'is-current-user' : ''}">
      <div class="stats-tp-identity">
        <div class="stats-tp-names">
          <div class="stats-tp-name-line">
            <strong class="stats-sb-username">${escapeHtml(p.username)}</strong>
            ${isMe ? '<span class="stats-me-tag">VOUS</span>' : ''}
          </div>
          <span class="stats-tp-loadout">${extraMetric}${
            propsUsedNames ? ` · Props : ${escapeHtml(propsUsedNames)}` : ''
          }</span>
        </div>
      </div>

      ${loadoutHtml}

      <span class="stats-sb-status ${statusClass}">${statusText}</span>
      <strong class="stats-sb-score cyan-text">+${p.score_earned} PTS</strong>
    </div>
  `;
}

function formatTelemetryEventLine(
  ev: MatchTelemetryEvent,
  userMap: Map<number, { username: string; role: 'HIDER' | 'SEEKER' }>
): string {
  const actor = ev.userId ? userMap.get(ev.userId) : undefined;
  const target = ev.targetId ? userMap.get(ev.targetId) : undefined;
  const actorName = escapeHtml(actor?.username ?? `Joueur #${ev.userId ?? '?'}`);
  const targetName = escapeHtml(target?.username ?? `Joueur #${ev.targetId ?? '?'}`);
  const actorColor = actor?.role === 'SEEKER' ? 'blue-text' : 'purple-text';
  const distSuffix =
    typeof ev.nearestSeekerDist === 'number'
      ? ` <span class="stats-ev-dist">à ${ev.nearestSeekerDist}px d'un Seeker</span>`
      : '';

  let description = '';
  let typeTag = ev.type;

  switch (ev.type) {
    case 'TRANSFORM': {
      typeTag = 'TRANSFORMATION';
      const propLabel = getPropMeta(ev.prop)?.label ?? ev.prop ?? 'Prop';
      description = `<strong class="${actorColor}">${actorName}</strong> a pris la forme <strong>${escapeHtml(propLabel)}</strong>${distSuffix}`;
      break;
    }
    case 'TAUNT': {
      typeTag = 'TAUNT';
      const tauntLabel = escapeHtml(formatTauntName(ev.taunt));
      description = `<strong class="${actorColor}">${actorName}</strong> a déclenché le taunt <strong>${tauntLabel}</strong>${distSuffix}`;
      break;
    }
    case 'HIT': {
      typeTag = 'IMPACT';
      const distInfo =
        typeof ev.nearestSeekerDist === 'number'
          ? ` <span class="stats-ev-dist">(distance : ${ev.nearestSeekerDist}px)</span>`
          : '';
      description = `<strong class="${actorColor}">${actorName}</strong> a touché <strong class="purple-text">${targetName}</strong>${distInfo}`;
      break;
    }
    case 'ELIMINATION': {
      typeTag = 'ÉLIMINATION';
      description = `<strong class="${actorColor}">${actorName}</strong> a éliminé <strong class="purple-text">${targetName}</strong>`;
      break;
    }
    default: {
      description = `<strong class="${actorColor}">${actorName}</strong> — ${escapeHtml(String(ev.type))}`;
      break;
    }
  }

  return `
    <div class="stats-timeline-row">
      <span class="stats-timeline-time">${formatTimelineClock(ev.t)}</span>
      <span class="stats-timeline-type type-${escapeHtml(ev.type.toLowerCase())}">
        ${escapeHtml(typeTag)}
      </span>
      <span class="stats-timeline-desc">${description}</span>
    </div>
  `;
}

function renderMatchDetailsDOM(
  payload: MatchDetailsPayload,
  currentUserId: number | null
): string {
  const { match, participants, telemetry } = payload;

  const winnerLabel =
    match.winning_team === 'HIDER'
      ? 'VICTOIRE HIDERS'
      : match.winning_team === 'SEEKER'
      ? 'VICTOIRE SEEKERS'
      : match.winning_team === 'DRAW'
      ? 'ÉGALITÉ'
      : 'NON DÉTERMINÉ';

  const winnerColorClass =
    match.winning_team === 'HIDER'
      ? 'purple-text'
      : match.winning_team === 'SEEKER'
      ? 'blue-text'
      : '';

  const userMap = new Map<number, { username: string; role: 'HIDER' | 'SEEKER' }>();
  participants.forEach((p) => {
    userMap.set(p.user_id, { username: p.username, role: p.role });
  });

  const telemetryPlayerMap = new Map<number, MatchTelemetryPlayer>();
  if (telemetry?.players && Array.isArray(telemetry.players)) {
    telemetry.players.forEach((tp) => {
      if (typeof tp.userId === 'number') {
        telemetryPlayerMap.set(tp.userId, tp);
      }
    });
  }

  const hiders = participants.filter((p) => p.role === 'HIDER');
  const seekers = participants.filter((p) => p.role === 'SEEKER');

  const events = Array.isArray(telemetry?.events)
    ? [...telemetry.events].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
    : [];

  return `
    <!-- Barre supérieure du Rapport de Partie (sans bouton retour dupliqué) -->
    <div class="stats-report-topbar">
      <div class="stats-report-title-group">
        <strong class="stats-report-id">RAPPORT DE PARTIE #${match.match_id}</strong>
        <span class="stats-header-sep">·</span>
        <span class="stats-report-winner ${winnerColorClass}">${winnerLabel}</span>
      </div>

      <!-- Sélecteur de sous-vue du rapport : Scoreboard vs Chronologie -->
      <div class="stats-report-subtabs">
        <button type="button" class="stats-subtab-btn is-active" data-report-subview="scoreboard">
          TABLEAU DES SCORES (${participants.length})
        </button>
        <button type="button" class="stats-subtab-btn" data-report-subview="timeline">
          CHRONOLOGIE DES ACTIONS (${events.length})
        </button>
      </div>
    </div>

    <!-- Bandeau résumé tactique -->
    <div class="stats-report-meta-strip">
      <div class="stats-report-meta-cell">
        <span class="stats-kpi-label">CARTE</span>
        <strong>${escapeHtml(formatMapName(match.map_name))}</strong>
      </div>
      <div class="stats-report-meta-cell">
        <span class="stats-kpi-label">DURÉE</span>
        <strong>${formatDurationShort(match.duration_seconds)}</strong>
      </div>
      <div class="stats-report-meta-cell">
        <span class="stats-kpi-label">DATE</span>
        <strong>${formatDateTime(match.start_time)}</strong>
      </div>
      <div class="stats-report-meta-cell">
        <span class="stats-kpi-label">SERVEUR</span>
        <strong>${escapeHtml(match.server_id ?? 'Local')}</strong>
      </div>
    </div>

    <!-- SOUS-PANNEAU 1 : SCOREBOARD PAR ÉQUIPE (HIDERS VS SEEKERS) -->
    <div class="stats-report-subpanel is-active" id="stats-report-subpanel-scoreboard" data-subpanel="scoreboard">
      <div class="stats-teams-split">
        <!-- Colonne Équipe HIDERS -->
        <div class="stats-team-column">
          <div class="stats-team-header is-hider">
            <h4 class="purple-text">ÉQUIPE HIDERS (${hiders.length})</h4>
          </div>
          <div class="stats-team-list-scroll">
            ${
              hiders.length > 0
                ? hiders
                    .map((p) =>
                      renderTeamParticipantRow(p, currentUserId, telemetryPlayerMap.get(p.user_id))
                    )
                    .join('')
                : '<div class="stats-empty-line">Aucun Hider enregistré.</div>'
            }
          </div>
        </div>

        <!-- Colonne Équipe SEEKERS -->
        <div class="stats-team-column">
          <div class="stats-team-header is-seeker">
            <h4 class="blue-text">ÉQUIPE SEEKERS (${seekers.length})</h4>
          </div>
          <div class="stats-team-list-scroll">
            ${
              seekers.length > 0
                ? seekers
                    .map((p) =>
                      renderTeamParticipantRow(p, currentUserId, telemetryPlayerMap.get(p.user_id))
                    )
                    .join('')
                : '<div class="stats-empty-line">Aucun Seeker enregistré.</div>'
            }
          </div>
        </div>
      </div>
    </div>

    <!-- SOUS-PANNEAU 2 : CHRONOLOGIE DES ACTIONS (JOURNAL DE COMBAT MONGODB) -->
    <div class="stats-report-subpanel" id="stats-report-subpanel-timeline" data-subpanel="timeline">
      <div class="stats-timeline-scroll">
        ${
          events.length > 0
            ? events.map((ev) => formatTelemetryEventLine(ev, userMap)).join('')
            : `<div class="stats-empty-line">Aucun événement télémétrique enregistré pour cette partie.</div>`
        }
      </div>
    </div>
  `;
}

export function initStats(): void {
  const viewMain = document.getElementById('view-main');
  const viewStats = document.getElementById('view-stats');
  if (!viewStats) return;
  const rootEl: HTMLElement = viewStats;

  let isStatsLoading = false;
  let isMatchDetailLoading = false;
  let activeTab: StatsTabId = 'overview';
  let activeRoleCamp: RoleCamp = 'HIDER';
  let activeArchiveFilter: ArchiveFilter = 'ALL';
  let activeMatchId: number | null = null;
  let cachedPayload: MyStatsPayload | null = null;

  function updateHeaderBackLabel(): void {
    const backBtnLabel = document.getElementById('stats-back-btn-label');
    if (backBtnLabel) {
      backBtnLabel.textContent = activeMatchId !== null ? '← RETOUR AUX ARCHIVES' : '← RETOUR';
    }
  }

  function syncTabsDOM(): void {
    const tabBtns = rootEl.querySelectorAll<HTMLButtonElement>('[data-tab]');
    tabBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.tab === activeTab);
    });

    const panels = rootEl.querySelectorAll<HTMLElement>('[data-panel]');
    panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.dataset.panel === activeTab);
    });
  }

  function syncRoleDOM(): void {
    const glider = document.getElementById('stats-role-glider');
    if (glider) {
      glider.style.transform = activeRoleCamp === 'SEEKER' ? 'translateX(100%)' : 'translateX(0%)';
    }

    const roleBtns = rootEl.querySelectorAll<HTMLButtonElement>('[data-role]');
    roleBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.role === activeRoleCamp);
    });

    const roleViews = rootEl.querySelectorAll<HTMLElement>('[data-camp-view]');
    roleViews.forEach((view) => {
      view.classList.toggle('is-active', view.dataset.campView === activeRoleCamp);
    });
  }

  function closeMatchReport(): void {
    activeMatchId = null;

    const archivesSlider = document.getElementById('stats-archives-slider');
    const reportPane = document.getElementById('stats-match-report-pane');

    if (archivesSlider) {
      archivesSlider.classList.remove('is-report-open');
    }
    if (reportPane) {
      reportPane.setAttribute('aria-hidden', 'true');
    }
    updateHeaderBackLabel();
  }

  function switchTab(targetTab: StatsTabId): void {
    if (activeTab === targetTab && activeMatchId === null) return;

    activeTab = targetTab;
    if (activeMatchId !== null) {
      closeMatchReport();
    }

    syncTabsDOM();
    updateHeaderBackLabel();

    if (cachedPayload) {
      if (targetTab === 'overview') {
        animateOverviewCounters(cachedPayload);
      } else if (targetTab === 'roles') {
        animateRoleCounters(cachedPayload, activeRoleCamp);
      } else if (targetTab === 'archives') {
        applyArchiveFilter(activeArchiveFilter);
      }
    }
  }

  function switchRoleCamp(camp: RoleCamp): void {
    if (activeRoleCamp === camp) return;
    activeRoleCamp = camp;

    syncRoleDOM();

    if (cachedPayload) {
      animateRoleCounters(cachedPayload, camp);
    }
  }

  function applyArchiveFilter(filter: ArchiveFilter): void {
    activeArchiveFilter = filter;

    const filterBtns = rootEl.querySelectorAll<HTMLButtonElement>('[data-filter]');
    filterBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === filter);
    });

    const recentList = document.getElementById('stats-recent-list');
    if (!cachedPayload || !recentList) return;

    const allMatches = cachedPayload.recentMatches ?? [];
    const filtered = allMatches.filter((m) => {
      if (filter === 'WINS') return isMatchVictory(m);
      if (filter === 'LOSSES') return !isMatchVictory(m) && m.winning_team !== 'DRAW';
      return true;
    });

    setText(
      'stats-archives-count-label',
      `${filtered.length} PARTIE${filtered.length > 1 ? 'S' : ''}`
    );

    if (filtered.length === 0) {
      recentList.innerHTML = `
        <div class="stats-empty-line">
          Aucune partie ne correspond à ce filtre.
        </div>
      `;
    } else {
      recentList.innerHTML = filtered.map(renderRecentMatchRow).join('');
    }
  }

  function animateOverviewCounters(payload: MyStatsPayload): void {
    const { stats } = payload;
    const matchesPlayed = stats.matches_played ?? 0;
    const hiderWins = stats.hider_wins ?? 0;
    const seekerWins = stats.seeker_wins ?? 0;
    const totalWins = hiderWins + seekerWins;
    const totalLosses = Math.max(0, matchesPlayed - totalWins);
    const winRate = matchesPlayed > 0 ? Math.round((totalWins / matchesPlayed) * 100) : 0;

    animateNumber(document.getElementById('stat-kpi-matches'), matchesPlayed);
    animateNumber(document.getElementById('stat-kpi-winrate'), winRate, (v) => `${Math.round(v)}%`);
    animateNumber(
      document.getElementById('stat-kpi-playtime'),
      stats.total_playtime_seconds ?? 0,
      (v) => formatPlaytime(v)
    );
    animateNumber(document.getElementById('stat-kpi-streak'), stats.win_streak_best ?? 0);

    setText('stat-kpi-score-sub', `SCORE CUMULÉ : ${stats.total_score ?? 0} PTS`);
    setText('stat-kpi-wl-sub', `${totalWins} VICTOIRES · ${totalLosses} DÉFAITES`);
    setText('stat-kpi-cur-streak', `SÉRIE ACTUELLE : ${stats.win_streak_current ?? 0}`);

    const hiderPct = totalWins > 0 ? Math.round((hiderWins / totalWins) * 100) : 50;
    const seekerPct = totalWins > 0 ? 100 - hiderPct : 50;

    animateNumber(document.getElementById('stat-ratio-hider-wins'), hiderWins);
    animateNumber(document.getElementById('stat-ratio-seeker-wins'), seekerWins);
    setText('stat-ratio-hider-pct', `${totalWins > 0 ? hiderPct : 0}%`);
    setText('stat-ratio-seeker-pct', `${totalWins > 0 ? seekerPct : 0}%`);

    const hiderBar = document.getElementById('stat-ratio-bar-hider');
    const seekerBar = document.getElementById('stat-ratio-bar-seeker');
    if (hiderBar && seekerBar) {
      hiderBar.style.width = `${hiderPct}%`;
      seekerBar.style.width = `${seekerPct}%`;
      hiderBar.style.opacity = totalWins > 0 ? '1' : '0.35';
      seekerBar.style.opacity = totalWins > 0 ? '1' : '0.35';
    }
  }

  function animateRoleCounters(payload: MyStatsPayload, camp: RoleCamp): void {
    const { stats, telemetry } = payload;

    if (camp === 'HIDER') {
      animateNumber(document.getElementById('stat-hider-wins'), stats.hider_wins ?? 0);
      if (telemetry?.avgSurvivalTimeSec !== null && telemetry?.avgSurvivalTimeSec !== undefined) {
        animateNumber(
          document.getElementById('stat-hider-survival'),
          telemetry.avgSurvivalTimeSec,
          (v) => formatDurationShort(v)
        );
      } else {
        setText('stat-hider-survival', '—');
      }
      animateNumber(
        document.getElementById('stat-hider-transforms'),
        stats.props_transformed_total ?? 0
      );
      animateNumber(document.getElementById('stat-hider-taunts'), stats.taunts_used_total ?? 0);
      animateNumber(
        document.getElementById('stat-hider-damage-taken'),
        stats.damage_taken_total ?? 0
      );

      const propMeta = getPropMeta(telemetry?.favoriteProp);
      const favImg = document.getElementById('stat-hider-fav-prop-img') as HTMLImageElement | null;
      const favEmpty = document.getElementById('stat-hider-fav-prop-empty');

      if (propMeta) {
        setText('stat-hider-fav-prop-name', propMeta.label.toUpperCase());
        if (favImg) {
          favImg.src = propMeta.sprite;
          favImg.alt = propMeta.label;
          favImg.classList.remove('hidden');
        }
        if (favEmpty) {
          favEmpty.classList.add('hidden');
        }
      } else {
        setText('stat-hider-fav-prop-name', '—');
        if (favImg) {
          favImg.classList.add('hidden');
        }
        if (favEmpty) {
          favEmpty.classList.remove('hidden');
        }
      }
    } else {
      animateNumber(document.getElementById('stat-seeker-wins'), stats.seeker_wins ?? 0);
      animateNumber(document.getElementById('stat-seeker-elims'), stats.total_eliminations ?? 0);
      animateNumber(
        document.getElementById('stat-seeker-destroyed'),
        stats.props_destroyed_total ?? 0
      );
      animateNumber(document.getElementById('stat-seeker-damage'), stats.damage_dealt_total ?? 0);

      const acc = telemetry?.accuracyPercent;
      const ringEl = document.getElementById(
        'stat-seeker-accuracy-ring'
      ) as SVGCircleElement | null;
      const circumference = 314.16;

      if (acc !== null && acc !== undefined) {
        animateNumber(
          document.getElementById('stat-seeker-accuracy'),
          acc,
          (v) => `${Math.round(v * 10) / 10}%`
        );
        setText('stat-seeker-accuracy-label', `${acc}% DE TIRS AU BUT`);
        if (ringEl) {
          const clamped = Math.max(0, Math.min(100, acc));
          const offset = circumference - (clamped / 100) * circumference;
          ringEl.style.strokeDashoffset = String(offset);
        }
      } else {
        setText('stat-seeker-accuracy', '—');
        setText('stat-seeker-accuracy-label', '—');
        if (ringEl) {
          ringEl.style.strokeDashoffset = String(circumference);
        }
      }
    }
  }

  function populateAllStats(payload: MyStatsPayload): void {
    cachedPayload = payload;
    animateOverviewCounters(payload);
    animateRoleCounters(payload, activeRoleCamp);

    const lastMatchSlot = document.getElementById('stats-last-match-slot');
    if (lastMatchSlot) {
      lastMatchSlot.innerHTML = renderSpotlightMatch(payload.recentMatches?.[0]);
    }
    applyArchiveFilter(activeArchiveFilter);
  }

  async function openMatchDetails(matchId: number): Promise<void> {
    if (isMatchDetailLoading && activeMatchId === matchId) return;

    if (activeTab !== 'archives') {
      activeTab = 'archives';
      syncTabsDOM();
    }

    activeMatchId = matchId;
    updateHeaderBackLabel();

    const archivesSlider = document.getElementById('stats-archives-slider');
    const reportPane = document.getElementById('stats-match-report-pane');
    const detailRoot = document.getElementById('stats-match-detail-root');

    if (archivesSlider) {
      archivesSlider.classList.add('is-report-open');
    }
    if (reportPane) {
      reportPane.setAttribute('aria-hidden', 'false');
    }
    if (detailRoot) {
      detailRoot.innerHTML = `
        <div class="stats-report-loading">
          <span class="stats-loading-indicator">Chargement du rapport tactique #${matchId}...</span>
        </div>
      `;
    }

    isMatchDetailLoading = true;
    try {
      const payload = await fetchMatchDetails(matchId);
      if (activeMatchId === matchId && detailRoot) {
        const currentUserId = getCurrentUser()?.userId ?? null;
        detailRoot.innerHTML = renderMatchDetailsDOM(payload, currentUserId);
      }
    } catch (error) {
      if (activeMatchId === matchId && detailRoot) {
        const message =
          error instanceof StatsServiceError
            ? error.message
            : 'Impossible de charger le rapport de cette partie.';
        detailRoot.innerHTML = `
          <div class="stats-empty-line stats-error-indicator">${escapeHtml(message)}</div>
        `;
      }
    } finally {
      isMatchDetailLoading = false;
    }
  }

  // Réinitialise systématiquement sur l'onglet principal Vue d'ensemble à l'ouverture
  function resetViewToDefault(): void {
    activeTab = 'overview';
    activeRoleCamp = 'HIDER';
    activeArchiveFilter = 'ALL';
    activeMatchId = null;

    syncTabsDOM();
    syncRoleDOM();
    closeMatchReport();

    const filterBtns = rootEl.querySelectorAll<HTMLButtonElement>('[data-filter]');
    filterBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.filter === 'ALL');
    });
  }

  async function loadStats(resetToOverview = false): Promise<void> {
    if (resetToOverview) {
      resetViewToDefault();
    }
    if (isStatsLoading) return;

    const stateBanner = document.getElementById('stats-state-banner');
    const contentRoot = document.getElementById('stats-content-root');

    if (!isAuthenticated()) {
      if (contentRoot) contentRoot.classList.add('hidden');
      if (stateBanner) {
        stateBanner.classList.remove('hidden');
        stateBanner.innerHTML = `
          <p class="stats-state-text">Connectez-vous à votre compte pour débloquer vos statistiques et rapports de combat.</p>
          <button type="button" class="btn primary stats-auth-cta" data-action="go-auth">SE CONNECTER</button>
        `;
      }
      return;
    }

    isStatsLoading = true;
    if (contentRoot) {
      contentRoot.classList.remove('hidden');
      contentRoot.classList.add('is-loading');
    }
    if (stateBanner) {
      stateBanner.classList.remove('hidden');
      stateBanner.innerHTML = `<span class="stats-loading-indicator">Synchronisation télémétrique en cours...</span>`;
    }

    try {
      const payload = await fetchMyStats();
      if (stateBanner) {
        stateBanner.classList.add('hidden');
        stateBanner.innerHTML = '';
      }
      populateAllStats(payload);
    } catch (error) {
      if (stateBanner) {
        stateBanner.classList.remove('hidden');
        const message =
          error instanceof StatsServiceError
            ? error.message
            : 'Impossible de charger les statistiques.';
        stateBanner.innerHTML = `<span class="stats-error-indicator">${escapeHtml(message)}</span>`;
      }
    } finally {
      isStatsLoading = false;
      if (contentRoot) {
        contentRoot.classList.remove('is-loading');
      }
    }
  }

  // --- DÉLÉGATION D'ÉVÉNEMENTS CENTRALISÉE SUR #view-stats ---
  viewStats.addEventListener('click', (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    // 1. Action voir toutes les archives ("VOIR TOUTES LES ARCHIVES →")
    const seeAllBtn = target.closest<HTMLElement>(
      '#btn-overview-see-all-matches, [data-action="see-all-matches"]'
    );
    if (seeAllBtn) {
      activeArchiveFilter = 'ALL';
      switchTab('archives');
      applyArchiveFilter('ALL');
      return;
    }

    // 2. Action ouvrir un match (ligne entière de match ou bouton "OUVRIR LE RAPPORT →")
    const matchTarget = target.closest<HTMLElement>(
      '[data-action="open-match"], [data-match-id]'
    );
    if (matchTarget) {
      const rawId =
        matchTarget.dataset.matchId ??
        matchTarget.closest<HTMLElement>('[data-match-id]')?.dataset.matchId;
      const matchId = Number(rawId);
      if (Number.isInteger(matchId) && matchId > 0) {
        void openMatchDetails(matchId);
      }
      return;
    }

    // 3. Onglets principaux (data-tab)
    const tabBtn = target.closest<HTMLElement>('[data-tab]');
    if (tabBtn) {
      const tab = tabBtn.dataset.tab as StatsTabId | undefined;
      if (tab) switchTab(tab);
      return;
    }

    // 4. Bascule de rôle HIDER / SEEKER (data-role)
    const roleBtn = target.closest<HTMLElement>('[data-role]');
    if (roleBtn) {
      const role = roleBtn.dataset.role as RoleCamp | undefined;
      if (role) switchRoleCamp(role);
      return;
    }

    // 5. Filtres d'archives TOUS / VICTOIRES / DÉFAITES (data-filter)
    const filterBtn = target.closest<HTMLElement>('[data-filter]');
    if (filterBtn) {
      const filter = filterBtn.dataset.filter as ArchiveFilter | undefined;
      if (filter) applyArchiveFilter(filter);
      return;
    }

    // 6. Sous-onglets du rapport de partie Scoreboard / Chronologie (data-report-subview)
    const subviewBtn = target.closest<HTMLElement>('[data-report-subview]');
    if (subviewBtn) {
      const subview = subviewBtn.dataset.reportSubview as ReportSubView | undefined;
      if (!subview) return;

      const detailRoot = document.getElementById('stats-match-detail-root');
      if (detailRoot) {
        detailRoot
          .querySelectorAll<HTMLElement>('[data-report-subview]')
          .forEach((b) => b.classList.toggle('is-active', b.dataset.reportSubview === subview));
        detailRoot
          .querySelectorAll<HTMLElement>('[data-subpanel]')
          .forEach((p) => p.classList.toggle('is-active', p.dataset.subpanel === subview));
      }
      return;
    }

    // 7. Autres actions nommées (data-action)
    const actionBtn = target.closest<HTMLElement>('[data-action]');
    if (actionBtn) {
      const action = actionBtn.dataset.action;
      if (action === 'back') {
        if (activeMatchId !== null) {
          closeMatchReport();
        } else {
          switchView(viewStats, viewMain);
        }
        return;
      }

      if (action === 'go-auth') {
        navigateTo('auth', 'stats');
        return;
      }
    }
  });

  // --- Ouverture de #view-stats : réinitialisation unique sur Vue d'ensemble + chargement ---
  let wasVisible = !viewStats.classList.contains('hidden');
  const observer = new MutationObserver(() => {
    const isVisible = !viewStats.classList.contains('hidden');
    if (isVisible && !wasVisible) {
      void loadStats(true);
    }
    wasVisible = isVisible;
  });
  observer.observe(viewStats, { attributes: true, attributeFilter: ['class'] });

  onAuthChange(() => {
    if (!viewStats.classList.contains('hidden')) {
      void loadStats(true);
    }
  });
}
