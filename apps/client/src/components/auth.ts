import type { AuthUser } from '@prop-hunt/shared';
import {
  AuthServiceError,
  fetchCurrentUser,
  getSession,
  login,
  logout,
  onAuthChange,
  register,
} from '../services/authService';
import { switchView } from './viewManager';

type AuthMode = 'login' | 'register';
type AlertKind = 'error' | 'success' | 'info';
const EMAIL_PATTERN = /^[^@\s]+@[^@\s_.-]+(?:\.[^@\s_.-]+)+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,30}$/;

function renderAuthStatus(user: AuthUser | null): string {
  if (!user) {
    return 'CONNEXION';
  }
  return user.username;
}

/** Modale d'authentification : connexion et inscription. */
export function renderAuth(): string {
  return `
    <!-- Vue : Authentification -->
    <div id="view-auth" class="view modal-view auth-modal hidden">
      <h2 class="view-title blue-text">AUTHENTIFICATION</h2>
      <p class="auth-subtitle">Connectez-vous pour suivre vos statistiques et retrouver vos amis.</p>

      <div class="auth-tabs" role="tablist" aria-label="Mode d'authentification">
        <button type="button" class="auth-tab active" data-auth-mode="login" role="tab" aria-selected="true">
          CONNEXION
        </button>
        <button type="button" class="auth-tab" data-auth-mode="register" role="tab" aria-selected="false">
          INSCRIPTION
        </button>
      </div>

      <div id="auth-alert" class="auth-alert" role="alert" aria-live="polite"></div>

      <form id="auth-form-login" class="auth-form" novalidate>
        <div class="join-container">
          <label class="input-label" for="auth-login-username">PSEUDO</label>
          <input
            class="input-field"
            id="auth-login-username"
            name="username"
            type="text"
            autocomplete="username"
            maxlength="30"
            placeholder="Votre pseudo"
          />
        </div>
        <div class="join-container">
          <label class="input-label" for="auth-login-password">MOT DE PASSE</label>
          <div class="auth-password-field">
            <input
              class="input-field"
              id="auth-login-password"
              name="password"
              type="password"
              autocomplete="current-password"
              maxlength="100"
              placeholder="••••••••"
            />
            <button type="button" class="auth-password-toggle" aria-controls="auth-login-password" aria-pressed="false">Afficher</button>
          </div>
        </div>
        <button type="submit" class="btn primary auth-submit-btn" id="auth-login-submit">
          SE CONNECTER
        </button>
      </form>

      <form id="auth-form-register" class="auth-form hidden" novalidate>
        <div class="join-container">
          <label class="input-label" for="auth-register-username">PSEUDO</label>
          <input
            class="input-field"
            id="auth-register-username"
            name="username"
            type="text"
            autocomplete="username"
            maxlength="30"
            placeholder="3 à 30 caractères (lettres, chiffres, - et _)"
          />
        </div>
        <div class="join-container">
          <label class="input-label" for="auth-register-email">ADRESSE EMAIL</label>
          <input
            class="input-field"
            id="auth-register-email"
            name="email"
            type="email"
            autocomplete="email"
            maxlength="255"
            placeholder="joueur@exemple.com"
          />
        </div>
        <div class="join-container">
          <label class="input-label" for="auth-register-password">MOT DE PASSE</label>
          <div class="auth-password-field">
            <input
              class="input-field"
              id="auth-register-password"
              name="password"
              type="password"
              autocomplete="new-password"
              maxlength="100"
              placeholder="8 caractères minimum"
            />
            <button type="button" class="auth-password-toggle" aria-controls="auth-register-password" aria-pressed="false">Afficher</button>
          </div>
        </div>
        <div class="join-container">
          <label class="input-label" for="auth-register-confirm">CONFIRMER LE MOT DE PASSE</label>
          <div class="auth-password-field">
            <input
              class="input-field"
              id="auth-register-confirm"
              name="confirmPassword"
              type="password"
              autocomplete="new-password"
              maxlength="100"
              placeholder="Retapez votre mot de passe"
            />
            <button type="button" class="auth-password-toggle" aria-controls="auth-register-confirm" aria-pressed="false">Afficher</button>
          </div>
        </div>
        <button type="submit" class="btn primary auth-submit-btn" id="auth-register-submit">
          CRÉER UN COMPTE
        </button>
      </form>

      <button class="btn back" id="btn-back-main-from-auth">← RETOUR</button>
    </div>
  `;
}

function getInput(id: string): HTMLInputElement | null {
  return document.getElementById(id) as HTMLInputElement | null;
}

function getButton(id: string): HTMLButtonElement | null {
  return document.getElementById(id) as HTMLButtonElement | null;
}

export function initAuth(): void {
  const viewMain = document.getElementById('view-main');
  const viewAuth = document.getElementById('view-auth');
  const viewProfile = document.getElementById('view-profile');
  if (!viewAuth) return;

  const tabs = Array.from(viewAuth.querySelectorAll<HTMLButtonElement>('[data-auth-mode]'));
  const loginForm = document.getElementById('auth-form-login') as HTMLFormElement | null;
  const registerForm = document.getElementById('auth-form-register') as HTMLFormElement | null;
  const alertBox = document.getElementById('auth-alert');
  const loginSubmit = getButton('auth-login-submit');
  const registerSubmit = getButton('auth-register-submit');
  const btnBack = document.getElementById('btn-back-main-from-auth');
  const btnStatus = getButton('btn-auth-status');
  const btnLogout = getButton('btn-auth-logout');
  const statusLabel = document.getElementById('auth-status-label');

  const loginUsername = getInput('auth-login-username');
  const loginPassword = getInput('auth-login-password');
  const registerUsername = getInput('auth-register-username');
  const registerEmail = getInput('auth-register-email');
  const registerPassword = getInput('auth-register-password');
  const registerConfirm = getInput('auth-register-confirm');

  viewAuth.querySelectorAll<HTMLButtonElement>('.auth-password-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const input = getInput(toggle.getAttribute('aria-controls') ?? '');
      if (!input) return;
      const visible = input.type === 'password';
      input.type = visible ? 'text' : 'password';
      toggle.textContent = visible ? 'Masquer' : 'Afficher';
      toggle.setAttribute('aria-pressed', String(visible));
    });
  });

  function setAlert(kind: AlertKind | null, message = ''): void {
    if (!alertBox) return;
    alertBox.className = `auth-alert${kind ? ` ${kind}` : ''}`;
    alertBox.textContent = message;
  }

  function setMode(mode: AuthMode): void {
    tabs.forEach((tab) => {
      const isActive = tab.dataset.authMode === mode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', String(isActive));
    });

    loginForm?.classList.toggle('hidden', mode !== 'login');
    registerForm?.classList.toggle('hidden', mode !== 'register');
    setAlert(null);
  }

  function openAuth(mode: AuthMode): void {
    loginForm?.reset();
    registerForm?.reset();
    setMode(mode);
    switchView(viewMain, viewAuth);

    window.setTimeout(() => {
      const firstField = mode === 'login' ? loginUsername : registerUsername;
      firstField?.focus();
    }, 350);
  }

  function closeAuth(): void {
    setAlert(null);
    switchView(viewAuth, viewMain);
  }

  function setSubmitting(button: HTMLButtonElement | null, pending: boolean, idleLabel: string): void {
    if (!button) return;
    button.disabled = pending;
    button.textContent = pending ? 'PATIENTEZ...' : idleLabel;
  }

  function handleAuthError(error: unknown): void {
    if (error instanceof AuthServiceError) {
      setAlert('error', error.message);
      return;
    }

    console.error('Erreur inattendue lors de l\'authentification :', error);
    setAlert('error', 'Une erreur inattendue est survenue. Réessayez.');
  }

  function updateStatus(user: AuthUser | null): void {
    if (statusLabel) {
      statusLabel.textContent = renderAuthStatus(user);
    }
    if (btnStatus) {
      btnStatus.classList.toggle('is-authenticated', Boolean(user));
      btnStatus.title = user
        ? `Connecté en tant que ${user.username} — ouvrir le profil`
        : 'Se connecter ou créer un compte';
    }
    if (btnLogout) {
      btnLogout.hidden = !user;
    }

    const profileUsername = document.getElementById('profile-display-username');
    if (profileUsername) {
      profileUsername.textContent = user?.username ?? 'Invité';
    }
  }

  function refreshStatus(): void {
    updateStatus(getSession()?.user ?? null);
  }

  // --- Navigation et bascule Connexion / Inscription ---
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.authMode;
      if (mode === 'login' || mode === 'register') {
        setMode(mode);
      }
    });
  });

  btnBack?.addEventListener('click', closeAuth);

  // --- Connexion ---
  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = loginUsername?.value.trim() ?? '';
    const password = loginPassword?.value ?? '';

    if (username.length < 3) {
      setAlert('error', "Le nom d'utilisateur doit contenir au moins 3 caractères.");
      loginUsername?.focus();
      return;
    }
    if (password.length < 8) {
      setAlert('error', 'Le mot de passe doit contenir au moins 8 caractères.');
      loginPassword?.focus();
      return;
    }

    setAlert('info', 'Connexion en cours...');
    setSubmitting(loginSubmit, true, 'SE CONNECTER');

    try {
      const session = await login({ username, password });
      setAlert('success', `Bienvenue ${session.user.username} !`);
      loginForm.reset();
      window.setTimeout(closeAuth, 700);
    } catch (error) {
      handleAuthError(error);
    } finally {
      setSubmitting(loginSubmit, false, 'SE CONNECTER');
    }
  });

  // --- Inscription ---
  registerForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const username = registerUsername?.value.trim() ?? '';
    const email = registerEmail?.value.trim() ?? '';
    const password = registerPassword?.value ?? '';
    const confirmPassword = registerConfirm?.value ?? '';

    if (!USERNAME_PATTERN.test(username)) {
      setAlert(
        'error',
        "Le pseudo doit contenir 3 à 30 caractères (lettres, chiffres, tirets et underscores)."
      );
      registerUsername?.focus();
      return;
    }
    if (!EMAIL_PATTERN.test(email) || email.length > 255) {
      setAlert('error', 'Veuillez saisir une adresse email valide.');
      registerEmail?.focus();
      return;
    }
    if (password.length < 8 || password.length > 100) {
      setAlert('error', 'Le mot de passe doit contenir entre 8 et 100 caractères.');
      registerPassword?.focus();
      return;
    }
    if (password !== confirmPassword) {
      setAlert('error', 'Les mots de passe ne correspondent pas.');
      registerConfirm?.focus();
      return;
    }

    setAlert('info', 'Création du compte en cours...');
    setSubmitting(registerSubmit, true, 'CRÉER UN COMPTE');

    try {
      const session = await register({ username, email, password });
      setAlert('success', `Compte créé avec succès. Bienvenue ${session.user.username} !`);
      registerForm.reset();
      window.setTimeout(closeAuth, 900);
    } catch (error) {
      handleAuthError(error);
    } finally {
      setSubmitting(registerSubmit, false, 'CRÉER UN COMPTE');
    }
  });

  // --- Bouton de statut dans la barre supérieure ---
  btnStatus?.addEventListener('click', () => {
    const session = getSession();
    updateStatus(session?.user ?? null);

    if (session) {
      if (viewProfile) {
        switchView(viewMain, viewProfile);
      }
      return;
    }
    openAuth('login');
  });

  btnLogout?.addEventListener('click', () => {
    if (!getSession()) return;
    if (!window.confirm('Voulez-vous vraiment vous déconnecter ?')) return;

    logout();
  });

  // --- Synchronisation de l'interface avec la session ---
  onAuthChange(() => refreshStatus());
  refreshStatus();

  // Validation silencieuse de la session au démarrage (token expiré ou révoqué).
  void fetchCurrentUser().catch((error) => {
    console.warn('Impossible de rafraîchir la session utilisateur :', error);
  });
}
