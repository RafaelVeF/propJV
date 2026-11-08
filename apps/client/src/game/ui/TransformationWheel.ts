/**
 * TransformationWheel — Roue de transformation des Props.
 *
 * Wrapper spécialisé autour de RadialMenu<PropDefinition> qui expose
 * l'API attendue par game.ts : toggle(), getIsOpen(), render(), handleKeyDown(),
 * handleMouseMove(), handleClick(), handleWheel(), setCurrentEquippedPropId().
 */
import { type PropDefinition } from '@prop-hunt/shared';
import { RadialMenu } from './RadialMenu';

export interface TransformationWheelConfig {
  propsList: PropDefinition[];
  baseProp: PropDefinition;
  propImages: Map<string, HTMLImageElement>;
  onTransform: (targetProp: PropDefinition, isRevertToBase: boolean) => void;
}

export class TransformationWheel {
  private menu: RadialMenu<PropDefinition>;
  private baseProp: PropDefinition;

  constructor(config: TransformationWheelConfig) {
    this.baseProp = config.baseProp;

    this.menu = new RadialMenu<PropDefinition>({
      title: 'Transformation',
      sliceCount: 8,
      hasPagination: true,
      items: config.propsList,
      imagesMap: config.propImages,
      getItemDisplay: (prop: PropDefinition, _isEquipped: boolean) => ({
        id: prop.id,
        name: prop.displayName,
        iconPath: prop.assetPath,
        statText: `${prop.health} HP`,
        actionHint: _isEquipped ? '⟲ Retour humain' : 'Se transformer'
      }),
      onSelect: (selectedProp: PropDefinition, isRevert: boolean) => {
        if (isRevert) {
          config.onTransform(this.baseProp, true);
        } else {
          config.onTransform(selectedProp, false);
        }
      }
    });
  }

  // --- API publique (identique à l'ancienne TransformationWheel) ---

  public getIsOpen(): boolean {
    return this.menu.getIsOpen();
  }

  public toggle(currentPropId?: number): void {
    this.menu.toggle(currentPropId);
  }

  public setCurrentEquippedPropId(id: number | string | null): void {
    this.menu.setCurrentEquippedId(id);
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

