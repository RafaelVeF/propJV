import { type HunterEmoteDefinition } from '@prop-hunt/shared';
import { RadialMenu } from './RadialMenu';

export interface EmoteWheelConfig {
  emotesList: HunterEmoteDefinition[];
  emoteImages: Map<string, HTMLImageElement>;
  onSelectEmote: (emote: HunterEmoteDefinition) => void;
}

/**
 * Roue radiale d'emotes des Chasseurs (aperçu découpé depuis le spritesheet de chaque emote).
 */
export class EmoteWheel extends RadialMenu<HunterEmoteDefinition> {
  constructor(config: EmoteWheelConfig) {
    super({
      title: 'Emotes',
      sliceCount: Math.max(3, Math.min(8, config.emotesList.length || 3)),
      hasPagination: config.emotesList.length > 8,
      items: config.emotesList,
      imagesMap: config.emoteImages,
      getItemDisplay: (emote) => {
        const col = emote.previewFrame % emote.cols;
        const row = Math.floor(emote.previewFrame / emote.cols);
        return {
          id: emote.id,
          name: emote.name,
          iconPath: emote.assetPath,
          sourceRect: {
            sx: col * emote.frameWidth,
            sy: row * emote.frameHeight,
            sw: emote.frameWidth,
            sh: emote.frameHeight
          },
          statText: `${emote.frameCount} frames`,
          actionHint: 'Jouer l\'emote'
        };
      },
      onSelect: (selectedEmote) => {
        config.onSelectEmote(selectedEmote);
      }
    });
  }
}
