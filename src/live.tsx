import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LogOut, Sparkles } from 'lucide-react';
import { api, loginWithAicooUrl, type Me } from './api';

export function useAicooSession() {
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(() => {
    setMe(null);
    api
      .me()
      .then(setMe)
      .catch(() => setMe({ signedIn: false }));
  }, []);

  useEffect(reload, [reload]);
  return { me, reload };
}

export function LoginScreen({ returnTo = '/fights' }: { returnTo?: string }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    new URLSearchParams(window.location.search).get('login_error')
      ? 'Aicoo sign-in did not finish. Please try again.'
      : ''
  );

  async function submitKey() {
    if (!apiKey.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.apiKeyLogin(apiKey.trim());
      window.location.replace(returnTo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Aicoo rejected that key.');
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="poster-mark" aria-hidden="true">
        <span>3</span>
        <small>shields</small>
      </div>
      <section className="login-copy">
        <a className="login-world-link" href="/">← Virtual N1 World</a>
        <p className="kicker">Aicoo arcade · game 01</p>
        <h1>Agent<br />Fights</h1>
        <p className="login-lede">
          Direct your Aicoo agent. Crack three fictional vault codes. Keep your own defender standing.
        </p>
        <a className="aicoo-login" href={loginWithAicooUrl(returnTo)}>
          <Sparkles size={19} />
          Sign in with Aicoo
          <span aria-hidden="true">↗</span>
        </a>
        <p className="consent-copy">
          First entry creates one scoped <strong>Agent Fights</strong> arena folder and a signed-in link.
          Your personal memory stays outside the ring; your display name and generated handle appear in the standings.
        </p>

        <details className="key-fallback">
          <summary>Developer fallback</summary>
          <label htmlFor="api-key">Aicoo API key</label>
          <div>
            <KeyRound size={17} />
            <input
              id="api-key"
              type="password"
              autoComplete="off"
              placeholder="aicoo_sk_…"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && submitKey()}
            />
            <button type="button" disabled={busy || !apiKey.trim()} onClick={submitKey}>
              {busy ? 'Checking…' : 'Enter'}
            </button>
          </div>
        </details>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      <aside className="login-rules" aria-label="Game rules">
        <p>How a fight works</p>
        <ol>
          <li><span>01</span> Give your agent a social-engineering tactic.</li>
          <li><span>02</span> Read the rival defender’s answer for clues.</li>
          <li><span>03</span> Verify an exact code: +1 point, −1 shield.</li>
        </ol>
        <div className="safe-note">
          <strong>Fictional intel only.</strong>
          Passwords, credentials, and personal facts are never valid game targets.
        </div>
      </aside>
    </main>
  );
}

export function SessionChip({ me }: { me: Me }) {
  async function logout() {
    await api.logout().catch(() => undefined);
    window.location.replace('/');
  }

  return (
    <div className="session-chip">
      <span className="online-dot" />
      <span>{me.displayName || me.username || 'Aicoo player'}</span>
      <small>{me.authType === 'oauth' ? 'Aicoo OAuth' : 'API key'}</small>
      <button type="button" aria-label="Sign out" onClick={logout}>
        <LogOut size={15} />
      </button>
    </div>
  );
}
