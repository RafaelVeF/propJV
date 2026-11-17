export interface RadialMenuConfig<T> {
  title: string;
  sliceCount?: number; // 8 pour les Props, 4 pour les Armes du Hunter
  hasPagination?: boolean;
  items: T[];
  imagesMap?: Map<string, HTMLImageElement>;
  getItemDisplay: (item: T, isEquipped: boolean) => {
    id: string | number;
    name: string;
    iconPath?: string;
    statText?: string;
    actionHint?: string;
  };
  onSelect: (item: T, isRevertToBase: boolean) => void;
  onClose?: () => void;
}

export class RadialMenu<T> {
  private isOpen: boolean = false;
  private config: RadialMenuConfig<T>;
  private currentPage: number = 0;
  private selectedIndex: number = 0;
  private currentEquippedId: string | number | null = null;
  private hoveredNavButton: 'prev' | 'next' | null = null;
  private mouseX: number = 0;
  private mouseY: number = 0;

  private readonly outerRadius: number = 205;
  private readonly innerRadius: number = 66;
  private readonly cardSize: number = 48;
  private readonly cardSelectedSize: number = 56;

  constructor(config: RadialMenuConfig<T>) {
    this.config = {
      sliceCount: 8,
      hasPagination: true,
      ...config
    };
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public open(currentEquippedId?: string | number): void {
    this.isOpen = true;
    if (currentEquippedId !== undefined) {
      this.currentEquippedId = currentEquippedId;
    }
    this.syncPageWithCurrentItem();
  }

  public close(): void {
    this.isOpen = false;
    this.hoveredNavButton = null;
    if (this.config.onClose) {
      this.config.onClose();
    }
  }

  public toggle(currentEquippedId?: string | number): void {
    if (this.isOpen) this.close();
    else this.open(currentEquippedId);
  }

  public setItems(items: T[]): void {
    this.config.items = items;
    const maxPage = this.getTotalPages() - 1;
    if (this.currentPage > maxPage) {
      this.currentPage = Math.max(0, maxPage);
    }
  }

  public setCurrentEquippedId(id: string | number | null): void {
    this.currentEquippedId = id;
  }

  public getTotalPages(): number {
    const perPage = this.config.sliceCount || 8;
    return Math.max(1, Math.ceil(this.config.items.length / perPage));
  }

  public getCurrentPageItems(): T[] {
    const perPage = this.config.sliceCount || 8;
    const start = this.currentPage * perPage;
    return this.config.items.slice(start, start + perPage);
  }

  public prevPage(): void {
    if (!this.config.hasPagination) return;
    const total = this.getTotalPages();
    this.currentPage = (this.currentPage - 1 + total) % total;
    this.selectedIndex = 0;
  }

  public nextPage(): void {
    if (!this.config.hasPagination) return;
    const total = this.getTotalPages();
    this.currentPage = (this.currentPage + 1) % total;
    this.selectedIndex = 0;
  }

  private syncPageWithCurrentItem(): void {
    if (this.currentEquippedId === null) return;
    const perPage = this.config.sliceCount || 8;
    const idx = this.config.items.findIndex(item => {
      const display = this.config.getItemDisplay(item, false);
      return display.id === this.currentEquippedId;
    });

    if (idx !== -1) {
      this.currentPage = Math.floor(idx / perPage);
      this.selectedIndex = idx % perPage;
    }
  }

  public confirmSelection(index?: number): void {
    const items = this.getCurrentPageItems();
    const idx = index !== undefined ? index : this.selectedIndex;
    if (idx < 0 || idx >= items.length) return;

    const selectedItem = items[idx];
    if (!selectedItem) return;

    const display = this.config.getItemDisplay(selectedItem, false);
    const isRevert = (this.currentEquippedId !== null && this.currentEquippedId === display.id);

    this.config.onSelect(selectedItem, isRevert);
    this.close();
  }

  // Événements Clavier
  public handleKeyDown(e: KeyboardEvent): boolean {
    if (!this.isOpen) return false;

    const key = e.key.toLowerCase();

    if (this.config.hasPagination) {
      if (key === 'q' || key === 'arrowleft') {
        this.prevPage();
        return true;
      }
      if (key === 'd' || key === 'arrowright') {
        this.nextPage();
        return true;
      }
    }

    if (key === 'e' || key === 'escape') {
      this.close();
      return true;
    }

    if (key === 'enter' || key === ' ') {
      this.confirmSelection();
      return true;
    }

    // Touches de déplacement interceptées
    if (key === 'z' || key === 's' || key === 'arrowup' || key === 'arrowdown') {
      return true;
    }

    return false;
  }

  // Événements Souris
  public handleMouseMove(clientX: number, clientY: number, canvas: HTMLCanvasElement): void {
    if (!this.isOpen) return;

    const rect = canvas.getBoundingClientRect();
    this.mouseX = (clientX - rect.left) * (canvas.width / rect.width);
    this.mouseY = (clientY - rect.top) * (canvas.height / rect.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const dx = this.mouseX - cx;
    const dy = this.mouseY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Boutons de navigation (si pagination active)
    if (this.config.hasPagination) {
      const navY = cy + this.outerRadius + 36;
      const btnW = 50;
      const btnH = 30;
      const prevX = cx - 145;
      const nextX = cx + 95;

      if (this.mouseY >= navY - btnH / 2 && this.mouseY <= navY + btnH / 2) {
        if (this.mouseX >= prevX && this.mouseX <= prevX + btnW) {
          this.hoveredNavButton = 'prev';
          return;
        }
        if (this.mouseX >= nextX && this.mouseX <= nextX + btnW) {
          this.hoveredNavButton = 'next';
          return;
        }
      }
    }
    this.hoveredNavButton = null;

    // Détection de secteur radial
    const sliceCount = this.config.sliceCount || 8;
    const stepAngle = (Math.PI * 2) / sliceCount;

    if (dist >= this.innerRadius - 4 && dist <= this.outerRadius + 28) {
      const angle = Math.atan2(dy, dx);
      let phi = angle + Math.PI / 2 + stepAngle / 2;
      while (phi < 0) phi += Math.PI * 2;
      while (phi >= Math.PI * 2) phi -= Math.PI * 2;

      const sector = Math.floor(phi / stepAngle);
      if (sector >= 0 && sector < sliceCount) {
        const items = this.getCurrentPageItems();
        if (sector < items.length) {
          this.selectedIndex = sector;
        }
      }
    }
  }

  public handleClick(clientX: number, clientY: number, canvas: HTMLCanvasElement): boolean {
    if (!this.isOpen) return false;

    const rect = canvas.getBoundingClientRect();
    const mx = (clientX - rect.left) * (canvas.width / rect.width);
    const my = (clientY - rect.top) * (canvas.height / rect.height);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const dx = mx - cx;
    const dy = my - cy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 1. Boutons pagination
    if (this.config.hasPagination) {
      const navY = cy + this.outerRadius + 36;
      const btnW = 50;
      const btnH = 30;
      const prevX = cx - 145;
      const nextX = cx + 95;

      if (my >= navY - btnH / 2 && my <= navY + btnH / 2) {
        if (mx >= prevX && mx <= prevX + btnW) {
          this.prevPage();
          return true;
        }
        if (mx >= nextX && mx <= nextX + btnW) {
          this.nextPage();
          return true;
        }
      }
    }

    // 2. Moyeu central
    if (dist < this.innerRadius) {
      this.confirmSelection();
      return true;
    }

    // 3. Secteur radial
    const sliceCount = this.config.sliceCount || 8;
    const stepAngle = (Math.PI * 2) / sliceCount;

    if (dist >= this.innerRadius && dist <= this.outerRadius + 28) {
      const angle = Math.atan2(dy, dx);
      let phi = angle + Math.PI / 2 + stepAngle / 2;
      while (phi < 0) phi += Math.PI * 2;
      while (phi >= Math.PI * 2) phi -= Math.PI * 2;

      const sector = Math.floor(phi / stepAngle);
      const items = this.getCurrentPageItems();
      if (sector >= 0 && sector < items.length) {
        this.selectedIndex = sector;
        this.confirmSelection(sector);
        return true;
      }
    }

    // 4. Clic à l'extérieur : fermer
    if (dist > this.outerRadius + 70) {
      this.close();
      return true;
    }

    return true;
  }

  public handleWheel(e: WheelEvent): boolean {
    if (!this.isOpen || !this.config.hasPagination) return false;
    if (e.deltaY > 0) this.nextPage();
    else if (e.deltaY < 0) this.prevPage();
    return true;
  }

  // --- RENDU CANVAS 2D DE LA ROUE ---
  public render(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.isOpen) return;

    ctx.save();

    const cx = width / 2;
    const cy = height / 2;

    // 1. Fond sombre semi-opaque
    ctx.fillStyle = 'rgba(8, 10, 15, 0.72)';
    ctx.fillRect(0, 0, width, height);

    // 2. Halo d'ambiance blanc subtil
    const radialGlow = ctx.createRadialGradient(cx, cy, this.innerRadius, cx, cy, this.outerRadius + 30);
    radialGlow.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    radialGlow.addColorStop(0.7, 'rgba(35, 40, 55, 0.4)');
    radialGlow.addColorStop(1, 'rgba(10, 12, 20, 0)');
    ctx.fillStyle = radialGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, this.outerRadius + 30, 0, Math.PI * 2);
    ctx.fill();

    const items = this.getCurrentPageItems();
    const sliceCount = this.config.sliceCount || 8;
    const stepAngle = (Math.PI * 2) / sliceCount;

    // 3. Dessiner les secteurs
    for (let i = 0; i < sliceCount; i++) {
      const centerAngle = -Math.PI / 2 + i * stepAngle;
      const startAngle = centerAngle - stepAngle / 2 + 0.025;
      const endAngle = centerAngle + stepAngle / 2 - 0.025;

      const isSelected = (this.selectedIndex === i && i < items.length);
      const item = i < items.length ? items[i] : null;
      const display = item ? this.config.getItemDisplay(item, false) : null;
      const isEquipped = display !== null && display.id === this.currentEquippedId;

      let ox = 0;
      let oy = 0;
      let curOuterR = this.outerRadius;
      let curInnerR = this.innerRadius;

      if (isSelected) {
        const elevateDist = 10;
        ox = Math.cos(centerAngle) * elevateDist;
        oy = Math.sin(centerAngle) * elevateDist;
        curOuterR = this.outerRadius + 8;
        curInnerR = this.innerRadius + 2;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, curOuterR, startAngle, endAngle, false);
      ctx.arc(cx + ox, cy + oy, curInnerR, endAngle, startAngle, true);
      ctx.closePath();

      if (isSelected) {
        // Survol blanc simple léger
        ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
        ctx.shadowBlur = 14;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(28, 32, 44, 0.82)';
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.restore();

      // Carte du slot
      const midRadius = (curInnerR + curOuterR) / 2;
      const cardX = cx + ox + Math.cos(centerAngle) * midRadius;
      const cardY = cy + oy + Math.sin(centerAngle) * midRadius;
      const size = isSelected ? this.cardSelectedSize : this.cardSize;

      this.renderSlotCard(ctx, cardX, cardY, size, display, isSelected, isEquipped);
    }

    // 4. Moyeu central
    this.renderCenterHub(ctx, cx, cy, items);

    // 5. Pagination
    if (this.config.hasPagination) {
      this.renderPaginationBar(ctx, cx, cy, this.getTotalPages());
    }

    ctx.restore();
  }

  private renderSlotCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    display: { id: string | number; name: string; iconPath?: string } | null,
    isSelected: boolean,
    isEquipped: boolean
  ): void {
    ctx.save();
    const half = size / 2;

    if (display) {
      ctx.beginPath();
      ctx.roundRect(x - half, y - half, size, size, 8);

      if (isSelected) {
        ctx.fillStyle = '#f8fafc';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.fill();

        ctx.strokeStyle = isEquipped ? '#22c55e' : 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = isEquipped ? 2 : 1;
        ctx.stroke();
      }

      // Icône / texture
      const img = display.iconPath && this.config.imagesMap ? this.config.imagesMap.get(display.iconPath) : null;
      if (img && img.complete && img.naturalWidth > 0) {
        const padding = isSelected ? 8 : 6;
        const maxDraw = size - padding * 2;
        const scale = Math.min(maxDraw / img.naturalWidth, maxDraw / img.naturalHeight, 1.8);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;

        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH);
      } else {
        // Fallback textuel élégant
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = isSelected ? '#0f172a' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(display.name.substring(0, 6), x, y);
      }

      if (isEquipped) {
        const tagW = 28;
        const tagH = 12;
        const tagX = x + half - tagW + 4;
        const tagY = y - half - 2;

        ctx.beginPath();
        ctx.roundRect(tagX, tagY, tagW, tagH, 3);
        ctx.fillStyle = '#22c55e';
        ctx.fill();

        ctx.font = 'bold 7px sans-serif';
        ctx.fillStyle = '#052e16';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ACTIF', tagX + tagW / 2, tagY + tagH / 2);
      }
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.fill();

      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  private renderCenterHub(ctx: CanvasRenderingContext2D, cx: number, cy: number, items: T[]): void {
    ctx.save();

    ctx.beginPath();
    ctx.arc(cx, cy, this.innerRadius, 0, Math.PI * 2);
    const hubGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, this.innerRadius);
    hubGrad.addColorStop(0, 'rgba(24, 26, 38, 0.98)');
    hubGrad.addColorStop(1, 'rgba(15, 17, 26, 0.96)');
    ctx.fillStyle = hubGrad;
    ctx.fill();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const selectedItem = (this.selectedIndex >= 0 && this.selectedIndex < items.length)
      ? items[this.selectedIndex]
      : null;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (selectedItem) {
      const display = this.config.getItemDisplay(selectedItem, false);
      const isEquipped = (display.id === this.currentEquippedId);

      ctx.font = 'bold 13px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(display.name, cx, cy - 18);

      if (display.statText) {
        ctx.font = 'bold 12px monospace';
        ctx.fillStyle = '#4ade80';
        ctx.fillText(display.statText, cx, cy + 2);
      }

      ctx.font = 'bold 9px sans-serif';
      if (display.actionHint) {
        ctx.fillStyle = isEquipped ? '#f59e0b' : '#ffffff';
        ctx.fillText(display.actionHint, cx, cy + 22);
      }
    } else {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(this.config.title.toUpperCase(), cx, cy - 10);

      ctx.font = '10px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Choisir un élément', cx, cy + 8);
    }

    ctx.restore();
  }

  private renderPaginationBar(ctx: CanvasRenderingContext2D, cx: number, cy: number, totalPages: number): void {
    ctx.save();

    const navY = cy + this.outerRadius + 36;
    const btnW = 50;
    const btnH = 30;
    const prevX = cx - 145;
    const nextX = cx + 95;

    // Précédent [Q]
    const isPrevHovered = this.hoveredNavButton === 'prev';
    ctx.beginPath();
    ctx.roundRect(prevX, navY - btnH / 2, btnW, btnH, 6);
    ctx.fillStyle = isPrevHovered ? 'rgba(255, 255, 255, 0.25)' : 'rgba(30, 35, 50, 0.85)';
    ctx.fill();
    ctx.strokeStyle = isPrevHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = isPrevHovered ? 2 : 1;
    ctx.stroke();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = isPrevHovered ? '#ffffff' : '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀ Q', prevX + btnW / 2, navY);

    // Indicateur < 1 of XX >
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`< ${this.currentPage + 1} of ${totalPages} >`, cx, navY);

    // Suivant [D]
    const isNextHovered = this.hoveredNavButton === 'next';
    ctx.beginPath();
    ctx.roundRect(nextX, navY - btnH / 2, btnW, btnH, 6);
    ctx.fillStyle = isNextHovered ? 'rgba(255, 255, 255, 0.25)' : 'rgba(30, 35, 50, 0.85)';
    ctx.fill();
    ctx.strokeStyle = isNextHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = isNextHovered ? 2 : 1;
    ctx.stroke();

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = isNextHovered ? '#ffffff' : '#cbd5e1';
    ctx.fillText('D ▶', nextX + btnW / 2, navY);

    ctx.restore();
  }
}

