'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Quiz {
  id: string;
  title: string;
  description: string;
  quizType: string;
  maxAttempts: number;
  _count: { questions: number };
}

export default function CourseQuizzesPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;
  
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionData = await api.auth.verifySession();
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }

        const fetchQuizzes = async () => {
          try {
            const data = await api.quiz.getByCourse(courseId);
            setQuizzes(data);
          } catch (err: any) {
            if (err.status === 403) {
              setError('Non sei iscritto a questo corso.');
            } else {
              setError('Errore nel caricamento dei quiz');
            }
          } finally {
            setLoading(false);
          }
        };

        fetchQuizzes();
      } catch {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [courseId, router]);

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Caricamento Quiz...</p>
      </div>
    </div>
  );
  
  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="bg-slate-900 border border-rose-500/20 p-12 rounded-[40px] text-center max-w-md w-full shadow-2xl">
        <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center text-rose-400 mx-auto mb-6">
          <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <p className="text-xl font-bold text-white mb-2">{error}</p>
        <p className="text-slate-400 mb-8">Sembra che ci sia stato un problema nell'accesso a questa sezione.</p>
        <button
          onClick={() => router.push('/dashboard/student/my-courses')}
          className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl hover:bg-slate-200 transition-all active:scale-95 shadow-xl"
        >
          Torna ai Miei Corsi
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[120px] animate-blob"></div>
        <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
      </div>

      <div className="max-w-5xl mx-auto py-12 px-6 relative z-10 animate-fade-in-up">
        <button
          onClick={() => router.push('/dashboard/student/my-courses')}
          className="group flex items-center gap-2 mb-10 text-slate-500 hover:text-white transition-colors font-bold uppercase text-[10px] tracking-widest px-4 py-2 bg-white/5 rounded-xl border border-white/5 hover:border-white/10"
        >
          <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          Torna ai Miei Corsi
        </button>

        <header className="mb-12">
          <h1 className="text-5xl font-black text-white tracking-tight leading-tight">Quiz Disponibili</h1>
          <p className="text-slate-400 mt-2 text-lg">Metti alla prova le tue conoscenze e sblocca nuovi traguardi.</p>
        </header>

        {quizzes.length === 0 ? (
          <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-16 rounded-[48px] text-center shadow-2xl">
            <div className="w-24 h-24 bg-cyan-500/10 rounded-3xl flex items-center justify-center text-cyan-400 mx-auto mb-8 transform rotate-6 border border-cyan-500/20">
               <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            </div>
            <p className="text-2xl font-bold text-white mb-4">Ancora nessun quiz disponibile</p>
            <p className="text-slate-400 max-w-md mx-auto leading-relaxed">Il docente non ha ancora pubblicato questionari per questo corso. Torna a trovarci presto!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {quizzes.map((quiz) => (
              <div key={quiz.id} className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[40px] hover:border-cyan-500/30 transition-all duration-300 shadow-xl overflow-hidden active:scale-[0.98]">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-cyan-500/10 to-transparent blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                
                <div className="flex justify-between items-start mb-8 relative z-10">
                  <div className="p-3 bg-white/5 rounded-2xl text-cyan-400 border border-white/5 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-all duration-300">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full bg-white/5 text-slate-400 border border-white/5 group-hover:bg-white/10 group-hover:text-white transition-all">
                    {quiz.quizType === 'MULTIPLE_CHOICE' ? 'Scelta multipla' : 'Quiz'}
                  </span>
                </div>

                <div className="relative z-10">
                  <h2 className="text-2xl font-black text-white mb-3 group-hover:text-cyan-400 transition-colors leading-tight">{quiz.title}</h2>
                  {quiz.description && (
                    <p className="text-slate-400 text-sm mb-8 line-clamp-2 leading-relaxed font-medium">{quiz.description}</p>
                  )}
                  
                  <div className="flex flex-wrap items-center gap-4 mb-8">
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">
                        {quiz.maxAttempts === -1 ? 'Illimitati' : `${quiz.maxAttempts} tentativi`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
                      <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">{quiz._count.questions} domande</span>
                    </div>
                  </div>

                  <button
                    onClick={() => router.push(`/quiz/${quiz.id}`)}
                    className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl hover:bg-cyan-500 transition-all shadow-xl flex items-center justify-center gap-2"
                  >
                    <span>Inizia il Quiz</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}