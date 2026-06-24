'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Quiz {
  id: string;
  title: string;
  description: string;
  courseId: string;
  quizType: string;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showResultsImmediately: boolean;
  passingScore: number;
  timeLimit: number | null;
  _count: { questions: number };
}

interface QuizHistoryItem {
  quiz: {
    id: string;
    title: string;
    courseId: string;
    quizType: string;
    maxAttempts: number;
    passingScore: number;
    showResultsImmediately: boolean;
  };
  attempts: {
    id: string;
    score: number;
    maxScore: number;
    percentage: number;
    passed: boolean | null;
    completedAt: string;
    gradedAt: string | null;
    needsGrading: boolean;
  }[];
  totalAttempts: number;
  bestPercentage: number;
  hasPassed: boolean;
}

export default function StudentQuizPage() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [history, setHistory] = useState<QuizHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'available' | 'history'>('available');

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionData = await api.auth.verifySession();
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }

        const fetchData = async () => {
          try {
            const [quizzesData, historyData] = await Promise.all([
              api.quiz.catalog(),
              api.quiz.getStudentHistory()
            ]);
            setQuizzes(quizzesData);
            setHistory(historyData.history || []);
          } catch (err) {
            setError('Errore nel caricamento dei dati');
          } finally {
            setLoading(false);
          }
        };

        fetchData();
      } catch {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router]);

  const getQuizStatus = (quizId: string) => {
    const quizHistory = history.find((h) => h.quiz.id === quizId);
    if (!quizHistory) return { canTake: true, status: 'available' };
    
    const lastAttempt = quizHistory.attempts[0];
    const maxAttempts = quizHistory.quiz.maxAttempts;
    
    if (quizHistory.hasPassed && maxAttempts !== -1) {
      return { canTake: false, status: 'passed', bestScore: quizHistory.bestPercentage };
    }
    
    if (maxAttempts > 0 && quizHistory.totalAttempts >= maxAttempts) {
      return { canTake: false, status: 'exhausted', bestScore: quizHistory.bestPercentage };
    }
    
    const hasPendingGrading = quizHistory.attempts.some((a) => a.needsGrading);
    if (hasPendingGrading) {
      return { canTake: false, status: 'pending', bestScore: quizHistory.bestPercentage };
    }
    
    return { canTake: true, status: 'available', bestScore: quizHistory.bestPercentage };
  };

  if (loading) return <div className="p-4">Caricamento...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">I Miei Quiz</h1>
          <p className="text-slate-400 mt-2">Metti alla prova le tue conoscenze e visualizza i tuoi progressi.</p>
        </div>
      </div>

      <div className="flex gap-1 p-1 bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab('available')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'available' 
              ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20' 
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Disponibili
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
            activeTab === 'history' 
              ? 'bg-cyan-500 text-slate-900 shadow-lg shadow-cyan-500/20' 
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          Cronologia
        </button>
      </div>

      {activeTab === 'available' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {quizzes.map((quiz) => {
            const quizStatus = getQuizStatus(quiz.id);
            return (
              <div key={quiz.id} className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[32px] hover:border-cyan-500/30 transition-all duration-300 transform hover:-translate-y-1">
                <div className="flex justify-between items-start mb-6">
                    <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-purple-400 border border-white/5">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                    </div>
                </div>

                <h2 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">{quiz.title}</h2>
                <p className="text-slate-400 text-sm mb-6 line-clamp-2">{quiz.description}</p>
                
                <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-6">
                    <span className="flex items-center gap-1.5"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{quiz._count.questions} Domande</span>
                    {quiz.timeLimit && <span className="flex items-center gap-1.5"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{quiz.timeLimit} Minuti</span>}
                </div>
                
                {quizStatus.status === 'passed' && (
                  <div className="mb-6 p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                    <p className="text-emerald-400 font-bold text-xs uppercase tracking-widest">Superato ✅</p>
                    <p className="text-xs text-slate-400 mt-1">Migliore: {quizStatus.bestScore}%</p>
                  </div>
                )}
                
                {quizStatus.status === 'exhausted' && (
                  <div className="mb-6 p-4 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                    <p className="text-rose-400 font-bold text-xs uppercase tracking-widest">Tentativi Esauriti 🚫</p>
                    <p className="text-xs text-slate-400 mt-1">Migliore: {quizStatus.bestScore}%</p>
                  </div>
                )}
                
                {quizStatus.status === 'pending' && (
                  <div className="mb-6 p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20">
                    <p className="text-amber-400 font-bold text-xs uppercase tracking-widest">In Valutazione ⏳</p>
                    <p className="text-xs text-slate-400 mt-1">Presto i risultati</p>
                  </div>
                )}
                
                {(quizStatus.canTake || quizStatus.status === 'passed' || quizStatus.status === 'exhausted' || quizStatus.status === 'pending') && (
                  <button
                    onClick={() => router.push(`/quiz/${quiz.id}${quizStatus.canTake ? '' : '?view=results'}`)}
                    className={`w-full font-bold py-3.5 rounded-2xl transition-all active:scale-95 text-center ${
                        quizStatus.canTake 
                            ? 'bg-gradient-to-r from-purple-600 to-purple-500 text-white shadow-lg shadow-purple-500/20' 
                            : 'bg-white/5 text-slate-300 border border-white/5 hover:bg-white/10'
                    }`}
                  >
                    {quizStatus.canTake ? 'Inizia Quiz' : 'Dettagli Risultati'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-6">
          {history.length === 0 ? (
            <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-12 rounded-[40px] text-center">
                <p className="text-slate-400">Non hai ancora completato alcun quiz.</p>
            </div>
          ) : (
            history.map((item) => (
              <div key={item.quiz.id} className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[32px] hover:border-white/10 transition-colors">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">{item.quiz.title}</h3>
                    <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <span>Tentativi: {item.totalAttempts}</span>
                        <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                        <span>Migliore: <span className="text-slate-200">{item.bestPercentage}%</span></span>
                    </div>
                  </div>
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                      item.hasPassed 
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}>
                    {item.hasPassed ? 'Superato' : 'Non Superato'}
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  {item.attempts.slice(0, 3).map((attempt) => (
                    <div key={attempt.id} className="flex justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5">
                      <span className="text-xs text-slate-400 font-medium">
                        {new Date(attempt.completedAt).toLocaleDateString('it-IT')}
                      </span>
                      <div className="flex items-center gap-2">
                        {attempt.needsGrading ? (
                          <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">Pending</span>
                        ) : (
                          <>
                            <span className={`text-sm font-black ${attempt.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {attempt.percentage}%
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={() => router.push(`/quiz/${item.quiz.id}?view=results`)}
                  className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 text-xs font-black uppercase tracking-widest transition-colors"
                >
                  Dettagli Completi
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4 4H3" /></svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}