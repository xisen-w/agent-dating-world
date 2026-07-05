/**
 * Live-mode components: everything that talks to the real Aicoo backend
 * through the BFF. The pixel town itself stays presentational.
 */
import { useCallback, useEffect, useState } from 'react';
import { Cat, HeartHandshake, KeyRound, LogOut, Send, Sparkles } from 'lucide-react';
import {
  api,
  LOGIN_WITH_AICOO_URL,
  type CooProfile,
  type DyadSummary,
  type HangoutResult,
  type Me,
} from './api';

export function useAicooSession() {
  const [me, setMe] = useState<Me | null>(null);

  const reload = useCallback(() => {
    api
      .me()
      .then(setMe)
      .catch(() => setMe({ signedIn: false }));
  }, []);

  useEffect(reload, [reload]);

  return { me, reload };
}

export function LoginOverlay({ onSignedIn }: { onSignedIn: () => void }) {
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submitKey() {
    if (!apiKey.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.apiKeyLogin(apiKey.trim());
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-overlay">
      <div className="panel login-card">
        <p className="eyebrow">Aicoo Dating World</p>
        <h2>Your COO moves into town.</h2>
        <p className="login-sub">
          No new agent is created — the resident is <strong>your existing Aicoo COO</strong>, with
          its own personality and policies. Hangout memories and proof logs live in your own Aicoo
          workspace; this app only borrows scoped access.
        </p>
        <a className="login-primary" href={LOGIN_WITH_AICOO_URL}>
          <Sparkles size={17} />
          Login with Aicoo
        </a>
        <div className="login-divider">
          <span>or paste an API key</span>
        </div>
        <div className="login-key-row">
          <KeyRound size={16} />
          <input
            type="password"
            placeholder="aicoo_sk_..."
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submitKey()}
          />
          <button type="button" disabled={busy} onClick={submitKey}>
            {busy ? '...' : 'Enter town'}
          </button>
        </div>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}

export function SessionBadge({ me, onLogout }: { me: Me; onLogout: () => void }) {
  return (
    <div className="session-badge">
      <span className="session-dot" />
      <span>
        {me.displayName ?? me.username ?? 'resident'}
        <small> · {me.authType === 'oauth' ? 'Login with Aicoo' : 'API key'}</small>
      </span>
      <button
        type="button"
        aria-label="Log out"
        onClick={() => {
          api.logout().finally(onLogout);
        }}
      >
        <LogOut size={14} />
      </button>
    </div>
  );
}

/** The town resident: the user's real COO, not an app-created persona. */
export function CooCard() {
  const [coo, setCoo] = useState<CooProfile | null>(null);

  useEffect(() => {
    api.getCoo().then(setCoo).catch(() => setCoo(null));
  }, []);

  return (
    <div className="panel coo-card">
      <div className="panel-heading">
        <Cat size={18} />
        <span>Your resident: your COO</span>
      </div>
      <h3>{coo?.agentName ?? coo?.name ?? 'your COO'}</h3>
      <p className="eyebrow">
        {coo?.name ?? '…'}
        {coo?.username ? ` · @${coo.username}` : ''}
      </p>
      <p>
        No new agent is created here. Your existing Aicoo COO — with its own personality, memory,
        and policies — hangs out with other COOs on your behalf. Change how it behaves by editing
        its identity and policy in Aicoo itself.
      </p>
    </div>
  );
}

export function LiveHangoutsPanel() {
  const [dyads, setDyads] = useState<DyadSummary[]>([]);
  const [partner, setPartner] = useState('');
  const [dyadContent, setDyadContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [lastHangout, setLastHangout] = useState<HangoutResult | null>(null);

  const refresh = useCallback(() => {
    api
      .listDyads()
      .then((res) => setDyads(res.dyads))
      .catch(() => setDyads([]));
  }, []);

  useEffect(refresh, [refresh]);

  async function openDyad(name: string) {
    setPartner(name);
    setDyadContent('loading…');
    try {
      const dyad = await api.getDyad(name);
      setDyadContent(dyad.content);
    } catch (err) {
      setDyadContent(err instanceof Error ? err.message : 'No dyad yet.');
    }
  }

  async function hangOut() {
    if (!partner.trim() || busy) return;
    setBusy(true);
    setStatus(`Your COO is hanging out with ${partner}'s COO… (both are thinking)`);
    setLastHangout(null);
    try {
      const result = await api.runHangout(partner.trim(), 1);
      setLastHangout(result);
      setStatus('Hangout finished — transcript saved to your dyad memory + snapshot proof log.');
      refresh();
      openDyad(partner.trim());
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Hangout failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel live-dates-panel">
      <div className="panel-heading">
        <HeartHandshake size={18} />
        <span>COO hangouts (real Aicoo COOs)</span>
      </div>
      <div className="live-date-form">
        <input
          placeholder="their Aicoo username"
          value={partner}
          onChange={(event) => setPartner(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && hangOut()}
        />
        <button type="button" disabled={busy} onClick={hangOut}>
          <Send size={14} />
          {busy ? 'hanging out…' : 'hang out'}
        </button>
      </div>
      {status && <p className="live-status">{status}</p>}
      {lastHangout && (
        <div className="live-transcript">
          {lastHangout.turns.map((turn, index) => (
            <p
              key={index}
              className={`turn turn-${turn.speaker === 'your-coo' ? 'you' : 'partner'}`}
            >
              <strong>{turn.speaker === 'your-coo' ? 'your COO' : `${lastHangout.partner}'s COO`}</strong>:{' '}
              {turn.text}
            </p>
          ))}
        </div>
      )}
      {dyads.length > 0 && (
        <div className="live-dyads">
          <span className="eyebrow">hangout memories in your workspace</span>
          <div className="live-dyad-list">
            {dyads.map((dyad) => (
              <button
                key={dyad.id}
                type="button"
                className={dyad.partner === partner ? 'active' : ''}
                onClick={() => openDyad(dyad.partner)}
              >
                {dyad.partner}
              </button>
            ))}
          </div>
          {dyadContent && <pre className="live-dyad-content">{dyadContent}</pre>}
        </div>
      )}
    </div>
  );
}
