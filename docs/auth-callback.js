import { createClient } from '@supabase/supabase-js';

const feedback = document.querySelector('#auth-feedback');
const feedbackMessage = document.querySelector('#auth-feedback-message');
const recoveryModal = document.querySelector('#password-recovery-modal');
const recoveryForm = document.querySelector('#password-recovery-form');
const recoveryError = document.querySelector('#password-recovery-error');
const recoverySubmit = document.querySelector('#password-recovery-submit');
const newPasswordInput = document.querySelector('#new-password');
const confirmPasswordInput = document.querySelector('#confirm-new-password');
const queryParams = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const callbackType = queryParams.get('type') || hashParams.get('type') || '';
const callbackError = queryParams.get('error_description') || hashParams.get('error_description');
const hasAuthCallback =
  ['code', 'error', 'error_description', 'token_hash'].some((key) => queryParams.has(key)) ||
  ['access_token', 'refresh_token', 'error', 'error_description', 'token_hash'].some((key) =>
    hashParams.has(key),
  ) ||
  ['signup', 'email', 'recovery'].includes(callbackType);
const invalidLinkMessage =
  'Este link expirou ou é inválido. Solicite uma nova recuperação de senha pelo aplicativo FaderDeck.';
const confirmationMessage =
  'E-mail confirmado com sucesso! Sua conta está ativa — você já pode abrir o aplicativo FaderDeck e entrar para iniciar seu teste grátis de 7 dias.';
const passwordUpdatedMessage =
  'Senha alterada com sucesso! Volte ao aplicativo FaderDeck e entre com sua nova senha.';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

function showAuthFeedback(message, state = 'success') {
  feedbackMessage.textContent = message;
  feedback.dataset.state = state;
  feedback.hidden = false;
}

function clearAuthFeedback() {
  feedback.hidden = true;
  feedbackMessage.textContent = '';
}

function clearAuthCallbackUrl() {
  window.history.replaceState(window.history.state, document.title, window.location.pathname);
}

function showPasswordRecoveryModal() {
  recoveryModal.hidden = false;
  document.body.classList.add('auth-modal-open');
  window.requestAnimationFrame(() => newPasswordInput.focus());
}

function closePasswordRecoveryModal() {
  recoveryModal.hidden = true;
  document.body.classList.remove('auth-modal-open');
  recoveryForm.reset();
  recoveryError.textContent = '';
  recoveryError.hidden = true;
  confirmPasswordInput.setCustomValidity('');
}

function callbackFailureMessage(error) {
  const message = String(error?.message || '').toLowerCase();
  if (/expired|invalid|otp|token|code/.test(message)) return invalidLinkMessage;
  return 'Não foi possível processar o link. Verifique sua conexão e, se necessário, solicite outro pelo aplicativo FaderDeck.';
}

async function processAuthCallback() {
  if (!hasAuthCallback) return;

  if (callbackError || queryParams.has('error') || hashParams.has('error')) {
    clearAuthCallbackUrl();
    showAuthFeedback(invalidLinkMessage, 'error');
    return;
  }

  if (!supabase) {
    clearAuthCallbackUrl();
    showAuthFeedback(
      'A autenticação deste site ainda não está configurada. Entre em contato com o suporte do FaderDeck.',
      'error',
    );
    return;
  }

  try {
    const { error: initializationError } = await supabase.auth.initialize();
    if (initializationError) throw initializationError;

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    clearAuthCallbackUrl();
    if (callbackType === 'recovery') {
      if (!session) throw new Error('Recovery callback did not establish a session.');
      showPasswordRecoveryModal();
    } else if (callbackType === 'signup' || callbackType === 'email') {
      showAuthFeedback(confirmationMessage);
    } else if (!session) {
      throw new Error('Auth callback did not establish a session.');
    }
  } catch (error) {
    clearAuthCallbackUrl();
    if (callbackType === 'recovery') closePasswordRecoveryModal();
    showAuthFeedback(callbackFailureMessage(error), 'error');
  }
}

document.querySelector('#auth-feedback-close').addEventListener('click', clearAuthFeedback);

if (supabase) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showPasswordRecoveryModal();
  });
}

confirmPasswordInput.addEventListener('input', () => {
  confirmPasswordInput.setCustomValidity('');
});

recoveryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (newPasswordInput.value !== confirmPasswordInput.value) {
    confirmPasswordInput.setCustomValidity('As senhas não coincidem.');
    confirmPasswordInput.reportValidity();
    return;
  }

  confirmPasswordInput.setCustomValidity('');
  recoveryError.hidden = true;
  recoverySubmit.disabled = true;
  recoverySubmit.textContent = 'Salvando…';

  try {
    if (!supabase) throw new Error('Supabase Auth is not configured.');
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPasswordInput.value,
    });
    if (updateError) throw updateError;

    const { error: signOutError } = await supabase.auth.signOut();
    closePasswordRecoveryModal();
    if (signOutError) {
      showAuthFeedback(
        'Sua senha foi alterada, mas não foi possível encerrar esta sessão. Feche esta página e entre no aplicativo com sua nova senha.',
        'error',
      );
      return;
    }
    showAuthFeedback(passwordUpdatedMessage);
  } catch (error) {
    recoveryError.textContent = callbackFailureMessage(error);
    recoveryError.hidden = false;
  } finally {
    recoverySubmit.disabled = false;
    recoverySubmit.textContent = 'Salvar nova senha';
  }
});

processAuthCallback();
