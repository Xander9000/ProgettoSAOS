'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import NotificationPopup from '@/components/NotificationPopup';
import { startAuthentication } from '@simplewebauthn/browser';

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  courseId?: string;
  isRead: boolean;
  createdAt: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [removalNotification, setRemovalNotification] = useState<Notification | null>(null);
  const [userRole, setUserRole] = useState<string>('student');
  
  // 2FA state
  const [step, setStep] = useState<'LOGIN' | '2FA'>('LOGIN');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [pendingLoginId, setPendingLoginId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sessionData = await api.auth.verifySession();
        if (!cancelled && sessionData.valid) {
          const role = sessionData.role?.toLowerCase() || 'student';
          const notifData = await api.notifications.list();
          const removalNotif = notifData.notifications.find(
            (n: Notification) => (n.type === 'REMOVAL' || n.type === 'ROLE_CHANGE') && !n.isRead
          );
          if (removalNotif) {
            setRemovalNotification(removalNotif);
            setUserRole(role);
            await api.notifications.markAsRead(removalNotif.id);
          } else {
            router.replace(`/dashboard/${role}`);
          }
        }
      } catch {
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const proceedToDashboard = async () => {
    try {
      const sessionData = await api.auth.verifySession();
      const role = sessionData.role?.toLowerCase() || 'student';
      setUserRole(role);
      
      const notifData = await api.notifications.list();
      const removalNotif = notifData.notifications.find(
        (n: Notification) => (n.type === 'REMOVAL' || n.type === 'ROLE_CHANGE') && !n.isRead
      );
      if (removalNotif) {
        setRemovalNotification(removalNotif);
        await api.notifications.markAsRead(removalNotif.id);
      } else {
        router.replace(`/dashboard/${role}`);
      }
    } catch {
      const sessionData = await api.auth.verifySession();
      const role = sessionData.role?.toLowerCase() || 'student';
      setUserRole(role);
      router.replace(`/dashboard/${role}`);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === '2FA') {
      await handleVerify2FA();
      return;
    }
    
    setError('');
    setLoading(true);

    try {
      const res = await api.auth.login(email, password);
      if (res.requires2fa && res.pendingLoginId) {
        setPendingLoginId(res.pendingLoginId);
        setStep('2FA');
        setLoading(false);
        return;
      }
      await proceedToDashboard();
    } catch (err: any) {
      setError(err instanceof ApiError ? err.message : 'Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setError('');
    setLoading(true);
    try {
      await api.auth.verify2fa(pendingLoginId, twoFaToken);
      await proceedToDashboard();
    } catch (err: any) {
      setError(err.message || 'Token non valido');
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    setError('');
    if (!email) {
      setError('Inserisci prima la tua email per usare le Passkey');
      return;
    }
    setLoading(true);
    try {
      const options = await api.auth.generateWebauthnAuthOptions(email);
      const authResp = await startAuthentication(options);
      await api.auth.verifyWebauthnAuth(email, authResp);
      await proceedToDashboard();
    } catch (err: any) {
      setError(err.message || 'WebAuthn login fallito');
    } finally {
      setLoading(false);
    }
  };

  const handleClosePopup = () => {
    setRemovalNotification(null);
    router.push(`/dashboard/${userRole}`);
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
            E-Learning Platform
          </h1>
          <p className="text-slate-300 mt-2 text-sm font-medium">Accesso di Sicurezza Avanzato</p>
        </div>
        
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 backdrop-blur-sm text-red-200 px-4 py-3 rounded-xl mb-6 text-sm font-medium animate-pulse">
            {error}
          </div>
        )}

        <form onSubmit={handleLoginSubmit} className="space-y-5">
          {step === 'LOGIN' ? (
            <>
              <div>
                <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="name@example.com"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm font-bold mb-2 ml-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                  required
                />
                <div className="mt-2 text-right">
                  <a href="/forgot-password" className="text-xs text-cyan-300 hover:text-cyan-200 hover:underline">
                    Password dimenticata?
                  </a>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transform hover:-translate-y-1 transition-all duration-200 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Attendere...' : 'Accedi'}
                </button>

                <div className="relative flex items-center justify-center py-2">
                  <div className="absolute border-t border-white/10 w-full"></div>
                  <span className="relative bg-transparent px-4 text-xs font-medium text-slate-400 uppercase tracking-wider backdrop-blur-xl">Oppure</span>
                </div>

                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={loading}
                  className="w-full bg-slate-800/50 hover:bg-slate-700/50 border border-white/10 text-white font-semibold py-3 px-4 rounded-xl shadow-md backdrop-blur-sm transform hover:-translate-y-1 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                  Usa Passkey (WebAuthn)
                </button>
              </div>
            </>
          ) : (
            <div className="text-center animate-fade-in-up">
              <div className="mb-4 text-cyan-400">
                <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" /></svg>
              </div>
              <h2 className="text-xl font-bold text-white mb-2">Autenticazione a Due Fattori</h2>
              <p className="text-slate-300 text-sm mb-6">Inserisci il codice temporaneo della tua app authenticator.</p>
              
              <div className="mb-6">
                <input
                  type="text"
                  maxLength={6}
                  value={twoFaToken}
                  onChange={(e) => setTwoFaToken(e.target.value)}
                  className="w-full px-4 py-4 text-center tracking-[0.5em] text-2xl font-mono bg-white/5 border border-cyan-500/30 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                  placeholder="000000"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || twoFaToken.length < 6}
                className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transform hover:-translate-y-1 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Verifica...' : 'Conferma Codice'}
              </button>
              
              <button 
                type="button" 
                onClick={() => { setStep('LOGIN'); setTwoFaToken(''); }}
                className="mt-4 text-slate-400 hover:text-white text-sm transition-colors"
              >
                Annulla e torna al Login
              </button>
            </div>
          )}
        </form>

        {step === 'LOGIN' && (
          <p className="mt-8 text-center text-sm text-slate-400">
            Nuovo utente? <a href="/register" className="text-cyan-400 hover:text-cyan-300 hover:underline font-semibold transition-colors">Registrati</a>
          </p>
        )}
      </div>
      <NotificationPopup notification={removalNotification} onClose={handleClosePopup} />
      
      {/* Global generic animations can go into globals.css */}
    </div>
  );
}
