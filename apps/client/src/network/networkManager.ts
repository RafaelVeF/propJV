import { MessageType, type NetworkMessage } from '@prop-hunt/shared';

export type NetworkMessageHandler<T = any> = (payload: T, message: NetworkMessage<T>) => void;

class NetworkManager {
  private socket: WebSocket | null = null;
  private listeners: Map<MessageType, Set<NetworkMessageHandler>> = new Map();
  private openListeners: Set<() => void> = new Set();
  private closeListeners: Set<() => void> = new Set();

  public localPlayerId: string | null = null;
  public isConnected: boolean = false;

  constructor() {
    this.connect();
  }

  public connect(url: string = 'ws://localhost:8080'): void {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        console.log('[NetworkManager] Connecté au serveur de jeu WebSocket');
        this.isConnected = true;
        this.openListeners.forEach(listener => listener());
      };

      this.socket.onmessage = (event) => {
        try {
          const message: NetworkMessage = JSON.parse(event.data);

          // Enregistrement automatique de l'ID du joueur local lors du WELCOME
          if (message.type === MessageType.WELCOME && message.payload?.player?.id) {
            this.localPlayerId = message.payload.player.id;
          }

          // Notification des abonnés à ce type de message
          const handlers = this.listeners.get(message.type);
          if (handlers) {
            handlers.forEach(handler => handler(message.payload, message));
          }
        } catch (err) {
          console.error('[NetworkManager] Erreur lors de la lecture du message :', err);
        }
      };

      this.socket.onclose = () => {
        console.warn('[NetworkManager] Déconnecté du serveur de jeu');
        this.isConnected = false;
        this.closeListeners.forEach(listener => listener());

        // Tentative de reconnexion automatique après 2 secondes
        setTimeout(() => {
          if (!this.isConnected) {
            this.connect(url);
          }
        }, 2000);
      };

      this.socket.onerror = (err) => {
        console.error('[NetworkManager] Erreur WebSocket :', err);
      };
    } catch (err) {
      console.error('[NetworkManager] Impossible d\'initialiser le WebSocket :', err);
    }
  }

  public send<T = any>(type: MessageType, payload: T): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('[NetworkManager] Impossible d\'envoyer le message, socket non connecté :', type);
      return;
    }

    const message: NetworkMessage<T> = {
      type,
      payload,
      timestamp: Date.now()
    };

    this.socket.send(JSON.stringify(message));
  }

  public on<T = any>(type: MessageType, handler: NetworkMessageHandler<T>): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(handler as NetworkMessageHandler);

    return () => this.off(type, handler);
  }

  public off<T = any>(type: MessageType, handler: NetworkMessageHandler<T>): void {
    const handlers = this.listeners.get(type);
    if (handlers) {
      handlers.delete(handler as NetworkMessageHandler);
    }
  }

  public onOpen(listener: () => void): () => void {
    this.openListeners.add(listener);
    if (this.isConnected) listener();
    return () => this.openListeners.delete(listener);
  }

  public onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }
}

export const networkManager = new NetworkManager();
