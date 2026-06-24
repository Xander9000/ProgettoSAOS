'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api, getCsrfToken } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
}

export default function AdminEditUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionData = await api.auth.verifySession();
        
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }

        if (sessionData.role !== 'ADMIN') {
          router.push(`/dashboard/${sessionData.role?.toLowerCase()}`);
          return;
        }

        fetchUser();
      } catch (error) {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router, userId]);

  const fetchUser = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/users/admin/list`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        const user = data.users.find((u: User) => u.id === userId);
        if (user) {
          setEmail(user.email);
          setFirstName(user.firstName || '');
          setLastName(user.lastName || '');
          setRole(user.role);
        } else {
          setError('Utente non trovato');
        }
      } else {
        setError('Errore nel caricamento dei dati');
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const csrfToken = getCsrfToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/users/${userId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({
            firstName: firstName || null,
            lastName: lastName || null,
            role,
          }),
        }
      );

      if (response.ok) {
        setSuccess('Utente aggiornato con successo!');
        setTimeout(() => {
          router.push('/dashboard/admin/users');
        }, 1500);
      } else {
        const data = await response.json();
        setError(data.error || "Errore nell'aggiornamento dell'utente");
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Sei sicuro di voler eliminare questo utente? Questa azione non può essere annullata.')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/users/${userId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers,
        }
      );

      if (response.ok) {
        router.push('/dashboard/admin/users');
      } else {
        const data = await response.json();
        setError(data.error || 'Errore nella eliminazione dell\'utente');
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return <div className="p-8 text-slate-300">Caricamento...</div>;
  }

  return (
    <div className="text-slate-200">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => router.push('/dashboard/admin/users')}
          className="text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          ← Torna agli utenti
        </button>
        <h1 className="text-2xl font-bold text-white">Modifica Utente</h1>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg shadow-md p-6 max-w-2xl">
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/20 border border-green-500/30 text-green-400 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-slate-400 cursor-not-allowed"
            />
            <p className="text-xs text-slate-500 mt-1">L&apos;email non può essere modificata</p>
          </div>

          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Nome
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Cognome
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            />
          </div>

          <div className="mb-6">
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Ruolo
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            >
              <option value="STUDENT" className="bg-slate-800">Studente</option>
              <option value="TEACHER" className="bg-slate-800">Docente</option>
              <option value="ADMIN" className="bg-slate-800">Amministratore</option>
            </select>
          </div>

          <div className="flex gap-4 mb-6">
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
            >
              {loading ? 'Salvataggio...' : 'Salva Modifiche'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/admin/users')}
              className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-xl transition-colors"
            >
              Annulla
            </button>
          </div>
        </form>

        <div className="border-t border-white/10 pt-6 mt-6">
          <h3 className="text-lg font-bold text-red-400 mb-4">Zona Pericolosa</h3>
          <button
            type="button"
            onClick={handleDelete}
            disabled={loading}
            className="bg-red-600 hover:bg-red-500 text-white font-bold py-2 px-4 rounded-xl transition-colors disabled:opacity-50"
          >
            Elimina Utente
          </button>
        </div>
      </div>
    </div>
  );
}
