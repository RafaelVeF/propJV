import {
  type ChatMessagePayload,
  PlayerRole,
  CHAT_COMMANDS,
  type ChatCommandDefinition
} from '@prop-hunt/shared';

export interface ChatManagerOptions {
  onSendMessage: (text: string) => void;
  getLocalPlayerId: () => string | null;
}

export class ChatManager {
  private isOpen: boolean = false;
  private messages: ChatMessagePayload[] = [];
  private options: ChatManagerOptions;
  private unreadCount: number = 0;

  private currentSuggestions: ChatCommandDefinition[] = [];
  private selectedSuggestionIndex: number = 0;

  private chatRoot: HTMLElement | null = null;
  private messagesList: HTMLElement | null = null;
  private suggestionsBox: HTMLElement | null = null;
  private inputEl: HTMLInputElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private unreadBadge: HTMLElement | null = null;

  private cleanupInterval: number | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null;

  constructor(options: ChatManagerOptions) {
    this.options = options;
  }

  public mount(parentEl: HTMLElement): void {
    this.destroy();

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.id = 'chat-toggle-btn';
    this.toggleBtn.className = 'hud-panel btn-chat-toggle';
    this.toggleBtn.title = 'Ouvrir le chat [T]';
    this.toggleBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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

    this.chatRoot = document.createElement('div');
    this.chatRoot.id = 'in-game-chat';
    this.chatRoot.className = 'chat-root chat-closed';
    this.chatRoot.innerHTML = `
      <div class="hud-panel chat-frame" id="chat-frame">
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
          <input type="text" id="chat-input" class="chat-input" placeholder="Message... (/ pour les commandes)" maxlength="200" autocomplete="off" />
          <button id="chat-send-btn" class="chat-send-btn" title="Envoyer">ENVOYER</button>
        </div>
      </div>
    `;

    parentEl.appendChild(this.chatRoot);

    this.messagesList = this.chatRoot.querySelector('#chat-messages-list');
    this.suggestionsBox = this.chatRoot.querySelector('#chat-suggestions-box');
    this.inputEl = this.chatRoot.querySelector('#chat-input') as HTMLInputElement;

    const closeBtn = this.chatRoot.querySelector('#chat-close-btn');
    closeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.close();
    });

    const sendBtn = this.chatRoot.querySelector('#chat-send-btn');
    sendBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.submitMessage();
    });

    if (this.inputEl) {
      this.inputEl.addEventListener('input', () => {
        this.handleInputChange(this.inputEl!.value);
      });

      this.inputEl.addEventListener('keydown', (e) => {
        e.stopPropagation();

        if (this.isSuggestionsBoxVisible() && this.currentSuggestions.length > 0) {
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            this.selectedSuggestionIndex =
              (this.selectedSuggestionIndex - 1 + this.currentSuggestions.length) % this.currentSuggestions.length;
            this.updateSuggestionsHighlight();
            return;
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            this.selectedSuggestionIndex =
              (this.selectedSuggestionIndex + 1) % this.currentSuggestions.length;
            this.updateSuggestionsHighlight();
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            this.applySuggestion(this.currentSuggestions[this.selectedSuggestionIndex]);
            return;
          }
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          const val = this.inputEl!.value.trim();
          if (this.isSuggestionsBoxVisible() && this.currentSuggestions.length > 0 && val.startsWith('/') && !val.includes(' ')) {
            const picked = this.currentSuggestions[this.selectedSuggestionIndex];
            if (val.slice(1).toLowerCase() !== picked.name) {
              this.applySuggestion(picked);
              return;
            }
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

        if (e.key.toLowerCase() === 't' && this.inputEl!.value.length === 0) {
          e.preventDefault();
          this.close();
        }
      });
    }

    this.outsideClickHandler = (e: MouseEvent) => {
      if (!this.isOpen) return;
      const target = e.target as Node;
      if (this.chatRoot?.contains(target) || this.toggleBtn?.contains(target)) return;
      this.close();
    };
    window.addEventListener('mousedown', this.outsideClickHandler);

    this.cleanupInterval = window.setInterval(() => {
      if (!this.isOpen) this.renderMessages();
    }, 1000);

    this.renderMessages();
  }

  public destroy(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.outsideClickHandler) {
      window.removeEventListener('mousedown', this.outsideClickHandler);
      this.outsideClickHandler = null;
    }
    this.chatRoot?.remove();
    this.toggleBtn?.remove();
    this.chatRoot = null;
    this.toggleBtn = null;
    this.messagesList = null;
    this.suggestionsBox = null;
    this.inputEl = null;
    this.unreadBadge = null;
    this.isOpen = false;
  }

  public clearMessages(): void {
    this.messages = [];
    this.unreadCount = 0;
    this.updateUnreadBadge();
    this.renderMessages();
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public open(): void {
    if (this.isOpen || !this.chatRoot) return;
    this.isOpen = true;
    this.unreadCount = 0;
    this.updateUnreadBadge();
    this.chatRoot.classList.remove('chat-closed');
    this.chatRoot.classList.add('chat-open');
    this.toggleBtn?.classList.add('active');
    this.renderMessages();
    setTimeout(() => {
      this.inputEl?.focus();
      if (this.messagesList) {
        this.messagesList.scrollTop = this.messagesList.scrollHeight;
      }
    }, 20);
  }

  public close(): void {
    if (!this.isOpen || !this.chatRoot) return;
    this.isOpen = false;
    this.hideSuggestions();
    this.chatRoot.classList.remove('chat-open');
    this.chatRoot.classList.add('chat-closed');
    this.toggleBtn?.classList.remove('active');
    this.inputEl?.blur();
    this.renderMessages();
  }

  public toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  public addMessage(msg: ChatMessagePayload): void {
    this.messages.push(msg);
    if (this.messages.length > 100) {
      this.messages.shift();
    }
    if (!this.isOpen) {
      this.unreadCount++;
      this.updateUnreadBadge();
    }
    this.renderMessages();
  }

  private submitMessage(): void {
    if (!this.inputEl) return;
    const text = this.inputEl.value.trim();
    if (!text) return;

    if (text.toLowerCase() === '/clear' || text.toLowerCase() === '/cls' || text.toLowerCase() === '/clean') {
      this.clearMessages();
      this.inputEl.value = '';
      this.hideSuggestions();
      return;
    }

    this.options.onSendMessage(text);
    this.inputEl.value = '';
    this.hideSuggestions();
  }

  private handleInputChange(value: string): void {
    if (!value.startsWith('/') || value.includes(' ')) {
      this.hideSuggestions();
      return;
    }

    const query = value.slice(1).toLowerCase();
    const matches = CHAT_COMMANDS.filter(cmd =>
      cmd.name.includes(query) || cmd.aliases?.some(a => a.includes(query))
    );

    if (matches.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.currentSuggestions = matches;
    this.selectedSuggestionIndex = 0;
    this.renderSuggestions();
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

  private renderSuggestions(): void {
    if (!this.suggestionsBox) return;
    this.suggestionsBox.innerHTML = this.currentSuggestions
      .map((cmd, idx) => `
        <div class="chat-suggestion-item ${idx === this.selectedSuggestionIndex ? 'selected' : ''}" data-index="${idx}">
          <div class="chat-suggestion-main">
            <span class="chat-suggestion-name">/${cmd.name}</span>
            <span class="chat-suggestion-syntax">${this.escapeHtml(cmd.syntax)}</span>
          </div>
          <div class="chat-suggestion-desc">${this.escapeHtml(cmd.description)}</div>
        </div>
      `)
      .join('');

    this.suggestionsBox.querySelectorAll('.chat-suggestion-item').forEach((el) => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const index = Number((el as HTMLElement).dataset.index);
        if (this.currentSuggestions[index]) {
          this.applySuggestion(this.currentSuggestions[index]);
        }
      });
    });

    this.suggestionsBox.style.display = 'flex';
  }

  private updateSuggestionsHighlight(): void {
    if (!this.suggestionsBox) return;
    this.suggestionsBox.querySelectorAll('.chat-suggestion-item').forEach((el, idx) => {
      el.classList.toggle('selected', idx === this.selectedSuggestionIndex);
    });
  }

  private applySuggestion(cmd: ChatCommandDefinition): void {
    if (!this.inputEl) return;
    const needsArg = cmd.syntax.includes('<') || cmd.syntax.includes('[');
    this.inputEl.value = needsArg ? `/${cmd.name} ` : `/${cmd.name}`;
    this.inputEl.focus();
    this.hideSuggestions();
  }

  private updateUnreadBadge(): void {
    if (!this.unreadBadge) return;
    this.unreadBadge.style.display = this.unreadCount > 0 ? 'block' : 'none';
  }

  private renderMessages(): void {
    if (!this.messagesList) return;
    const now = Date.now();
    const localId = this.options.getLocalPlayerId();

    const visible = this.isOpen
      ? this.messages
      : this.messages.filter(m => now - m.timestamp < 12000).slice(-6);

    this.messagesList.innerHTML = visible.map(msg => {
      if (msg.isSystem) {
        return `<div class="chat-msg chat-msg-system"><span class="chat-msg-text">${this.escapeHtml(msg.text)}</span></div>`;
      }

      const isSelf = localId !== null && msg.senderId === localId;
      const roleClass = isSelf
        ? 'chat-sender-self'
        : msg.senderRole === PlayerRole.HUNTER
          ? 'chat-sender-hunter'
          : msg.senderRole === PlayerRole.PROP
            ? 'chat-sender-prop'
            : 'chat-sender-default';

      return `
        <div class="chat-msg">
          <span class="chat-msg-sender ${roleClass}">${this.escapeHtml(msg.senderName)}</span>
          <span class="chat-msg-sep">:</span>
          <span class="chat-msg-text">${this.escapeHtml(msg.text)}</span>
        </div>
      `;
    }).join('');

    if (this.isOpen) {
      this.messagesList.scrollTop = this.messagesList.scrollHeight;
    }
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

