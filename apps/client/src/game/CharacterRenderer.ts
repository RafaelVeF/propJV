/**
 * CharacterRenderer — Rendu d'un personnage/prop sur le canvas 2D.
 *
 * Fonction pure de dessin : ombre, texture/fallback, barre de vie, hitbox debug.
 * Aucune mutation d'état — reçoit tout via paramètres.
 */
import { type PropDefinition, GAMEPLAY_CONFIG } from '@prop-hunt/shared';

export interface CharacterRenderData {
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
 * Dessine un personnage/prop complet : ombre, sprite, barre de vie, hitbox debug.
 */
export function drawCharacter(
  ctx: CanvasRenderingContext2D,
  data: CharacterRenderData,
  propImages: Map<string, HTMLImageElement>,
  showHitbox: boolean
): void {
  const { x: posX, y: posY, prop, variantIndex, health, maxHealth, lastHitTimestamp, bodyColor, glowColor, label } = data;

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
  const bodyX = posX - bodyW / 2;
  const bodyY = posY + radius - bodyH;

  // A. Ombre au sol
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(posX, posY, radius + 2, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();
  ctx.restore();

  // B. Rendu du Prop (texture PNG ou fallback géométrique)
  const propImg = assetPath ? propImages.get(assetPath) : null;
  if (propImg && propImg.complete && propImg.naturalWidth > 0) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(propImg, bodyX, bodyY, bodyW, bodyH);
    ctx.restore();
  } else {
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

    if (prop.internalName === 'prop_human') {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(bodyX + 4, bodyY + 6, bodyW - 8, 8);
    }
    ctx.restore();
  }

  // C. Barre de vie dynamique (visible uniquement X secondes après un hit)
  const now = Date.now();
  const timeSinceHit = now - (lastHitTimestamp || 0);
  const isHealthBarVisible = (lastHitTimestamp !== undefined && lastHitTimestamp > 0) &&
                             (timeSinceHit < GAMEPLAY_CONFIG.shows_infos_duration);

  if (isHealthBarVisible) {
    drawHealthBar(ctx, posX, bodyX, bodyY, bodyW, health, maxHealth, timeSinceHit);
  }

  // D. Hitbox debug (touche H)
  if (showHitbox) {
    drawHitboxDebug(ctx, posX, posY, bodyX, bodyY, bodyW, bodyH, radius, prop, variant, label, isHealthBarVisible);
  }
}

/** Barre de vie avec couleur dynamique et fondu progressif */
function drawHealthBar(
  ctx: CanvasRenderingContext2D,
  posX: number,
  _bodyX: number,
  bodyY: number,
  bodyW: number,
  health: number,
  maxHealth: number,
  timeSinceHit: number
): void {
  const safeMax = Math.max(1, maxHealth);
  const safeHealth = Math.max(0, Math.min(safeMax, health));
  const healthRatio = safeHealth / safeMax;

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

  // Fondu progressif sur la dernière seconde
  const timeRemaining = GAMEPLAY_CONFIG.shows_infos_duration - timeSinceHit;
  const fadeAlpha = timeRemaining < 1000 ? Math.max(0, timeRemaining / 1000) : 1;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;

  // Fond sombre
  ctx.fillStyle = 'rgba(10, 10, 10, 0.85)';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 2);
  ctx.fill();

  // Remplissage coloré
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

  // Bordure
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 2);
  ctx.stroke();

  // Texte HP
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.strokeText(`${Math.ceil(safeHealth)} / ${safeMax} HP`, posX, barY - 3);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${Math.ceil(safeHealth)} / ${safeMax} HP`, posX, barY - 3);

  ctx.restore();
}

/** Visualisation debug : hitbox circulaire, bounding box sprite, label */
function drawHitboxDebug(
  ctx: CanvasRenderingContext2D,
  posX: number,
  posY: number,
  bodyX: number,
  bodyY: number,
  bodyW: number,
  bodyH: number,
  radius: number,
  prop: PropDefinition,
  variant: { orientationName?: string },
  label: string,
  isHealthBarVisible: boolean
): void {
  ctx.save();

  // Hitbox circulaire
  ctx.beginPath();
  ctx.arc(posX, posY, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#22c55e';
  ctx.stroke();

  // Croix centrale
  ctx.beginPath();
  ctx.moveTo(posX - 4, posY);
  ctx.lineTo(posX + 4, posY);
  ctx.moveTo(posX, posY - 4);
  ctx.lineTo(posX, posY + 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cadre englobant le sprite
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bodyX, bodyY, bodyW, bodyH);

  // Label debug
  const debugLabelY = isHealthBarVisible ? (bodyY - 24) : (bodyY - 6);
  const orientationTag = variant.orientationName ? ` [${variant.orientationName}]` : '';
  ctx.font = '9px monospace';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(label ? `${label}${orientationTag}` : `${prop.displayName}${orientationTag} [R${radius}]`, posX, debugLabelY);

  ctx.restore();
}

