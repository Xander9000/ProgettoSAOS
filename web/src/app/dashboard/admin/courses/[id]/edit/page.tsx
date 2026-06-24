'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api, getCsrfToken } from '@/lib/api';

interface Teacher {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  teacherId: string;
  isPublished: boolean;
  enrollmentType: string;
  enrollmentKey: string | null;
}

export default function AdminEditCoursePage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [enrollmentType, setEnrollmentType] = useState('FREE');
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [teachers, setTeachers] = useState<Teacher[]>([]);
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

        fetchData();
      } catch (error) {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router, courseId]);

  const fetchData = async () => {
    try {
      const [courseRes, teachersRes] = await Promise.all([
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/${courseId}`,
          { credentials: 'include' }
        ),
        fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/users/admin/teachers`,
          { credentials: 'include' }
        )
      ]);

      if (courseRes.ok) {
        const course: Course = await courseRes.json();
        setTitle(course.title);
        setDescription(course.description || '');
        setTeacherId(course.teacherId);
        setIsPublished(course.isPublished);
        setEnrollmentType(course.enrollmentType || 'FREE');
        setEnrollmentKey(course.enrollmentKey || '');
      } else {
        setError('Errore nel caricamento del corso');
      }

      if (teachersRes.ok) {
        const data = await teachersRes.json();
        setTeachers(data.teachers);
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
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/${courseId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
          },
          credentials: 'include',
          body: JSON.stringify({ 
            title, 
            description, 
            teacherId,
            isPublished,
            enrollmentType, 
            enrollmentKey 
          }),
        }
      );

      if (response.ok) {
        setSuccess('Corso aggiornato con successo!');
        setTimeout(() => {
          router.push('/dashboard/admin/courses');
        }, 1500);
      } else {
        const data = await response.json();
        setError(data.error || "Errore nell'aggiornamento del corso");
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Sei sicuro di voler eliminare questo corso? Questa azione non può essere annullata.')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/${courseId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers,
        }
      );

      if (response.ok) {
        router.push('/dashboard/admin/courses');
      } else {
        const data = await response.json();
        setError(data.error || 'Errore nell\'eliminazione del corso');
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
          onClick={() => router.push('/dashboard/admin/courses')}
          className="text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          ← Torna ai corsi
        </button>
        <h1 className="text-2xl font-bold text-white">Modifica Corso</h1>
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
            >
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id} className="bg-slate-800">
                  {teacher.firstName} {teacher.lastName} ({teacher.email})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-slate-300 text-sm font-bold mb-2">
              Tipo di Iscrizione
            </label>
            <select
              value={enrollmentType}
              onChange={(e) => setEnrollmentType(e.target.value)}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
            >
              <option value="FREE" className="bg-slate-800">Libero - Iscrizione immediata</option>
              <option value="KEY" className="bg-slate-800">Con chiave - Richiede codice</option>
              <option value="APPROVAL" className="bg-slate-800">Con approvazione - Richiede accettazione</option>
            </select>
          </div>

          {enrollmentType === 'KEY' && (
            <div className="mb-4">
              <label className="block text-slate-300 text-sm font-bold mb-2">
                Chiave di Iscrizione
              </label>
              <input
                type="text"
                value={enrollmentKey}
                onChange={(e) => setEnrollmentKey(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent transition-all"
                placeholder="Inserisci la chiave"
              />
            </div>
          )}

          <div className="mb-6">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="mr-2 w-4 h-4 rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
              />
              <span className="text-slate-300 text-sm font-bold">
                Pubblicato
              </span>
            </label>
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
              onClick={() => router.push('/dashboard/admin/courses')}
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
            Elimina Corso
          </button>
        </div>
      </div>
    </div>
  );
}
