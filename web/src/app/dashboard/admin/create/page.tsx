'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getCsrfToken } from '@/lib/api';

interface Teacher {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export default function AdminCreateCoursePage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingTeachers, setFetchingTeachers] = useState(true);
  const [error, setError] = useState('');

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

        const fetchTeachers = async () => {
          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/users/admin/teachers`,
              { credentials: 'include' }
            );

            if (response.ok) {
              const data = await response.json();
              setTeachers(data.teachers);
              if (data.teachers.length > 0) {
                setTeacherId(data.teachers[0].id);
              }
            }
          } catch {
          } finally {
            setFetchingTeachers(false);
          }
        };

        fetchTeachers();
      } catch (error) {
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
      const csrfToken = getCsrfToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ 
            title, 
            description,
            teacherId,
            isPublished
          }),
        }
      );

      if (response.ok) {
        router.push('/dashboard/admin/courses');
      } else {
        const data = await response.json();
        setError(data.error || 'Errore nella creazione del corso');
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  if (fetchingTeachers) {
    return <div className="p-4 text-slate-300">Caricamento teacher...</div>;
  }

  return (
    <div className="text-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Crea Nuovo Corso</h1>
        <button
          onClick={() => router.push('/dashboard/admin/courses')}
          className="text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          ← Torna ai corsi
        </button>
      </div>
      
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

          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Assegna a Teacher
            </label>
            <select
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
              required
            >
              {teachers.length === 0 && (
                <option value="" className="bg-slate-800">Nessun teacher disponibile</option>
              )}
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id} className="bg-slate-800">
                  {teacher.firstName} {teacher.lastName} ({teacher.email})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="mr-2 w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-slate-300 text-sm font-bold">
                Pubblica immediatamente
              </span>
            </label>
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
