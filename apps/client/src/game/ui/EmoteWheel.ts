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
export class EmoteWheel {
  private readonly menu: RadialMenu<HunterEmoteDefinition>;

  constructor(config: EmoteWheelConfig) {
    this.menu = new RadialMenu<HunterEmoteDefinition>({
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

  public getIsOpen(): boolean {
    return this.menu.getIsOpen();
  }

  public toggle(): void {
    this.menu.toggle();
  }

  public close(): void {
    if (this.menu.getIsOpen()) this.menu.close();
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    this.menu.render(ctx, width, height);
  }

  public handleKeyDown(e: KeyboardEvent): boolean {
    return this.menu.handleKeyDown(e);
  }

  public handleMouseMove(clientX: number, clientY: number, canvas: HTMLCanvasElement): void {
    this.menu.handleMouseMove(clientX, clientY, canvas);
  }

  public handleClick(clientX: number, clientY: number, canvas: HTMLCanvasElement): boolean {
    return this.menu.handleClick(clientX, clientY, canvas);
  }

  public handleWheel(e: WheelEvent): boolean {
    return this.menu.handleWheel(e);
  }
}
