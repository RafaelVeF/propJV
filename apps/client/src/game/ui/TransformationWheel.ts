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

export class TransformationWheel extends RadialMenu<PropDefinition> {
  constructor(config: TransformationWheelConfig) {
    super({
      title: 'Transformation',
      sliceCount: 8,
      hasPagination: true,
      items: config.propsList,
      imagesMap: config.propImages,
      getItemDisplay: (prop: PropDefinition, isEquipped: boolean) => ({
        id: prop.id,
        name: prop.displayName,
        iconPath: prop.assetPath,
        statText: `${prop.health} HP`,
        actionHint: isEquipped ? '⟲ Retour humain' : 'Se transformer'
      }),
      onSelect: (selectedProp: PropDefinition, isRevert: boolean) => {
        config.onTransform(isRevert ? config.baseProp : selectedProp, isRevert);
      }
    });
  }

  public setCurrentEquippedPropId(id: number | string | null): void {
    this.setCurrentEquippedId(id);
  }
}

