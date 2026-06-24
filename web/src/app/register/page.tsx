'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getCsrfToken } from '@/lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081';
const CSRF_HEADER_NAME = 'x-csrf-token';

async function fetchWithCsrf(url: string, options: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  const token = getCsrfToken();
  if (token) {
    headers[CSRF_HEADER_NAME] = token;
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });
}

export default function RegisterPage() {
  const router = useRouter();
  const primed = useRef(false);
  const [step, setStep] = useState<'register' | 'verify'>('register');
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!primed.current) {
      primed.current = true;
      fetch(`${API_URL}/api/health`, { credentials: 'include' }).catch(() => {});
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetchWithCsrf(`${API_URL}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Errore nella registrazione');
      }

      const data = await response.json();
      setMessage(data.message || 'Ti abbiamo inviato un codice di conferma via email.');
      setStep('verify');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await fetchWithCsrf(`${API_URL}/api/users/register/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, code: verificationCode }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Errore nella verifica');
      }

      router.push('/login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await fetchWithCsrf(`${API_URL}/api/users/register/resend-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Errore invio codice');
      }

      setMessage(data.message || 'Nuovo codice inviato.');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 to-indigo-900 overflow-hidden relative">
      {/* Decorative Blob */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob"></div>
      <div className="absolute top-[-10%] right-[-10%] w-96 h-96 bg-cyan-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
      <div className="absolute bottom-[-20%] left-[20%] w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-blob animation-delay-4000"></div>

      <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-10 rounded-3xl shadow-2xl w-full max-w-md relative z-10 transition-all duration-300">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
            {step === 'register' ? 'Registrazione' : 'Conferma account'}
          </h1>
          <p className="text-slate-300 mt-2 text-sm font-medium">
            {step === 'register' ? 'Crea il tuo account' : 'Inserisci il codice ricevuto via email'}
          </p>
        </div>

        {message && (
          <div className="bg-emerald-500/20 border border-emerald-500/50 backdrop-blur-sm text-emerald-200 px-4 py-3 rounded-xl mb-6 text-sm font-medium">
            {message}
          </div>
        )}
        
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 backdrop-blur-sm text-red-200 px-4 py-3 rounded-xl mb-6 text-sm font-medium animate-pulse">
            {error}
          </div>
        )}

        {step === 'register' ? (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              placeholder="name@example.com"
              required
            />
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Password</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              placeholder="••••••••"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Nome</label>
              <input
                type="text"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                placeholder="Nome"
                required
              />
            </div>

            <div>
              <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Cognome</label>
              <input
                type="text"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                placeholder="Cognome"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transform hover:-translate-y-1 transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Registrazione...' : 'Registrati'}
          </button>
        </form>
        ) : (
        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Email</label>
            <input
              type="email"
              value={formData.email}
              disabled
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-300 placeholder-slate-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Codice di conferma</label>
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              placeholder="123456"
              inputMode="numeric"
              maxLength={6}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transform hover:-translate-y-1 transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifica in corso...' : 'Verifica e accedi'}
          </button>

          <button
            type="button"
            onClick={handleResendCode}
            disabled={loading}
            className="w-full bg-white/10 hover:bg-white/20 text-slate-200 font-semibold py-3 px-4 rounded-xl border border-white/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Reinvia codice
          </button>
        </form>
        )}

        <p className="mt-8 text-center text-sm text-slate-400">
          Hai già un account? <a href="/login" className="text-cyan-400 hover:text-cyan-300 hover:underline font-semibold transition-colors">Accedi</a>
        </p>
      </div>
    </div>
  );
}
