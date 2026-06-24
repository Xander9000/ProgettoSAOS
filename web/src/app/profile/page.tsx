'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { startRegistration } from '@simplewebauthn/browser';

interface Passkey {
  id: string;
  createdAt: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [qrCode, setQrCode] = useState('');
  const [twoFaToken, setTwoFaToken] = useState('');
  const [configuring2fa, setConfiguring2fa] = useState(false);
  const [disabling2fa, setDisabling2fa] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    async function loadData() {
      try {
        const sessionData = await api.auth.verifySession();
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }
        setUserEmail(sessionData.email || '');
        const secStatus = await api.auth.getSecurityStatus();
        setTwoFactorEnabled(secStatus.twoFactorEnabled);
        await fetchPasskeys();
      } catch (err) {
        router.replace('/login');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [router]);

  const fetchPasskeys = async () => {
    try {
      const keys = await api.auth.getPasskeys();
      setPasskeys(keys);
    } catch {
    }
  };

  const handleStart2faSetup = async () => {
    setError('');
    setActionLoading(true);
    try {
      const res = await api.auth.generate2fa();
      setQrCode(res.qrCode);
      setConfiguring2fa(true);
    } catch (err: any) {
      setError(err.message || 'Errore generazione 2FA');
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm2fa = async () => {
    setError('');
    setSuccess('');
    setActionLoading(true);
    try {
      await api.auth.enable2fa(twoFaToken);
      setSuccess('Autenticazione a Due Fattori abilitata con successo!');
      setTwoFactorEnabled(true);
      setConfiguring2fa(false);
      setQrCode('');
      setTwoFaToken('');
    } catch (err: any) {
      setError(err.message || 'Codice non valido');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDisable2fa = async () => {
    setError('');
    setSuccess('');
    setActionLoading(true);
    try {
      await api.auth.disable2fa(disablePassword, disableToken);
      setSuccess('Autenticazione a Due Fattori disabilitata.');
      setTwoFactorEnabled(false);
      setConfiguring2fa(false);
      setQrCode('');
      setDisabling2fa(false);
      setDisablePassword('');
      setDisableToken('');
    } catch (err: any) {
      setError(err.message || 'Errore durante la disabilitazione 2FA');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddPasskey = async () => {
    setError('');
    setSuccess('');
    setActionLoading(true);
    try {
      const options = await api.auth.generateWebauthnRegOptions();
      const authResp = await startRegistration(options);
      await api.auth.verifyWebauthnReg(authResp);
      setSuccess('Passkey registrata con successo!');
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Registrazione Passkey fallita o annullata.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeletePasskey = async (id: string) => {
    if (!confirm('Rimuovere questo dispositivo?')) return;
    setActionLoading(true);
    try {
      await api.auth.deletePasskey(id);
      setSuccess('Passkey rimossa.');
      await fetchPasskeys();
    } catch (err: any) {
      setError(err.message || 'Errore durante la rimozione');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
      <main className="max-w-4xl mx-auto py-12 px-6 relative z-10">
        {/* Blobs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[30%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] animate-blob"></div>
          <div className="absolute bottom-[20%] right-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[100px] animate-blob animation-delay-4000"></div>
        </div>

        <div className="animate-fade-in-up space-y-8">
          <header>
            <h1 className="text-4xl font-black text-white tracking-tight mb-2">Sicurezza dell'Account</h1>
            <p className="text-slate-400">Gestisci i tuoi metodi di autenticazione e proteggi i tuoi dati.</p>
          </header>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-4 rounded-2xl text-sm font-medium animate-pulse">
              {error}
            </div>
          )}
          
          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-6 py-4 rounded-2xl text-sm font-medium">
              {success}
            </div>
          )}

          <div className="bg-slate-900/50 backdrop-blur-xl border border-white/5 rounded-[32px] overflow-hidden shadow-2xl">
            {/* Header Profilo */}
            <div className="p-8 border-b border-white/5 bg-gradient-to-r from-slate-900 to-transparent flex items-center gap-6">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-3xl font-black text-white shadow-xl">
                {userEmail[0]?.toUpperCase()}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white">{userEmail}</h2>
                <p className="text-slate-500 text-sm">Utente Registrato</p>
              </div>
            </div>

            {/* 2FA Section */}
            <div className="p-8 border-b border-white/5 transition-colors hover:bg-white/[0.02]">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="max-w-md">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-white">Autenticazione a Due Fattori (TOTP)</h3>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Aggiungi un ulteriore livello di sicurezza richiedendo un codice temporaneo dalla tua app authenticator ad ogni accesso.
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {!configuring2fa && !qrCode ? (
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleStart2faSetup}
                        disabled={actionLoading}
                        className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-3 px-6 rounded-xl transition-all disabled:opacity-50"
                      >
                        {twoFactorEnabled ? 'Reimposta 2FA' : 'Abilita 2FA'}
                      </button>
                      {twoFactorEnabled && !disabling2fa && (
                        <button
                          onClick={() => setDisabling2fa(true)}
                          disabled={actionLoading}
                          className="text-red-400 hover:text-red-300 text-xs font-bold py-2 px-6 transition-colors"
                        >
                          Disabilita
                        </button>
                      )}
                      {twoFactorEnabled && disabling2fa && (
                        <div className="bg-slate-950 p-4 rounded-2xl border border-red-500/30 shadow-inner space-y-3">
                          <p className="text-[10px] font-black text-red-400 uppercase tracking-widest text-center">Conferma disabilitazione</p>
                          <input
                            type="password"
                            value={disablePassword}
                            onChange={(e) => setDisablePassword(e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-sm text-white focus:ring-2 focus:ring-red-500 outline-none"
                            placeholder="Password corrente"
                          />
                          <input
                            type="text"
                            maxLength={6}
                            value={disableToken}
                            onChange={(e) => setDisableToken(e.target.value)}
                            className="w-full bg-slate-900 border border-white/10 rounded-xl py-2 px-3 text-sm text-center font-mono tracking-[0.3em] text-white focus:ring-2 focus:ring-red-500 outline-none"
                            placeholder="000000"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleDisable2fa}
                              disabled={actionLoading || !disablePassword || disableToken.length < 6}
                              className="flex-1 bg-red-500 hover:bg-red-400 text-white font-black py-2 rounded-xl transition-all disabled:opacity-50"
                            >
                              {actionLoading ? '...' : 'Conferma'}
                            </button>
                            <button
                              onClick={() => { setDisabling2fa(false); setDisablePassword(''); setDisableToken(''); }}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-xl transition-all"
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-slate-950 p-6 rounded-2xl border border-white/10 shadow-inner">
                      <div className="space-y-4">
                         <div className="flex justify-center">
                            {qrCode && <img src={qrCode} alt="QR Code" className="w-40 h-40 border-4 border-white rounded-xl shadow-xl p-2" />}
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center block">Codice di Verifica</label>
                            <input
                              type="text"
                              maxLength={6}
                              value={twoFaToken}
                              onChange={(e) => setTwoFaToken(e.target.value)}
                              className="w-full bg-slate-900 border border-white/10 rounded-xl py-3 text-center text-xl font-mono tracking-[0.4em] text-white focus:ring-2 focus:ring-cyan-500 outline-none"
                              placeholder="000000"
                            />
                         </div>
                         <div className="flex gap-2">
                            <button
                              onClick={handleConfirm2fa}
                              disabled={actionLoading || twoFaToken.length < 6}
                              className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black py-2.5 rounded-xl transition-all disabled:opacity-50"
                            >
                              Conferma
                            </button>
                            <button
                              onClick={() => { setConfiguring2fa(false); setQrCode(''); }}
                              className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2.5 rounded-xl transition-all"
                            >
                              Annulla
                            </button>
                         </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Passkeys Section */}
            <div className="p-8 transition-colors hover:bg-white/[0.02]">
              <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
                <div className="max-w-md">
                   <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-white">Login Passwordless (Passkeys)</h3>
                  </div>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Accedi senza password usando l'impronta digitale o il riconoscimento facciale del tuo dispositivo.
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <button
                    onClick={handleAddPasskey}
                    disabled={actionLoading}
                    className="flex items-center gap-2 bg-white text-slate-950 font-black py-3 px-6 rounded-xl hover:bg-slate-200 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                    Aggiungi Passkey
                  </button>
                </div>
              </div>

              {passkeys.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {passkeys.map(pk => (
                    <div key={pk.id} className="group flex items-center justify-between p-4 bg-slate-950 border border-white/5 rounded-2xl hover:border-purple-500/30 transition-all">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center text-purple-400">
                           <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4" /></svg>
                        </div>
                        <div>
                          <p className="text-xs font-black text-white uppercase tracking-tighter">Dispositivo Registrato</p>
                          <p className="text-[10px] text-slate-500">{new Date(pk.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeletePasskey(pk.id)}
                        disabled={actionLoading}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white/5 border border-dashed border-white/10 p-10 rounded-2xl text-center">
                   <p className="text-slate-500 text-sm italic">Nessuna passkey configurata per questo account.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
