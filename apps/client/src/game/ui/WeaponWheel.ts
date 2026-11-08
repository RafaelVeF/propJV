/**
 * WeaponWheel — Roue de sélection d'armes pour les Chasseurs (Hunters).
 *
 * Utilise RadialMenu<WeaponDefinition> avec 4 emplacements fixes :
 * Slot 0 : Corps à corps (Pied-de-biche / Crowbar)
 * Slot 1 : Arme de poing (Pistolet 9mm)
 * Slot 2 : Jet / Explosif (Grenade)
 * Slot 3 : Spécial
 */
import { type WeaponDefinition, DEFAULT_WEAPONS } from '@prop-hunt/shared';
import { RadialMenu } from './RadialMenu';

export interface WeaponWheelConfig {
  weapons?: WeaponDefinition[];
  weaponImages?: Map<string, HTMLImageElement>;
  onSelectWeapon: (weapon: WeaponDefinition) => void;
}

export class WeaponWheel {
  private menu: RadialMenu<WeaponDefinition>;

  constructor(config: WeaponWheelConfig) {
    const items = config.weapons || DEFAULT_WEAPONS;

    this.menu = new RadialMenu<WeaponDefinition>({
      title: 'Arsenal Hunter',
      sliceCount: 4,
      hasPagination: false,
      items: items,
      imagesMap: config.weaponImages,
      getItemDisplay: (weapon: WeaponDefinition, _isEquipped: boolean) => ({
        id: weapon.id,
        name: weapon.displayName,
        iconPath: weapon.iconPath,
        statText: `${weapon.damage} DMG • ${weapon.ammoMax < 0 ? '∞' : weapon.ammoMax}`,
        actionHint: _isEquipped ? 'Équipée' : 'Équiper'
      }),
      onSelect: (selectedWeapon: WeaponDefinition) => {
        config.onSelectWeapon(selectedWeapon);
      }
    });
  }

  public getIsOpen(): boolean {
    return this.menu.getIsOpen();
  }

  public toggle(currentWeaponId?: string): void {
    this.menu.toggle(currentWeaponId);
  }

  public setCurrentEquippedWeaponId(id: string | null): void {
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

