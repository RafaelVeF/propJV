import { GAMEPLAY_CONFIG, PlayerRole, DEFAULT_PROPS, type PropDefinition } from '@prop-hunt/shared';
import type { GameState } from '../state';

/** Tout ce qu'il faut pour dessiner un personnage (joueur local ou distant) */
export interface RenderableCharacter {
  x: number;
  y: number;
  prop: PropDefinition;
  variantIndex: number;
  health: number;
  maxHealth: number;
  lastHitTimestamp: number | undefined;
  bodyColor: string;
  glowColor: string;
  label: string;
}

/**
 * Liste des personnages visibles à dessiner, triés par profondeur (Y-Sorting).
 * Règle d'or 2D top-down : plus Y est petit (plus haut / plus au fond), plus l'entité est dessinée tôt.
 * Plus Y est grand (plus bas / au premier plan), plus l'entité est dessinée tard (devant les autres).
 */
export function collectCharacters(state: GameState): RenderableCharacter[] {
  const { player, spectator } = state;
  const characters: RenderableCharacter[] = [];

  // Le joueur local n'est plus dessiné une fois mort
  if (!spectator.active) {
    characters.push({
      x: player.x,
      y: player.y,
      prop: player.currentProp,
      variantIndex: player.variantIndex,
      health: player.health,
      maxHealth: player.maxHealth,
      lastHitTimestamp: player.lastHitTimestamp,
      bodyColor: '#ef4444',
      glowColor: '#dc2626',
      label: state.localPlayerRole === PlayerRole.HUNTER ? 'Moi : Chasseur' : `Moi : ${player.currentProp.displayName}`
    });
  }

  state.otherPlayers.forEach((op, id) => {
    if (op.role === PlayerRole.SPECTATOR) return; // Les morts sont invisibles
    const isSpectated = spectator.active && !spectator.freeCam && id === spectator.targetId;
    const propToDraw = op.currentProp || DEFAULT_PROPS[0];
    characters.push({
      x: op.x,
      y: op.y,
      prop: propToDraw,
      variantIndex: op.variantIndex ?? 0,
      health: op.health ?? propToDraw.health,
      maxHealth: op.maxHealth ?? propToDraw.health,
      lastHitTimestamp: op.lastHitTimestamp,
      bodyColor: op.role === PlayerRole.HUNTER ? '#f97316' : '#a855f7',
      glowColor: op.role === PlayerRole.HUNTER ? '#ea580c' : '#7c3aed',
      label: `${isSpectated ? '👁 ' : ''}${op.name || 'Joueur'} : ${op.role === PlayerRole.HUNTER ? 'Chasseur' : propToDraw.displayName}`
    });
  });

  // Tri par Y croissant : ceux qui sont plus haut sont dessinés d'abord, ceux plus bas passent devant
  characters.sort((a, b) => a.y - b.y);
  return characters;
}

/**
 * Dessine un personnage ou un prop : ombre, sprite (ou forme de repli),
 * barre de vie temporaire après un coup, et hitbox de debug (touche H).
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  character: RenderableCharacter,
  propImages: Map<string, HTMLImageElement>,
  showHitbox: boolean
): void {
  const {
    x: posX, y: posY, prop, variantIndex, health, maxHealth,
    lastHitTimestamp, bodyColor, glowColor, label
  } = character;

  const variants = prop.variants || [];
  const variant = variants[variantIndex] || variants[0] || {
    assetPath: prop.assetPath,
    width: prop.width,
    height: prop.height,
    orientationName: 'Défaut'
  };

  const bodyW = variant.width || prop.width || 32;
  const bodyH = variant.height || prop.height || 32;
  const radius = prop.hitboxRadius || 10;
  const assetPath = variant.assetPath || prop.assetPath;

  // Point d'ancrage : (posX, posY) est le centre de la hitbox physique au sol
  // Le corps du prop/personnage s'élève au-dessus de ses pieds
  const bodyX = posX - bodyW / 2;
  const bodyY = posY + radius - bodyH;

  // A. Ombre au sol (effet de perspective top-down)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(posX, posY, radius + 2, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();
  ctx.restore();

  // B. Rendu du Prop (Texture PNG de la variante active ou forme géométrique de repli)
  const propImg = assetPath ? propImages.get(assetPath) : null;
  if (propImg && propImg.complete && propImg.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false; // Rendu pixel art net
    ctx.drawImage(propImg, bodyX, bodyY, bodyW, bodyH);
    ctx.restore();
  } else {
    // Rendu géométrique par défaut (ex: forme humanoïde ou boîte)
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.roundRect(bodyX, bodyY, bodyW, bodyH, 4);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Repère visuel pour le mode humanoïde
    if (prop.internalName === 'prop_human') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(bodyX + 4, bodyY + 6, bodyW - 8, 8);
    }
    ctx.restore();
  }

  // C. BARRE DE VIE DYNAMIQUE (Visible UNIQUEMENT pendant shows_infos_duration après un hit)
  const now = Date.now();
  const timeSinceHit = now - (lastHitTimestamp || 0);
  const isHealthBarVisible = (lastHitTimestamp !== undefined && lastHitTimestamp > 0) &&
                             (timeSinceHit < GAMEPLAY_CONFIG.shows_infos_duration);

  if (isHealthBarVisible) {
    const safeMax = Math.max(1, maxHealth);
    const safeHealth = Math.max(0, Math.min(safeMax, health));
    const healthRatio = safeHealth / safeMax;

    // Couleurs selon les pourcentages demandés :
    // - Vert par défaut (> 50%)
    // - Jaune à 50% ou moins (<= 0.50)
    // - Rouge à 25% ou moins (<= 0.25)
    let healthColor = '#22c55e'; // Vert
    if (healthRatio <= 0.25) {
      healthColor = '#ef4444'; // Rouge
    } else if (healthRatio <= 0.50) {
      healthColor = '#eab308'; // Jaune
    }

    const barW = Math.max(34, bodyW + 4);
    const barH = 5;
    const barX = posX - barW / 2;
    const barY = bodyY - 12;

    // Fondu progressif d'estompement sur la dernière seconde
    const timeRemaining = GAMEPLAY_CONFIG.shows_infos_duration - timeSinceHit;
    const fadeAlpha = timeRemaining < 1000 ? Math.max(0, timeRemaining / 1000) : 1;

    ctx.save();
    ctx.globalAlpha = fadeAlpha;

    // 1. Fond sombre de la barre de vie
    ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 2);
    ctx.fill();

    // 2. Remplissage coloré de la vie restante
    const fillW = Math.max(0, (barW - 2) * healthRatio);
    if (fillW > 0) {
      ctx.fillStyle = healthColor;
      ctx.shadowColor = healthColor;
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(barX + 1, barY + 1, fillW, barH - 2, 1);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // 3. Bordure fine
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 2);
    ctx.stroke();

    // 4. Texte des HP au-dessus de la barre
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.strokeText(`${Math.ceil(safeHealth)} / ${safeMax} HP`, posX, barY - 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`${Math.ceil(safeHealth)} / ${safeMax} HP`, posX, barY - 3);

    ctx.restore();
  }

  // D. Visualisation DEBUG de la Hitbox (activable via touche 'H')
  if (showHitbox) {
    ctx.save();

    // 1. Hitbox physique active (Cercle physique utilisé par le serveur)
    ctx.beginPath();
    ctx.arc(posX, posY, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.25)'; // Vert translucide
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#22c55e'; // Vert fluo
    ctx.stroke();

    // 2. Croix centrale de la hitbox physique (point de collision)
    ctx.beginPath();
    ctx.moveTo(posX - 4, posY);
    ctx.lineTo(posX + 4, posY);
    ctx.moveTo(posX, posY - 4);
    ctx.lineTo(posX, posY + 4);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Cadre englobant le sprite du prop (width x height de la variante)
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)'; // Jaune pointillé
    ctx.lineWidth = 1;
    ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);

    // 4. Label debug au-dessus (incluant l'orientation courante)
    const debugLabelY = isHealthBarVisible ? (bodyY - 24) : (bodyY - 6);
    const orientationTag = variant.orientationName ? ` [${variant.orientationName}]` : '';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(label ? `${label}${orientationTag}` : `${prop.displayName}${orientationTag} [R${radius}]`, posX, debugLabelY);

    ctx.restore();
  }
}
