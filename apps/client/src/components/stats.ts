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

const PROP_LABELS: Record<string, string> = {
  prop_can: 'Canette',
  prop_chair: 'Chaise',
  prop_desk: 'Bureau',
  prop_bag: 'Sac à dos',
  prop_wall_painting: 'Tableau mural',
  prop_vending_machine: 'Distributeur',
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
  return `${hours}h ${minutes}m`;
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

function formatPropName(propInternalName: string | null | undefined): string {
  if (!propInternalName) return '—';
  if (PROP_LABELS[propInternalName]) {
    return PROP_LABELS[propInternalName];
  }
  return propInternalName
    .replace(/^prop_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase());
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
  if (!classInternalName) return '—';
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

export function renderStats(): string {
  return `
    <!-- Vue 8 : Statistiques (Plein Écran) -->
    <div id="view-stats" class="view stats-fullscreen-view hidden">
      <!-- En-tête fixe (Sticky Header) pleine largeur -->
      <header class="stats-sticky-header">
        <div class="stats-header-inner">
          <div class="stats-header-left">
            <h2 class="stats-brand-title purple-text">STATISTIQUES</h2>
            <span class="stats-header-sep" aria-hidden="true">/</span>
            <nav class="stats-breadcrumb" id="stats-breadcrumb" aria-label="Fil d'Ariane">
              <span class="stats-crumb is-active">Vue globale</span>
            </nav>
            <span class="stats-player-subtitle" id="stats-player-subtitle"></span>
          </div>
          <div class="stats-header-right">
            <button class="stats-nav-back-btn" id="btn-back-main-from-stats" type="button">
              ← RETOUR
            </button>
          </div>
        </div>
      </header>

      <!-- Zone de contenu scrollable fluide -->
      <main class="stats-scroll-area" id="stats-scroll-area">
        <div class="stats-main-container">
          <!-- État de chargement / erreur / non connecté -->
          <div id="stats-state-banner" class="stats-state-banner hidden"></div>

          <!-- VUE 1 : VUE GLOBALE DES STATISTIQUES -->
          <div id="stats-content-root" class="stats-flat-layout">
            <!-- 1. Bandeau KPIs (4 colonnes) -->
            <section class="stats-kpi-strip" aria-label="Indicateurs clés">
              <div class="stats-kpi-item">
                <span class="stats-kpi-label">PARTIES JOUÉES</span>
                <strong class="stats-kpi-value" id="stat-kpi-matches">0</strong>
              </div>
              <div class="stats-kpi-item">
                <span class="stats-kpi-label">TAUX DE VICTOIRE</span>
                <strong class="stats-kpi-value cyan-text" id="stat-kpi-winrate">0%</strong>
              </div>
              <div class="stats-kpi-item">
                <span class="stats-kpi-label">TEMPS DE JEU</span>
                <strong class="stats-kpi-value" id="stat-kpi-playtime">0h 0m</strong>
              </div>
              <div class="stats-kpi-item">
                <span class="stats-kpi-label">MEILLEURE SÉRIE</span>
                <strong class="stats-kpi-value purple-text" id="stat-kpi-streak">0</strong>
              </div>
            </section>

            <!-- 2. Répartition Hider vs Seeker -->
            <section class="stats-ratio-section" aria-label="Répartition des victoires Hider vs Seeker">
              <div class="stats-ratio-labels">
                <span class="stats-ratio-side purple-text">
                  HIDER · <strong id="stat-ratio-hider-wins">0</strong> VICTOIRES (<span id="stat-ratio-hider-pct">50%</span>)
                </span>
                <span class="stats-section-caption">RÉPARTITION DES VICTOIRES</span>
                <span class="stats-ratio-side blue-text">
                  (<span id="stat-ratio-seeker-pct">50%</span>) <strong id="stat-ratio-seeker-wins">0</strong> VICTOIRES · SEEKER
                </span>
              </div>
              <div class="stats-ratio-bar-track">
                <div class="stats-ratio-bar-hider" id="stat-ratio-bar-hider" style="width: 50%"></div>
                <div class="stats-ratio-bar-seeker" id="stat-ratio-bar-seeker" style="width: 50%"></div>
              </div>
            </section>

            <!-- 3. Détails par rôle (2 colonnes côte à côte séparées par un filet vertical) -->
            <section class="stats-roles-split" aria-label="Détails par rôle">
              <div class="stats-role-column">
                <h3 class="stats-role-heading purple-text">HIDER</h3>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Victoires</span>
                  <strong class="stats-row-val" id="stat-hider-wins">0</strong>
                </div>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Survie moyenne</span>
                  <strong class="stats-row-val" id="stat-hider-survival">—</strong>
                </div>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Transformations</span>
                  <strong class="stats-row-val" id="stat-hider-transforms">0</strong>
                </div>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Taunts utilisés</span>
                  <strong class="stats-row-val" id="stat-hider-taunts">0</strong>
                </div>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Prop favori</span>
                  <strong class="stats-row-val purple-text" id="stat-hider-fav-prop">—</strong>
                </div>
              </div>

              <div class="stats-role-column">
                <h3 class="stats-role-heading blue-text">SEEKER</h3>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Victoires</span>
                  <strong class="stats-row-val" id="stat-seeker-wins">0</strong>
                </div>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Éliminations</span>
                  <strong class="stats-row-val" id="stat-seeker-elims">0</strong>
                </div>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Précision des tirs</span>
                  <strong class="stats-row-val cyan-text" id="stat-seeker-accuracy">—</strong>
                </div>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Props détruits</span>
                  <strong class="stats-row-val" id="stat-seeker-destroyed">0</strong>
                </div>
                <div class="stats-flat-row">
                  <span class="stats-row-label">Dégâts infligés</span>
                  <strong class="stats-row-val" id="stat-seeker-damage">0</strong>
                </div>
              </div>
            </section>

            <!-- 4. Dernières parties -->
            <section class="stats-recent-section" aria-label="Dernières parties">
              <div class="stats-recent-header">
                <h3 class="stats-section-title">DERNIÈRES PARTIES</h3>
                <span class="stats-recent-meta" id="stats-total-score-meta">SCORE CUMULÉ : 0 PTS</span>
              </div>
              <div id="stats-recent-list" class="stats-recent-list"></div>
            </section>
          </div>

          <!-- VUE 2 : VUE DÉTAILLÉE D'UNE PARTIE -->
          <div id="stats-match-detail-root" class="stats-flat-layout hidden"></div>
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
  const isWin =
    match.winning_team !== null
      ? match.winning_team === match.role
      : match.role === 'HIDER' && Boolean(match.is_survivor);
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
    <div class="stats-match-row is-clickable" data-match-id="${match.match_id}" role="button" tabindex="0" aria-label="Voir le détail de la partie #${match.match_id}">
      <span class="stats-match-outcome ${outcomeClass}">${outcomeLabel}</span>
      <span class="stats-match-role ${roleClass}">${match.role}</span>
      <span class="stats-match-map">${mapLabel} <small class="stats-match-date-inline">· ${dateLabel}</small></span>
      <span class="stats-match-duration">${durationLabel}</span>
      <strong class="stats-match-score">${scoreLabel}</strong>
      <span class="stats-match-cta">Voir le détail →</span>
    </div>
  `;
}

function updateStatsDOM(payload: MyStatsPayload): void {
  const { stats, recentMatches, telemetry } = payload;

  const matchesPlayed = stats.matches_played ?? 0;
  const hiderWins = stats.hider_wins ?? 0;
  const seekerWins = stats.seeker_wins ?? 0;
  const totalWins = hiderWins + seekerWins;
  const winRate = matchesPlayed > 0 ? Math.round((totalWins / matchesPlayed) * 100) : 0;

  // 1. KPIs
  setText('stat-kpi-matches', String(matchesPlayed));
  setText('stat-kpi-winrate', `${winRate}%`);
  setText('stat-kpi-playtime', formatPlaytime(stats.total_playtime_seconds ?? 0));
  setText('stat-kpi-streak', String(stats.win_streak_best ?? 0));

  // 2. Répartition Hider vs Seeker
  const hiderPct = totalWins > 0 ? Math.round((hiderWins / totalWins) * 100) : 50;
  const seekerPct = totalWins > 0 ? 100 - hiderPct : 50;

  setText('stat-ratio-hider-wins', String(hiderWins));
  setText('stat-ratio-seeker-wins', String(seekerWins));
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

  // 3. Détails Hider & Seeker
  setText('stat-hider-wins', String(hiderWins));
  setText(
    'stat-hider-survival',
    telemetry?.avgSurvivalTimeSec !== null && telemetry?.avgSurvivalTimeSec !== undefined
      ? formatDurationShort(telemetry.avgSurvivalTimeSec)
      : '—'
  );
  setText('stat-hider-transforms', String(stats.props_transformed_total ?? 0));
  setText('stat-hider-taunts', String(stats.taunts_used_total ?? 0));
  setText('stat-hider-fav-prop', formatPropName(telemetry?.favoriteProp));

  setText('stat-seeker-wins', String(seekerWins));
  setText('stat-seeker-elims', String(stats.total_eliminations ?? 0));
  setText(
    'stat-seeker-accuracy',
    telemetry?.accuracyPercent !== null && telemetry?.accuracyPercent !== undefined
      ? `${telemetry.accuracyPercent}%`
      : '—'
  );
  setText('stat-seeker-destroyed', String(stats.props_destroyed_total ?? 0));
  setText('stat-seeker-damage', String(stats.damage_dealt_total ?? 0));

  // 4. Dernières parties
  setText('stats-total-score-meta', `SCORE CUMULÉ : ${stats.total_score ?? 0} PTS`);

  const recentList = document.getElementById('stats-recent-list');
  if (recentList) {
    if (!recentMatches || recentMatches.length === 0) {
      recentList.innerHTML = `
        <div class="stats-empty-line">
          Aucune partie enregistrée pour le moment. Lancez un match pour voir votre historique apparaître ici.
        </div>
      `;
    } else {
      recentList.innerHTML = recentMatches.map(renderRecentMatchRow).join('');
    }
  }
}

function renderParticipantRow(
  p: MatchParticipant,
  currentUserId: number | null,
  telemetryPlayer?: MatchTelemetryPlayer
): string {
  const isMe = currentUserId !== null && p.user_id === currentUserId;
  const roleClass = p.role === 'HIDER' ? 'purple-text' : 'blue-text';

  let survivalStatus = '—';
  let survivalClass = '';
  if (p.role === 'HIDER') {
    if (p.is_survivor) {
      survivalStatus = `SURVIVANT (${formatDurationShort(p.survival_time_seconds)})`;
      survivalClass = 'is-win';
    } else {
      survivalStatus = `ÉLIMINÉ (${formatDurationShort(p.survival_time_seconds)})`;
      survivalClass = 'is-loss';
    }
  } else {
    survivalStatus = `ACTIF (${formatDurationShort(p.survival_time_seconds)})`;
  }

  const accuracy =
    p.shots_fired > 0
      ? `${Math.round((p.shots_hit / p.shots_fired) * 100)}% (${p.shots_hit}/${p.shots_fired})`
      : '—';

  const loadoutLabel =
    p.role === 'HIDER'
      ? formatPropName(p.final_prop_name)
      : formatClassName(p.seeker_class_name);

  const propsUsedList =
    telemetryPlayer?.propsUsed && telemetryPlayer.propsUsed.length > 0
      ? telemetryPlayer.propsUsed.map((pr) => formatPropName(pr)).join(', ')
      : null;

  return `
    <div class="stats-scoreboard-row ${isMe ? 'is-current-user' : ''}">
      <div class="stats-sb-player">
        <strong class="stats-sb-username">${escapeHtml(p.username)}</strong>
        ${isMe ? '<span class="stats-me-tag">VOUS</span>' : ''}
        ${
          propsUsedList
            ? `<div class="stats-sb-subprops">Props incarnés : ${escapeHtml(propsUsedList)}</div>`
            : ''
        }
      </div>
      <span class="stats-sb-role ${roleClass}">${p.role}</span>
      <span class="stats-sb-status ${survivalClass}">${survivalStatus}</span>
      <strong class="stats-sb-score cyan-text">${p.score_earned} PTS</strong>
      <span class="stats-sb-num">${p.eliminations}</span>
      <span class="stats-sb-num">${p.transformations_count}</span>
      <span class="stats-sb-num">${p.taunts_used}</span>
      <span class="stats-sb-num">${accuracy}</span>
      <span class="stats-sb-loadout">${escapeHtml(loadoutLabel)}</span>
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
      const propLabel = escapeHtml(formatPropName(ev.prop));
      description = `<strong class="${actorColor}">${actorName}</strong> s'est transformé en <strong>${propLabel}</strong>${distSuffix}`;
      break;
    }
    case 'TAUNT': {
      typeTag = 'TAUNT';
      const tauntLabel = escapeHtml(formatTauntName(ev.taunt));
      description = `<strong class="${actorColor}">${actorName}</strong> a utilisé le taunt <strong>${tauntLabel}</strong>${distSuffix}`;
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
      <span class="stats-timeline-type type-${escapeHtml(ev.type.toLowerCase())}">${escapeHtml(typeTag)}</span>
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
      ? 'HIDERS'
      : match.winning_team === 'SEEKER'
      ? 'SEEKERS'
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

  const events = Array.isArray(telemetry?.events)
    ? [...telemetry.events].sort((a, b) => (a.t ?? 0) - (b.t ?? 0))
    : [];

  return `
    <!-- 1. Bandeau résumé de la partie -->
    <section class="stats-kpi-strip stats-match-summary-strip" aria-label="Résumé de la partie">
      <div class="stats-kpi-item">
        <span class="stats-kpi-label">CARTE</span>
        <strong class="stats-kpi-value stats-kpi-value-md">${escapeHtml(formatMapName(match.map_name))}</strong>
      </div>
      <div class="stats-kpi-item">
        <span class="stats-kpi-label">ÉQUIPE GAGNANTE</span>
        <strong class="stats-kpi-value stats-kpi-value-md ${winnerColorClass}">${winnerLabel}</strong>
      </div>
      <div class="stats-kpi-item">
        <span class="stats-kpi-label">DURÉE TOTALE</span>
        <strong class="stats-kpi-value stats-kpi-value-md">${formatDurationShort(match.duration_seconds)}</strong>
      </div>
      <div class="stats-kpi-item">
        <span class="stats-kpi-label">DATE & SERVEUR</span>
        <strong class="stats-kpi-value stats-kpi-value-sm">${formatDateTime(match.start_time)}</strong>
        <span class="stats-kpi-submeta">Serveur : ${escapeHtml(match.server_id ?? 'Local')}</span>
      </div>
    </section>

    <!-- 2. Tableau des scores de tous les joueurs -->
    <section class="stats-detail-section" aria-label="Tableau des scores">
      <div class="stats-recent-header">
        <h3 class="stats-section-title">TABLEAU DES SCORES (${participants.length} JOUEURS)</h3>
        <span class="stats-recent-meta">COMPARATIF HIDERS VS SEEKERS</span>
      </div>

      <div class="stats-scoreboard-table">
        <div class="stats-scoreboard-head">
          <span>JOUEUR</span>
          <span>RÔLE</span>
          <span>STATUT / SURVIE</span>
          <span>SCORE</span>
          <span>ÉLIM.</span>
          <span>TRANSF.</span>
          <span>TAUNTS</span>
          <span>PRÉCISION</span>
          <span>PROP FINAL / CLASSE</span>
        </div>
        ${
          participants.length > 0
            ? participants
                .map((p) =>
                  renderParticipantRow(p, currentUserId, telemetryPlayerMap.get(p.user_id))
                )
                .join('')
            : '<div class="stats-empty-line">Aucun participant trouvé pour cette partie.</div>'
        }
      </div>
    </section>

    <!-- 3. Frise chronologique de télémétrie MongoDB -->
    <section class="stats-detail-section" aria-label="Frise chronologique de la partie">
      <div class="stats-recent-header">
        <h3 class="stats-section-title">CHRONOLOGIE DE LA PARTIE (TÉLÉMÉTRIE)</h3>
        <span class="stats-recent-meta">${
          telemetry
            ? `${events.length} ÉVÉNEMENT${events.length > 1 ? 'S' : ''} ENREGISTRÉ${events.length > 1 ? 'S' : ''}`
            : 'TÉLÉMÉTRIE INDISPONIBLE'
        }</span>
      </div>
      <div class="stats-timeline-list">
        ${
          events.length > 0
            ? events.map((ev) => formatTelemetryEventLine(ev, userMap)).join('')
            : `<div class="stats-empty-line">Aucun événement de télémétrie détaillé n'est disponible pour cette partie.</div>`
        }
      </div>
    </section>
  `;
}

export function initStats(): void {
  const viewMain = document.getElementById('view-main');
  const viewStats = document.getElementById('view-stats');
  const btnBackMainFromStats = document.getElementById('btn-back-main-from-stats');
  const btnStats = document.getElementById('btn-stats');
  const stateBanner = document.getElementById('stats-state-banner');
  const contentRoot = document.getElementById('stats-content-root');
  const detailRoot = document.getElementById('stats-match-detail-root');
  const breadcrumbEl = document.getElementById('stats-breadcrumb');
  const subtitleEl = document.getElementById('stats-player-subtitle');
  const scrollArea = document.getElementById('stats-scroll-area');
  const recentList = document.getElementById('stats-recent-list');

  let isFetching = false;
  let activeMatchId: number | null = null;

  function updateHeaderNavigation(): void {
    const user = getCurrentUser();
    if (subtitleEl) {
      subtitleEl.textContent = user ? `· JOUEUR : ${user.username.toUpperCase()}` : '';
    }

    if (activeMatchId === null) {
      if (btnBackMainFromStats) {
        btnBackMainFromStats.textContent = '← RETOUR';
      }
      if (breadcrumbEl) {
        breadcrumbEl.innerHTML = `<span class="stats-crumb is-active">Vue globale</span>`;
      }
    } else {
      if (btnBackMainFromStats) {
        btnBackMainFromStats.textContent = '← RETOUR AUX STATS';
      }
      if (breadcrumbEl) {
        breadcrumbEl.innerHTML = `
          <button type="button" class="stats-crumb stats-crumb-link" id="btn-stats-crumb-global">Vue globale</button>
          <span class="stats-crumb-sep">/</span>
          <span class="stats-crumb is-active">Partie #${activeMatchId}</span>
        `;
        const crumbBtn = document.getElementById('btn-stats-crumb-global');
        if (crumbBtn) {
          crumbBtn.addEventListener('click', () => {
            showGlobalStatsView();
          });
        }
      }
    }
  }

  function showGlobalStatsView(): void {
    activeMatchId = null;
    updateHeaderNavigation();
    if (detailRoot) {
      detailRoot.classList.add('hidden');
      detailRoot.innerHTML = '';
    }
    if (isAuthenticated() && contentRoot) {
      contentRoot.classList.remove('hidden');
    }
    if (stateBanner && stateBanner.querySelector('.stats-error-indicator')) {
      stateBanner.classList.add('hidden');
      stateBanner.innerHTML = '';
    }
    if (scrollArea) {
      scrollArea.scrollTop = 0;
    }
  }

  async function openMatchDetails(matchId: number): Promise<void> {
    if (isFetching) return;
    activeMatchId = matchId;
    updateHeaderNavigation();

    if (contentRoot) {
      contentRoot.classList.add('hidden');
    }
    if (detailRoot) {
      detailRoot.classList.remove('hidden');
      detailRoot.innerHTML = '';
    }
    if (scrollArea) {
      scrollArea.scrollTop = 0;
    }

    isFetching = true;
    if (stateBanner) {
      stateBanner.classList.remove('hidden');
      stateBanner.innerHTML = `<span class="stats-loading-indicator">Chargement des détails de la partie #${matchId}...</span>`;
    }

    try {
      const payload = await fetchMatchDetails(matchId);
      if (stateBanner) {
        stateBanner.classList.add('hidden');
        stateBanner.innerHTML = '';
      }
      const currentUserId = getCurrentUser()?.userId ?? null;
      if (detailRoot) {
        detailRoot.innerHTML = renderMatchDetailsDOM(payload, currentUserId);
      }
    } catch (error) {
      if (stateBanner) {
        stateBanner.classList.remove('hidden');
        const message =
          error instanceof StatsServiceError
            ? error.message
            : 'Impossible de charger les détails de cette partie.';
        stateBanner.innerHTML = `<span class="stats-error-indicator">${escapeHtml(message)}</span>`;
      }
    } finally {
      isFetching = false;
    }
  }

  async function loadStats(): Promise<void> {
    if (isFetching) return;

    activeMatchId = null;
    updateHeaderNavigation();

    if (detailRoot) {
      detailRoot.classList.add('hidden');
      detailRoot.innerHTML = '';
    }

    if (!isAuthenticated()) {
      if (contentRoot) contentRoot.classList.add('hidden');
      if (stateBanner) {
        stateBanner.classList.remove('hidden');
        stateBanner.innerHTML = `
          <p class="stats-state-text">Connectez-vous à votre compte pour consulter vos statistiques en ligne.</p>
          <button class="btn primary stats-auth-cta" id="btn-stats-go-auth">SE CONNECTER</button>
        `;
        const goAuthBtn = document.getElementById('btn-stats-go-auth');
        if (goAuthBtn) {
          goAuthBtn.addEventListener('click', () => navigateTo('auth', 'stats'));
        }
      }
      return;
    }

    isFetching = true;
    if (contentRoot) {
      contentRoot.classList.remove('hidden');
      contentRoot.classList.add('is-loading');
    }
    if (stateBanner) {
      stateBanner.classList.remove('hidden');
      stateBanner.innerHTML = `<span class="stats-loading-indicator">Synchronisation des statistiques...</span>`;
    }

    try {
      const payload = await fetchMyStats();
      if (stateBanner) {
        if (payload.stats.matches_played === 0 && payload.recentMatches.length === 0) {
          stateBanner.classList.remove('hidden');
          stateBanner.innerHTML = `<span class="stats-empty-notice">Vous n'avez pas encore joué de partie officielle. Vos compteurs sont prêts.</span>`;
        } else {
          stateBanner.classList.add('hidden');
          stateBanner.innerHTML = '';
        }
      }
      updateStatsDOM(payload);
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
      isFetching = false;
      if (contentRoot) {
        contentRoot.classList.remove('is-loading');
      }
    }
  }

  // Bouton retour (retour aux stats globales si dans un match, sinon retour au menu principal)
  if (btnBackMainFromStats) {
    btnBackMainFromStats.addEventListener('click', () => {
      if (activeMatchId !== null) {
        showGlobalStatsView();
      } else {
        switchView(viewStats, viewMain);
      }
    });
  }

  // Touche Échap (Escape) pour revenir en arrière rapidement
  window.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (!viewStats || !viewStats.classList.contains('active')) return;

    event.preventDefault();
    if (activeMatchId !== null) {
      showGlobalStatsView();
    } else {
      switchView(viewStats, viewMain);
    }
  });

  // Délégation du clic et clavier sur les lignes des dernières parties
  if (recentList) {
    recentList.addEventListener('click', (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const row = target?.closest<HTMLElement>('.stats-match-row[data-match-id]');
      if (!row) return;
      const matchId = Number(row.dataset.matchId);
      if (Number.isInteger(matchId) && matchId > 0) {
        void openMatchDetails(matchId);
      }
    });

    recentList.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target as HTMLElement | null;
      const row = target?.closest<HTMLElement>('.stats-match-row[data-match-id]');
      if (!row) return;
      event.preventDefault();
      const matchId = Number(row.dataset.matchId);
      if (Number.isInteger(matchId) && matchId > 0) {
        void openMatchDetails(matchId);
      }
    });
  }

  // Déclenchement au clic sur #btn-stats
  if (btnStats) {
    btnStats.addEventListener('click', () => {
      void loadStats();
    });
  }

  // Observation de l'ajout de la classe active sur #view-stats
  if (viewStats) {
    let wasActive = viewStats.classList.contains('active');
    const observer = new MutationObserver(() => {
      const isActive = viewStats.classList.contains('active');
      if (isActive && !wasActive) {
        void loadStats();
      }
      wasActive = isActive;
    });
    observer.observe(viewStats, { attributes: true, attributeFilter: ['class'] });
  }

  // Rafraîchissement si la session change pendant que la vue est active
  onAuthChange(() => {
    if (viewStats && viewStats.classList.contains('active')) {
      void loadStats();
    }
  });
}
