'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get('token') || '', [searchParams]);
  const email = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    document.head.appendChild(meta);
    return () => { document.head.removeChild(meta); };
  }, []);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (password !== confirmPassword) {
      setError('Le password non coincidono');
      return;
    }

    setLoading(true);
    try {
      const result = await api.auth.confirmPasswordReset(token, password);
      setMessage(result.message);
      setTimeout(() => router.push('/login'), 1200);
    } catch (err: any) {
      setError(err.message || 'Errore durante il reset');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 to-indigo-900 overflow-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-10 rounded-3xl shadow-2xl w-full max-w-md relative z-10">
        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 text-center">
          Nuova password
        </h1>
        <p className="text-slate-300 mt-2 text-sm text-center">Imposta una nuova password per {email || 'il tuo account'}.</p>

        {error && <div className="bg-red-500/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl mt-6 text-sm">{error}</div>}
        {message && <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-xl mt-6 text-sm">{message}</div>}

        <form onSubmit={handleSubmit} className="space-y-5 mt-6">
          <div>
            <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Nuova password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Conferma password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !token}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
          >
            {loading ? 'Salvataggio...' : 'Aggiorna password'}
          </button>
        </form>

        {!token && (
          <p className="mt-4 text-sm text-amber-300 text-center">Manca il token di reset nel link.</p>
        )}

        <p className="mt-8 text-center text-sm text-slate-400">
          Torna al <a href="/login" className="text-cyan-400 hover:underline">login</a>
        </p>
      </div>
    </div>
  );
}
