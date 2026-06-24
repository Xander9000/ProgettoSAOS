'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function CreateCoursePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionData = await api.auth.verifySession();
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }
        if (sessionData.role !== 'TEACHER') {
          router.push(`/dashboard/${sessionData.role?.toLowerCase()}`);
          return;
        }
      } catch {
        router.replace('/login');
      }
    }
    checkAuth();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await api.courses.create(title, description);
      router.push('/dashboard/teacher/courses');
    } catch (err: any) {
      setError(err.message || 'Errore nella creazione del corso');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-slate-200">
      <h1 className="text-2xl font-bold mb-6 text-white">Crea Nuovo Corso</h1>
      
      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg shadow-md p-6 max-w-2xl">
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Titolo del Corso
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Descrizione del Corso
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              rows={4}
              placeholder="Descrivi il corso..."
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
          >
            {loading ? 'Creazione in corso...' : 'Crea Corso'}
          </button>
        </form>
      </div>
    </div>
  );
}
