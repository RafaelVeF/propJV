/**
 * ChatManager — Gestionnaire de chat textuel flottant en jeu pour PropJV.
 *
 * Spécifications et Style :
 * - Style visuel : Gris semi-opaque, bordures blanches subtiles et typographie blanc cassé
 *   en accord parfait avec la roue radiale. Zéro néon bleu.
 * - Touche [T] ou clic sur la bulle en haut à gauche pour ouvrir.
 * - Ré-appuyer sur [T] (si vide), [Échap] ou clic en dehors pour fermer.
 * - Mode fermé : Flottant transparent, pas de cadre, messages visibles 15s avec fondu.
 * - Mode ouvert : Cadre rectangulaire élégant, fond sombre semi-opaque dépoli, historique complet scrollable à la molette.
 * - Noms des joueurs à gauche avec couleurs adaptées.
 * - Système d'autocomplétion / suggestions interactives dès la saisie de '/' avec navigation clavier/souris.
 * - Commande /clear exécutée instantanément côté client.
 */

import {
  type ChatMessagePayload,
  PlayerRole,
  CHAT_COMMANDS,
  type ChatCommandDefinition
} from '@prop-hunt/shared';

export interface ChatManagerOptions {
  containerId?: string;
  onSendMessage: (text: string) => void;
  getLocalPlayerId: () => string | null;
}

export class ChatManager {
  private isOpen: boolean = false;
  private messages: ChatMessagePayload[] = [];
  private options: ChatManagerOptions;
  private openTimestamp: number = 0;
  private unreadCount: number = 0;

  // Autocomplétion des commandes
  private currentSuggestions: ChatCommandDefinition[] = [];
  private selectedSuggestionIndex: number = 0;

  // Éléments du DOM
  private chatRoot: HTMLElement | null = null;
  private messagesList: HTMLElement | null = null;
  private suggestionsBox: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private unreadBadge: HTMLElement | null = null;

  // Interval pour nettoyer les messages éphémères (> 15s)
  private cleanupInterval: number | null = null;

  constructor(options: ChatManagerOptions) {
    this.options = options;
  }

  /**
   * Initialise et monte le Chat dans le DOM.
   */
  public mount(parentEl: HTMLElement): void {
    this.destroy();

    // 1. Bouton Bulle flottant en haut à gauche (style gris semi-opaque + blanc cassé)
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'chat-toggle-btn';
    this.toggleBtn.className = 'btn-chat-toggle';
    this.toggleBtn.title = 'Ouvrir le chat [T]';
    this.toggleBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
      <span id="chat-unread-badge" class="chat-unread-badge" style="display: none;"></span>
    `;

    this.toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    parentEl.appendChild(this.toggleBtn);
    this.unreadBadge = this.toggleBtn.querySelector('#chat-unread-badge');

    // 2. Conteneur principal du chat flottant
    this.chatRoot = document.createElement('div');
    this.chatRoot.id = 'in-game-chat';
    this.chatRoot.className = 'chat-root chat-closed';

    this.chatRoot.innerHTML = `
      <div class="chat-frame" id="chat-frame">
        <div class="chat-header">
          <div class="chat-title">
            <span class="chat-tag">CHAT</span>
            <span class="chat-hint">[Échap] ou [T] fermer • [Entrée] envoyer</span>
          </div>
          <button class="chat-close-btn" id="chat-close-btn" title="Fermer">✕</button>
        </div>
        <div class="chat-messages-list" id="chat-messages-list"></div>
        <div class="chat-suggestions-box" id="chat-suggestions-box" style="display: none;"></div>
        <div class="chat-input-wrapper" id="chat-input-wrapper">
          <input type="text" id="chat-input" class="chat-input" placeholder="Écrivez un message... (/ pour voir les commandes)" maxlength="200" autocomplete="off" />
          <button id="chat-send-btn" class="chat-send-btn" title="Envoyer">➤</button>
        </div>
      </div>
    `;

    parentEl.appendChild(this.chatRoot);

    // Références DOM
    this.messagesList = this.chatRoot.querySelector('#chat-messages-list');
    this.suggestionsBox = this.chatRoot.querySelector('#chat-suggestions-box');
    this.inputEl = this.chatRoot.querySelector('#chat-input') as HTMLInputElement;

    const closeBtn = this.chatRoot.querySelector('#chat-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.close();
      });
    }

    const sendBtn = this.chatRoot.querySelector('#chat-send-btn');
    if (sendBtn) {
      sendBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.submitMessage();
      });
    }

    // Gestion de la saisie dans l'input
    if (this.inputEl) {
      this.inputEl.addEventListener('input', () => {
        this.handleInputChange(this.inputEl!.value);
      });

      this.inputEl.addEventListener('keydown', (e) => {
        e.stopPropagation(); // Évite de déplacer le personnage en jeu pendant la frappe !

        // Navigation dans les suggestions si la boîte est visible
        if (this.isSuggestionsBoxVisible() && this.currentSuggestions.length > 0) {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedSuggestionIndex = (this.selectedSuggestionIndex - 1 + this.currentSuggestions.length) % this.currentSuggestions.length;
            this.updateSuggestionsHighlight();
            return;
          }

          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedSuggestionIndex = (this.selectedSuggestionIndex + 1) % this.currentSuggestions.length;
            this.updateSuggestionsHighlight();
            return;
          }

          if (e.key === 'Tab') {
            e.preventDefault();
            this.applySelectedSuggestion();
            return;
          }
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          // Si l'autocomplétion est ouverte sur une suggestion exacte
          if (this.isSuggestionsBoxVisible() && this.currentSuggestions.length > 0 && this.inputEl!.value.endsWith('/')) {
            this.applySelectedSuggestion();
            return;
          }
          this.submitMessage();
          return;
        }

        if (e.key === 'Escape') {
          e.preventDefault();
          if (this.isSuggestionsBoxVisible()) {
            this.hideSuggestions();
          } else {
            this.close();
          }
          return;
        }

        // Si l'utilisateur appuie sur 't' ou 'T' alors que le champ est vide :
        // Ferme le chat (comportement toggle demandé).
        if (e.key.toLowerCase() === 't' && this.inputEl!.value.trim() === '') {
          if (Date.now() - this.openTimestamp > 150 && !e.shiftKey) {
            e.preventDefault();
            this.close();
          }
        }
      });
    }

    // Clic en dehors du chat pour fermer
    document.addEventListener('mousedown', this.handleOutsideClick);

    // Nettoyage régulier des messages flottants expirés (> 15s)
    this.cleanupInterval = window.setInterval(() => {
      if (!this.isOpen) {
        this.cleanupExpiredFloatingMessages();
      }
    }, 1000);

    // Injection des styles CSS dynamiques aux tons gris/blanc cassé
    this.injectStyles();
  }

  /**
   * Analyse du texte au fur et à mesure de la frappe pour suggestions interactives
   */
  private handleInputChange(text: string): void {
    if (!text.startsWith('/')) {
      this.hideSuggestions();
      return;
    }

    const commandPart = text.slice(1).toLowerCase().split(' ')[0];
    const isExactArgMode = text.includes(' ');

    if (isExactArgMode) {
      // Déjà un argument en cours : on cherche la commande exacte pour montrer sa syntaxe
      const exactCmd = CHAT_COMMANDS.find(c => c.name === commandPart || c.aliases?.includes(commandPart));
      if (exactCmd) {
        this.currentSuggestions = [exactCmd];
        this.selectedSuggestionIndex = 0;
        this.renderSuggestions(true);
        return;
      }
      this.hideSuggestions();
      return;
    }

    // Filtrage dynamique des commandes disponibles
    if (commandPart === '') {
      this.currentSuggestions = [...CHAT_COMMANDS];
    } else {
      this.currentSuggestions = CHAT_COMMANDS.filter(c =>
        c.name.startsWith(commandPart) ||
        c.aliases?.some(a => a.startsWith(commandPart))
      );
    }

    this.selectedSuggestionIndex = 0;
    this.renderSuggestions(false);
  }

  private isSuggestionsBoxVisible(): boolean {
    return this.suggestionsBox !== null && this.suggestionsBox.style.display !== 'none';
  }

  private hideSuggestions(): void {
    if (this.suggestionsBox) {
      this.suggestionsBox.style.display = 'none';
      this.suggestionsBox.innerHTML = '';
    }
    this.currentSuggestions = [];
  }

  /**
   * Dessine la liste des suggestions de commandes
   */
  private renderSuggestions(argHelperMode: boolean): void {
    if (!this.suggestionsBox) return;

    if (this.currentSuggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.suggestionsBox.style.display = 'block';
    this.suggestionsBox.innerHTML = '';

    const titleEl = document.createElement('div');
    titleEl.className = 'chat-suggestions-title';
    titleEl.innerText = argHelperMode
      ? `Aide syntaxe : ${this.currentSuggestions[0].syntax}`
      : 'Commandes disponibles ([Tab] ou clic pour insérer) :';
    this.suggestionsBox.appendChild(titleEl);

    this.currentSuggestions.forEach((cmd, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = `chat-suggestion-item ${idx === this.selectedSuggestionIndex ? 'selected' : ''}`;

      itemEl.innerHTML = `
        <div class="chat-sug-header">
          <span class="chat-sug-name">/${cmd.name}</span>
          <span class="chat-sug-syntax">${this.escapeHtml(cmd.syntax)}</span>
        </div>
        <div class="chat-sug-desc">${this.escapeHtml(cmd.description)} • <span class="chat-sug-ex">Exemple: ${this.escapeHtml(cmd.example)}</span></div>
      `;

      itemEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.selectedSuggestionIndex = idx;
        this.applySelectedSuggestion();
      });

      this.suggestionsBox!.appendChild(itemEl);
    });
  }

  private updateSuggestionsHighlight(): void {
    if (!this.suggestionsBox) return;
    const items = this.suggestionsBox.querySelectorAll('.chat-suggestion-item');
    items.forEach((item, idx) => {
      if (idx === this.selectedSuggestionIndex) {
        item.classList.add('selected');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('selected');
      }
    });
  }

  /**
   * Applique la commande suggérée sélectionnée dans le champ texte
   */
  private applySelectedSuggestion(): void {
    if (!this.inputEl || this.currentSuggestions.length === 0) return;
    const selectedCmd = this.currentSuggestions[this.selectedSuggestionIndex];
    if (!selectedCmd) return;

    this.inputEl.value = `/${selectedCmd.name} `;
    this.inputEl.focus();
    this.handleInputChange(this.inputEl.value);
  }

  /**
   * Clic en dehors de la fenêtre pour fermer
   */
  private handleOutsideClick = (e: MouseEvent): void => {
    if (!this.isOpen) return;

    const target = e.target as Node;
    if (
      this.chatRoot &&
      !this.chatRoot.contains(target) &&
      this.toggleBtn &&
      !this.toggleBtn.contains(target)
    ) {
      this.close();
    }
  };

  /**
   * Envoi du message saisi ou exécution locale
   */
  private submitMessage(): void {
    if (!this.inputEl) return;
    const text = this.inputEl.value.trim();

    if (text.length > 0) {
      // Commande client locale /clear
      if (text.toLowerCase() === '/clear' || text.toLowerCase() === '/cls') {
        this.messages = [];
        this.renderAllMessages();
        this.addLocalSystemNotice('🧹 Historique du chat local effacé.');
        this.inputEl.value = '';
        this.hideSuggestions();
        this.close();
        return;
      }

      this.options.onSendMessage(text);
      this.inputEl.value = '';
    }

    this.hideSuggestions();
    this.close();
  }

  /**
   * Ajoute une petite notification système locale (non transmise au serveur)
   */
  public addLocalSystemNotice(text: string): void {
    this.addMessage({
      id: `local-${Date.now()}`,
      senderId: 'system',
      senderName: 'Système',
      text,
      timestamp: Date.now(),
      isSystem: true
    });
  }

  /**
   * Ouvre la fenêtre de chat
   */
  public open(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    this.openTimestamp = Date.now();

    if (this.chatRoot) {
      this.chatRoot.classList.remove('chat-closed');
      this.chatRoot.classList.add('chat-open');
    }

    this.unreadCount = 0;
    this.updateUnreadBadge();
    this.renderAllMessages();

    setTimeout(() => {
      if (this.inputEl) {
        this.inputEl.focus();
      }
    }, 50);
  }

  /**
   * Ferme la fenêtre de chat
   */
  public close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;

    if (this.chatRoot) {
      this.chatRoot.classList.remove('chat-open');
      this.chatRoot.classList.add('chat-closed');
    }

    if (this.inputEl) {
      this.inputEl.blur();
    }

    this.hideSuggestions();
    this.renderFloatingMessages();
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Réception d'un message réseau
   */
  public addMessage(msg: ChatMessagePayload): void {
    this.messages.push(msg);

    if (this.isOpen) {
      this.appendMessageElement(msg, false);
      this.scrollToBottom();
    } else {
      this.appendMessageElement(msg, true);
      this.unreadCount++;
      this.updateUnreadBadge();
    }
  }

  /**
   * Affiche l'historique complet (mode ouvert)
   */
  private renderAllMessages(): void {
    if (!this.messagesList) return;
    this.messagesList.innerHTML = '';

    this.messages.forEach(msg => {
      this.appendMessageElement(msg, false);
    });

    this.scrollToBottom();
  }

  /**
   * N'affiche que les messages reçus il y a moins de 15s (mode fermé)
   */
  private renderFloatingMessages(): void {
    if (!this.messagesList) return;
    this.messagesList.innerHTML = '';

    const now = Date.now();
    const recentMessages = this.messages.filter(m => (now - m.timestamp) < 15000);

    recentMessages.forEach(msg => {
      this.appendMessageElement(msg, true);
    });

    this.scrollToBottom();
  }

  /**
   * Nettoie les messages flottants qui ont dépassé les 15 secondes
   */
  private cleanupExpiredFloatingMessages(): void {
    if (!this.messagesList || this.isOpen) return;

    const now = Date.now();
    const messageNodes = this.messagesList.querySelectorAll('.chat-msg-row');

    messageNodes.forEach(node => {
      const ts = Number(node.getAttribute('data-timestamp') || 0);
      const elapsed = now - ts;

      if (elapsed >= 15000) {
        node.remove();
      } else if (elapsed >= 14000) {
        node.classList.add('chat-msg-fading');
      }
    });
  }

  /**
   * Crée un élément DOM pour un message avec palette blanc cassé et gris
   */
  private appendMessageElement(msg: ChatMessagePayload, isFloating: boolean): void {
    if (!this.messagesList) return;

    const row = document.createElement('div');
    row.className = `chat-msg-row ${isFloating ? 'chat-msg-floating' : ''}`;
    row.setAttribute('data-timestamp', msg.timestamp.toString());

    const isMe = msg.senderId === this.options.getLocalPlayerId();
    let nameColor = '#f8fafc'; // Blanc cassé par défaut
    let roleTag = '';

    if (msg.isSystem) {
      nameColor = '#fef08a'; // Or doux pour le système
      roleTag = '[Système]';
    } else if (msg.senderRole === PlayerRole.HUNTER) {
      nameColor = '#93c5fd'; // Bleu glacier doux
      roleTag = isMe ? '[Chasseur - Moi]' : '[Chasseur]';
    } else if (msg.senderRole === PlayerRole.PROP) {
      nameColor = '#86efac'; // Vert menthe doux
      roleTag = isMe ? '[Prop - Moi]' : '[Prop]';
    } else {
      roleTag = isMe ? '[Moi]' : '';
    }

    const timeStr = this.formatTime(msg.timestamp);
    const escapedText = this.escapeHtml(msg.text);
    const displayName = this.escapeHtml(msg.senderName);

    row.innerHTML = `
      <span class="chat-msg-time">${timeStr}</span>
      <span class="chat-msg-sender" style="color: ${nameColor}; font-weight: 700;">
        ${roleTag ? `${roleTag} ` : ''}${displayName}:
      </span>
      <span class="chat-msg-content">${escapedText}</span>
    `;

    this.messagesList.appendChild(row);
  }

  private updateUnreadBadge(): void {
    if (!this.unreadBadge) return;

    if (this.unreadCount > 0 && !this.isOpen) {
      this.unreadBadge.style.display = 'block';
    } else {
      this.unreadBadge.style.display = 'none';
    }
  }

  private scrollToBottom(): void {
    if (this.messagesList) {
      this.messagesList.scrollTop = this.messagesList.scrollHeight;
    }
  }

  private formatTime(timestamp: number): string {
    const d = new Date(timestamp);
    const h = d.getHours().toString().padStart(2, '0');
    const m = d.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Injection des styles CSS : Gris semi-opaque, blanc cassé, zéro néon bleu
   */
  private injectStyles(): void {
    if (document.getElementById('chat-custom-styles')) {
      const existing = document.getElementById('chat-custom-styles');
      existing?.remove();
    }

    const styleEl = document.createElement('style');
    styleEl.id = 'chat-custom-styles';
    styleEl.textContent = `
      /* Bouton Bulle en haut à gauche (Gris semi-opaque & blanc cassé) */
      .btn-chat-toggle {
        position: absolute;
        top: 20px;
        left: 135px;
        z-index: 25;
        width: 42px;
        height: 42px;
        background: rgba(20, 24, 35, 0.85);
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s ease;
        box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      }
      .btn-chat-toggle:hover {
        background: rgba(35, 42, 58, 0.95);
        border-color: rgba(255, 255, 255, 0.45);
        color: #ffffff;
        transform: translateY(-1px);
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
      }
      .chat-unread-badge {
        position: absolute;
        top: -3px;
        right: -3px;
        width: 10px;
        height: 10px;
        background: #f8fafc;
        border-radius: 50%;
        box-shadow: 0 0 6px rgba(255, 255, 255, 0.85);
      }

      /* Racine du conteneur de chat */
      .chat-root {
        position: absolute;
        top: 75px;
        left: 20px;
        width: 410px;
        max-width: 88vw;
        z-index: 25;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px;
        line-height: 1.45;
        user-select: text;
        transition: all 0.2s ease;
      }

      /* MODE FERMÉ : Pas de cadre, clics à travers */
      .chat-closed {
        pointer-events: none;
      }
      .chat-closed .chat-frame {
        background: transparent;
        border: none;
        box-shadow: none;
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
      }
      .chat-closed .chat-header,
      .chat-closed .chat-suggestions-box,
      .chat-closed .chat-input-wrapper {
        display: none !important;
      }
      .chat-closed .chat-messages-list {
        max-height: 220px;
        overflow: hidden;
      }

      /* MODE OUVERT : Cadre rectangulaire flottant gris semi-opaque */
      .chat-open {
        pointer-events: auto;
      }
      .chat-open .chat-frame {
        background: rgba(18, 22, 32, 0.88);
        backdrop-filter: blur(12px);
        -webkit-backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 10px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .chat-open .chat-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: rgba(255, 255, 255, 0.04);
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .chat-open .chat-messages-list {
        max-height: 230px;
        height: 230px;
        overflow-y: auto;
      }

      /* Header */
      .chat-title {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .chat-tag {
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.8px;
        color: #f8fafc;
        background: rgba(255, 255, 255, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 2px 6px;
        border-radius: 4px;
      }
      .chat-hint {
        font-size: 11px;
        color: #94a3b8;
      }
      .chat-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        cursor: pointer;
        font-size: 14px;
        padding: 2px 6px;
        border-radius: 4px;
        transition: all 0.15s;
      }
      .chat-close-btn:hover {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.14);
      }

      /* Liste des messages */
      .chat-messages-list {
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 10px 12px;
      }

      .chat-messages-list::-webkit-scrollbar {
        width: 5px;
      }
      .chat-messages-list::-webkit-scrollbar-track {
        background: rgba(0, 0, 0, 0.15);
      }
      .chat-messages-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.22);
        border-radius: 3px;
      }
      .chat-messages-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.38);
      }

      /* Ligne de message individuel */
      .chat-msg-row {
        word-break: break-word;
        color: #f8fafc; /* Blanc cassé */
        text-shadow: 0 1px 3px rgba(0,0,0,0.85);
        transition: opacity 0.5s ease-out, transform 0.2s ease-out;
      }

      /* Message flottant (chat fermé) : petit badge gris semi-opaque élégant */
      .chat-msg-floating {
        background: rgba(20, 24, 35, 0.82);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        padding: 4px 8px;
        border-radius: 5px;
        align-self: flex-start;
        border-left: 2.5px solid rgba(255, 255, 255, 0.45);
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
      }
      .chat-msg-fading {
        opacity: 0;
        transform: translateY(-3px);
      }

      .chat-msg-time {
        font-size: 10px;
        color: #94a3b8;
        margin-right: 4px;
      }
      .chat-msg-sender {
        margin-right: 5px;
      }
      .chat-msg-content {
        color: #f8fafc;
      }

      /* Boîte de suggestions / autocomplétion des commandes */
      .chat-suggestions-box {
        background: rgba(16, 20, 30, 0.96);
        border-top: 1px solid rgba(255, 255, 255, 0.14);
        border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        max-height: 155px;
        overflow-y: auto;
        padding: 4px 0;
      }
      .chat-suggestions-title {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        color: #94a3b8;
        padding: 4px 10px;
        font-weight: 700;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      }
      .chat-suggestion-item {
        padding: 6px 10px;
        cursor: pointer;
        display: flex;
        flex-direction: column;
        gap: 2px;
        transition: background 0.15s;
        border-left: 2px solid transparent;
      }
      .chat-suggestion-item:hover,
      .chat-suggestion-item.selected {
        background: rgba(255, 255, 255, 0.12);
        border-left-color: #ffffff;
      }
      .chat-sug-header {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .chat-sug-name {
        font-weight: 800;
        font-size: 12px;
        color: #ffffff;
        font-family: monospace;
      }
      .chat-sug-syntax {
        font-size: 11px;
        color: #cbd5e1;
        font-family: monospace;
      }
      .chat-sug-desc {
        font-size: 11px;
        color: #94a3b8;
      }
      .chat-sug-ex {
        color: #f8fafc;
        font-style: italic;
      }

      /* Zone de saisie (Input) */
      .chat-input-wrapper {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 10px;
        background: rgba(14, 18, 26, 0.95);
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }
      .chat-input {
        flex: 1;
        background: rgba(255, 255, 255, 0.07);
        border: 1px solid rgba(255, 255, 255, 0.18);
        color: #f8fafc;
        font-size: 13px;
        padding: 7px 10px;
        border-radius: 6px;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
      }
      .chat-input:focus {
        border-color: #ffffff;
        box-shadow: 0 0 10px rgba(255, 255, 255, 0.25);
        background: rgba(255, 255, 255, 0.12);
      }
      .chat-input::placeholder {
        color: #94a3b8;
      }
      .chat-send-btn {
        background: rgba(255, 255, 255, 0.15);
        color: #f8fafc;
        border: 1px solid rgba(255, 255, 255, 0.25);
        font-weight: bold;
        font-size: 12px;
        padding: 7px 12px;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .chat-send-btn:hover {
        background: rgba(255, 255, 255, 0.28);
        color: #ffffff;
        border-color: #ffffff;
      }
    `;

    document.head.appendChild(styleEl);
  }

  /**
   * Nettoyage lors de la destruction de la vue
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    document.removeEventListener('mousedown', this.handleOutsideClick);

    if (this.toggleBtn) {
      this.toggleBtn.remove();
      this.toggleBtn = null;
    }

    if (this.chatRoot) {
      this.chatRoot.remove();
      this.chatRoot = null;
    }
  }
}
