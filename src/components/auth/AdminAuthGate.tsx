import React, { useEffect, useState } from 'react';
import { Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Session } from '@supabase/supabase-js';

type AuthMode = 'signin' | 'signup' | 'forgot' | 'reset';

function AuthCard({ mode, setMode }: { mode: AuthMode; setMode: (mode: AuthMode) => void }) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      if (mode === 'signin') {
        const result = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
        if (result.error) throw result.error;
      } else if (mode === 'signup') {
        const result = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { emailRedirectTo: window.location.origin, data: { full_name: name.trim() } } });
        if (result.error) throw result.error;
        if (!result.data.session) { setNotice('Account created. Confirm your email, then return and sign in. A Supabase account alone does not grant staff access.'); setMode('signin'); setPassword(''); return; }
      } else if (mode === 'forgot') {
        const result = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: window.location.origin + '/?recovery=1' });
        if (result.error) throw result.error;
        setNotice('Password reset email sent. Open the link on this device to choose a new password.'); setMode('signin');
      } else {
        if (password.length < 8) throw new Error('Password must be at least 8 characters.');
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw result.error;
        const url = new URL(window.location.href); url.searchParams.delete('recovery'); window.history.replaceState({}, '', url.toString());
        setNotice('Password updated. Checking your staff membership…'); setMode('signin'); setPassword('');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Authentication failed. Please try again.'); }
    finally { setBusy(false); }
  };
  const title = mode === 'signup' ? 'Create staff account' : mode === 'forgot' ? 'Reset password' : mode === 'reset' ? 'Choose a new password' : 'Sign in to ZESTRO';
  return (
    <div className="min-h-screen bg-[#F7F8FA] px-4 py-10 flex items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-xl">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><ShieldCheck className="h-6 w-6" /></div>
        <h1 className="text-center text-2xl font-bold text-slate-900">ZESTRO Admin</h1>
        <p className="mt-2 text-center text-sm text-slate-500">Secure staff access powered by Supabase Auth</p>
        <h2 className="mt-7 text-lg font-semibold text-slate-900">{title}</h2>
        {notice && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <form onSubmit={submit} className="mt-5 space-y-4">
          {mode === 'signup' && <label className="block text-sm font-medium text-slate-700">Full name<input required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>}
          {mode !== 'reset' && <label className="block text-sm font-medium text-slate-700">Work email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>}
          {mode !== 'forgot' && <label className="block text-sm font-medium text-slate-700">{mode === 'reset' ? 'New password' : 'Password'}<input required type="password" minLength={8} autoComplete={mode === 'signup' || mode === 'reset' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>}
          <button disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Update password' : 'Sign in'}</button>
        </form>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
          {mode !== 'reset' && <><button type="button" onClick={() => { setMode('signin'); setError(''); setNotice(''); }} className="text-emerald-700 hover:underline">Sign in</button><button type="button" onClick={() => { setMode('signup'); setError(''); setNotice(''); }} className="text-emerald-700 hover:underline">Create account</button><button type="button" onClick={() => { setMode('forgot'); setError(''); setNotice(''); }} className="text-slate-500 hover:underline">Forgot password?</button></>}
        </div>
        <p className="mt-5 text-xs leading-relaxed text-slate-500">Creating a Supabase account does not grant restaurant access. Your account must match an existing, active ZESTRO staff membership and pass the existing Cloudflare Access check.</p>
      </div>
    </div>
  );
}

export function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const supabaseClient = supabase;
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linked, setLinked] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [mode, setMode] = useState<AuthMode>('signin');
  useEffect(() => {
    if (!supabaseClient) { setAuthReady(true); return; }
    let active = true;
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setMode('reset');
      if (event === 'SIGNED_OUT') { setLinked(false); setLinkError(''); }
    });
    void supabaseClient.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setLinkError(error.message);
      setSession(data.session);
      if (new URLSearchParams(window.location.search).has('recovery') && data.session) setMode('reset');
    }).finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!authReady || !session || !supabaseClient || mode === 'reset') { setLinked(false); setLinking(false); return; }
    let active = true; setLinking(true); setLinked(false); setLinkError('');
    void fetch('/api/auth/link-supabase', { method: 'POST', credentials: 'same-origin', headers: { Authorization: 'Bearer ' + session.access_token } })
      .then(async (response) => { const body = await response.json().catch(() => ({} as { error?: string })); if (!response.ok) throw new Error(body.error || 'Staff access check failed (' + response.status + ')'); if (active) setLinked(true); })
      .catch((err) => { if (active) setLinkError(err instanceof Error ? err.message : 'Unable to verify staff access.'); })
      .finally(() => { if (active) setLinking(false); });
    return () => { active = false; };
  }, [authReady, session?.access_token, session?.user.id, mode]);
  if (!supabaseClient) return <div className="min-h-screen bg-slate-50 p-8 flex items-center justify-center"><div className="max-w-xl rounded-xl border border-amber-200 bg-white p-6 text-sm text-slate-700 shadow"><strong>Supabase is not configured for this deployment.</strong><p className="mt-2">Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in Cloudflare Pages, then rebuild this branch.</p></div></div>;
  if (!authReady || (session && (linking || (!linked && !linkError)))) return <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3 text-slate-600"><Loader2 className="h-8 w-8 animate-spin text-emerald-700" /><p className="text-sm">{linking ? 'Verifying your ZESTRO staff membership…' : 'Restoring secure session…'}</p></div>;
  if (!session) return <AuthCard mode={mode} setMode={setMode} />;
  if (mode === 'reset') return <AuthCard mode={mode} setMode={setMode} />;
  if (linkError) return <div className="min-h-screen bg-slate-50 p-6 flex items-center justify-center"><div className="w-full max-w-xl rounded-2xl border border-rose-200 bg-white p-7 shadow-xl"><div className="flex items-center gap-3 text-rose-700"><LockKeyhole className="h-6 w-6" /><h1 className="text-xl font-bold text-slate-900">Staff access not linked</h1></div><p className="mt-3 text-sm text-slate-700">{linkError}</p><p className="mt-3 text-xs text-slate-500">Use the same verified work email as your existing Cloudflare Access and ZESTRO staff membership. If you are a new staff member, an owner must create your D1 membership first.</p><button type="button" onClick={() => void supabaseClient.auth.signOut()} className="mt-6 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Sign out</button></div></div>;
  if (!linked) return null;
  return <><>{children}</><button type="button" onClick={() => void supabaseClient.auth.signOut()} className="fixed right-4 top-3 z-[80] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-700 shadow hover:bg-slate-50">Sign out</button></>;
}
