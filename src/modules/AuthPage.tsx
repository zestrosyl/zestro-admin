import React, { useState } from 'react';
import { KeyRound, Loader2, Mail, ShieldCheck } from 'lucide-react';
import { ADMIN_API_BASE } from '../services/liveApi';

type AuthMode = 'sign-in' | 'forgot';

async function authRequest<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${ADMIN_API_BASE}/api/auth${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'message' in data
      ? String((data as { message: unknown }).message)
      : 'Unable to complete the authentication request.';
    throw new Error(message);
  }
  return data as T;
}

export const AuthPage: React.FC<{ onAuthenticated: () => void }> = ({ onAuthenticated }) => {
  const [mode, setMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'sign-in') {
        await authRequest('/sign-in/email', { email: email.trim().toLowerCase(), password });
        onAuthenticated();
      } else {
        await authRequest('/request-password-reset', {
          email: email.trim().toLowerCase(),
          redirectTo: `${window.location.origin}/reset-password`,
        });
        setNotice('If an account exists for that email, a password reset link has been sent.');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Authentication failed. Please retry.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-10 text-[#111111]">
      <section className="w-full max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-7 shadow-sm sm:p-9">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#16A34A]">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#16A34A]">ZESTRO Admin</p>
        <h1 className="mt-2 text-center text-2xl font-bold tracking-tight">
          {mode === 'sign-in' ? 'Welcome back' : 'Reset your password'}
        </h1>
        <p className="mt-2 text-center text-sm text-neutral-500">
          {mode === 'sign-in'
            ? 'Sign in with the email address invited by your restaurant owner.'
            : 'Enter your account email and we will send a reset link when an account is eligible.'}
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-neutral-600">Email address</span>
            <span className="relative block">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-emerald-100"
                placeholder="you@restaurant.com"
              />
            </span>
          </label>

          {mode === 'sign-in' && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-600">Password</span>
              <span className="relative block">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-xl border border-[#E5E7EB] bg-white py-3 pl-10 pr-3 text-sm outline-none transition focus:border-[#16A34A] focus:ring-2 focus:ring-emerald-100"
                  placeholder="At least 12 characters"
                />
              </span>
            </label>
          )}

          {error && <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
          {notice && <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-3 text-sm text-emerald-700">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'sign-in' ? 'Sign in securely' : 'Send password reset link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            type="button"
            onClick={() => { setMode(mode === 'sign-in' ? 'forgot' : 'sign-in'); setError(''); setNotice(''); }}
            className="text-sm font-medium text-[#15803D] hover:underline"
          >
            {mode === 'sign-in' ? 'Forgot password?' : 'Back to sign in'}
          </button>
        </div>
        <p className="mt-8 border-t border-[#E5E7EB] pt-5 text-center text-xs leading-5 text-neutral-400">
          Access is limited to invited team members. Contact your restaurant owner if you need an invitation.
        </p>
      </section>
    </main>
  );
};


export const ResetPasswordPage: React.FC = () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token) { setError('This password reset link is invalid or incomplete.'); return; }
    if (password.length < 12) { setError('Use at least 12 characters for your new password.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await authRequest('/reset-password', { token, newPassword: password });
      setDone(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The reset link may have expired. Request a new one.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-10 text-[#111111]">
      <section className="w-full max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-7 shadow-sm sm:p-9">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#16A34A]">
          <KeyRound className="h-7 w-7" />
        </div>
        <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#16A34A]">ZESTRO Admin</p>
        <h1 className="mt-2 text-center text-2xl font-bold tracking-tight">Create a new password</h1>
        {done ? (
          <div className="mt-6 text-center">
            <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              Your password has been updated. Sign in with your new password.
            </p>
            <a href="/" className="mt-5 inline-flex rounded-xl bg-[#16A34A] px-5 py-3 text-sm font-semibold text-white">
              Return to sign in
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-4">
            {!token && <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">This password reset link is invalid or incomplete.</p>}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-600">New password</span>
              <input type="password" autoComplete="new-password" required minLength={12} value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-emerald-100"
                placeholder="At least 12 characters" />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-neutral-600">Confirm new password</span>
              <input type="password" autoComplete="new-password" required minLength={12} value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-3 text-sm outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-emerald-100"
                placeholder="Enter the password again" />
            </label>
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
            <button type="submit" disabled={busy || !token}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Update password
            </button>
          </form>
        )}
        <p className="mt-7 border-t border-[#E5E7EB] pt-5 text-center text-xs text-neutral-400">
          Password reset links can only be used once and expire automatically.
        </p>
      </section>
    </main>
  );
};


export const AcceptInvitationPage: React.FC = () => {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [name,setName] = useState('');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);
  const [error,setError] = useState('');
  React.useEffect(() => {
    if (!token) { setError('This invitation link is incomplete.'); return; }
    authRequest<{name:string;email:string}>(`/invitation-preview?token=${encodeURIComponent(token)}`)
      .then((data) => { setName(data.name); setEmail(data.email); })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Invitation is invalid or expired.'));
  }, [token]);
  const submit = async (event:React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password.length<12 || password.length>128) { setError('Use a password between 12 and 128 characters.'); return; }
    if (password!==confirm) { setError('Passwords do not match.'); return; }
    setBusy(true);setError('');
    try {
      await authRequest('/accept-invitation',{token,password});
      setDone(true);
    } catch(cause) { setError(cause instanceof Error?cause.message:'Unable to accept invitation. Please retry.'); }
    finally { setBusy(false); }
  };
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#F5F5F5] px-4 py-10 text-[#111111]">
      <section className="w-full max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-7 shadow-sm sm:p-9">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-[#16A34A]"><ShieldCheck className="h-7 w-7" /></div>
        <p className="mt-5 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#16A34A]">ZESTRO Admin</p>
        <h1 className="mt-2 text-center text-2xl font-bold tracking-tight">Accept your invitation</h1>
        {done ? (
          <div className="mt-7 text-center">
            <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Your account is ready. Sign in to open your restaurant workspace.</p>
            <a href="/" className="mt-5 inline-flex rounded-xl bg-[#16A34A] px-5 py-3 text-sm font-semibold text-white">Go to sign in</a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-neutral-600">Name</span><input readOnly value={name} className="w-full rounded-xl border border-[#E5E7EB] bg-neutral-50 px-3.5 py-3 text-sm" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-neutral-600">Invited email</span><input readOnly value={email} className="w-full rounded-xl border border-[#E5E7EB] bg-neutral-50 px-3.5 py-3 text-sm" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-neutral-600">Create password</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-3 text-sm" placeholder="At least 12 characters" /></label>
            <label className="block"><span className="mb-1.5 block text-xs font-semibold text-neutral-600">Confirm password</span><input type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)} className="w-full rounded-xl border border-[#E5E7EB] px-3.5 py-3 text-sm" placeholder="Repeat your password" /></label>
            {error && <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-3 text-sm text-rose-700">{error}</p>}
            <button type="submit" disabled={busy||!email} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#16A34A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy&&<Loader2 className="h-4 w-4 animate-spin" />}Create account</button>
          </form>
        )}
        <p className="mt-7 border-t border-[#E5E7EB] pt-5 text-center text-xs text-neutral-400">Invitation links are single-use and expire automatically.</p>
      </section>
    </main>
  );
};
