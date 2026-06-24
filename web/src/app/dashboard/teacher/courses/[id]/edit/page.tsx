'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Quiz {
  id: string;
  title: string;
  description: string;
  status: string;
  quizType: string;
  maxAttempts: number;
  passingScore: number;
  _count: { questions: number; attempts: number };
}

export default function EditCoursePage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [enrollmentType, setEnrollmentType] = useState('FREE');
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);

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
        fetchCourse();
        fetchQuizzes();
      } catch {
        router.replace('/login');
      }
    }
    checkAuth();
  }, [router, courseId]);

  const fetchQuizzes = async () => {
    setLoadingQuizzes(true);
    try {
      const data = await api.quiz.getByCourse(courseId);
      setQuizzes(data);
    } catch (err) {
      console.error('Error fetching quizzes:', err);
    } finally {
      setLoadingQuizzes(false);
    }
  };

  const fetchCourse = async () => {
    try {
      const course = await api.courses.get(courseId);
      setTitle(course.title);
      setDescription(course.description || '');
      setEnrollmentType(course.enrollmentType || 'FREE');
      setEnrollmentKey(course.enrollmentKey || '');
    } catch (err) {
      setError('Errore nel caricamento del corso');
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
      await api.courses.update(courseId, { title, description, enrollmentType, enrollmentKey });
      setSuccess('Corso aggiornato con successo!');
      setTimeout(() => {
        router.push('/dashboard/teacher/courses');
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Errore nell'aggiornamento del corso");
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
          onClick={() => router.push('/dashboard/teacher/courses')}
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

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-2 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all disabled:opacity-50"
            >
              {loading ? 'Salvataggio...' : 'Salva Modifiche'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/teacher/courses')}
              className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-4 rounded-xl transition-colors"
            >
              Annulla
            </button>
          </div>
        </form>
      </div>

      <div className="mt-8 bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">Quiz del Corso</h2>
          <button
            onClick={() => router.push('/dashboard/teacher/quiz')}
            className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold px-4 py-2 rounded-xl transition-colors"
          >
            + Crea Quiz
          </button>
        </div>

        {loadingQuizzes ? (
          <p className="text-slate-400">Caricamento quiz...</p>
        ) : quizzes.length === 0 ? (
          <p className="text-slate-400">Nessun quiz creato per questo corso.</p>
        ) : (
          <div className="space-y-3">
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="border border-white/10 rounded-xl p-4 flex justify-between items-center bg-white/5 hover:bg-white/10 transition-colors">
                <div>
                  <h3 className="font-semibold text-white">{quiz.title}</h3>
                  <p className="text-sm text-slate-400">
                    {quiz._count.questions} domande • {quiz._count.attempts} tentativi
                    {quiz.status === 'DRAFT' && ' • Bozza'}
                    {quiz.status === 'PUBLISHED' && ' • Pubblicato'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => router.push(`/dashboard/teacher/quiz/${quiz.id}`)}
                    className="text-cyan-400 hover:text-cyan-300 hover:underline text-sm transition-colors"
                  >
                    Gestisci
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const duplicated = await api.quiz.duplicate(quiz.id);
                        router.push(`/dashboard/teacher/quiz/${duplicated.quiz.id}`);
                      } catch (err) {
                        alert('Errore nella duplicazione');
                      }
                    }}
                    className="text-purple-400 hover:text-purple-300 hover:underline text-sm transition-colors"
                  >
                    Duplica
                  </button>
                  {quiz.status === 'DRAFT' && (
                    <button
                      onClick={async () => {
                        try {
                          await api.quiz.publish(quiz.id);
                          fetchQuizzes();
                        } catch (err) {
                          alert('Errore nella pubblicazione');
                        }
                      }}
                      className="text-green-400 hover:text-green-300 hover:underline text-sm transition-colors"
                    >
                      Pubblica
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
