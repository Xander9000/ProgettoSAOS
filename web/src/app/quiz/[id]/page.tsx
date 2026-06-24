'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api, getCsrfToken } from '@/lib/api';

interface Question {
  id: string;
  text: string;
  order: number;
  questionType: string;
  points: number;
  answers: { id: string; text: string; order: number }[];
}

interface QuizData {
  id: string;
  title: string;
  description: string;
  quizType: string;
  timeLimit: number;
  maxAttempts: number;
  passingScore: number;
  showResultsImmediately: boolean;
  questions: Question[];
}

export default function QuizPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;
  
  const [quiz, setQuiz] = useState<QuizData | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<{ [key: string]: string }>({});
  const [textAnswers, setTextAnswers] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attemptDetails, setAttemptDetails] = useState<any[]>([]);
  const [quizInfo, setQuizInfo] = useState<any>(null);
  const [selectedAttemptIndex, setSelectedAttemptIndex] = useState<number>(0);
  const [viewAttemptData, setViewAttemptData] = useState<any>(null);
  const [renderedAttemptId, setRenderedAttemptId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<string | null>(null);
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    setViewMode(urlParams.get('view'));
  }, []);

  useEffect(() => {
    if (viewMode === 'results' && quizId && !loading) {
      api.quiz.results(quizId).then(results => {
        const attempts = (results.attempts || []) as any[];
        setAttemptDetails(attempts);
        const completed = attempts.filter((a: any) => a.completedAt);
        if (completed.length > 0) {
          const currentAttemptId = renderedAttemptId || completed[0].id;
          const currentAttempt = completed.find((a: any) => a.id === currentAttemptId) || completed[0];
          setViewAttemptData(currentAttempt);
          setRenderedAttemptId(currentAttempt.id);
        }
      }).catch(() => {});
    }
  }, [viewMode, quizId, loading]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionData = await api.auth.verifySession();
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }

        const fetchQuiz = async () => {
          try {
            const data = await api.quiz.get(quizId);
            setQuiz(data);
            setQuizInfo(data);

            const results = await api.quiz.results(quizId);
            const attempts = (results.attempts || []) as any[];
            setAttemptDetails(attempts);
            if (attempts.length > 0) {
              const quizType = data.quizType;
              const maxAttempts = data.maxAttempts;
              
              const hasCompletedAttempts = attempts.some((a: any) => a.completedAt);
              
              const canStartNewAttempt = maxAttempts === -1 || !hasCompletedAttempts || (hasCompletedAttempts && maxAttempts > attempts.length);
              
              if (!canStartNewAttempt && maxAttempts > 0 && attempts.length >= maxAttempts) {
                if (!hasCompletedAttempts) {
                  setError('Hai esaurito i tentativi per questo quiz.');
                  setLoading(false);
                  return;
                }
                const completed = attempts.filter((a: any) => a.completedAt);
                if (completed.length > 0) {
                  setViewAttemptData(completed[0]);
                  setRenderedAttemptId(completed[0].id);
                  if (!viewMode) setViewMode('results');
                }
              }
            }

            if (results.quiz) {
              setQuizInfo({ ...data, passingScore: results.quiz.passingScore });
            }
          } catch (err: any) {
            if (err.status === 403) {
              setError('Non sei iscritto a questo corso.');
            } else {
              setError('Quiz non disponibile');
            }
          } finally {
            setLoading(false);
          }
        };

        fetchQuiz();
      } catch {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [quizId, router]);

  const [started, setStarted] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!result || result.needsGrading !== true) return;
    
    const interval = setInterval(async () => {
      try {
        const results = await api.quiz.results(quizId);
        if (results.attempts && results.attempts.length > 0) {
          const attempts = results.attempts as any[];
          setAttemptDetails(attempts);
          
          const lastAttempt = attempts[0];
          const stillNeedsGrading = lastAttempt.submissions?.some(
            (s: any) => s.gradingStatus === 'PENDING' || s.gradingStatus === 'NEEDS_REVIEW'
          );
          
          if (!stillNeedsGrading) {
            setResult({ ...result, needsGrading: false });
            setQuizInfo((prev: any) => prev ? { ...prev, passingScore: results.quiz?.passingScore } : null);
          }
        }
      } catch {
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [result, quizId]);

  useEffect(() => {
    if (viewMode !== 'results') return;
    
    const interval = setInterval(async () => {
      try {
        const results = await api.quiz.results(quizId);
        if (results.attempts && results.attempts.length > 0) {
          const attempts = results.attempts as any[];
          setAttemptDetails(attempts);
          const completed = attempts.filter((a: any) => a.completedAt);
          if (completed.length > 0) {
            const currentAttempt = completed.find((a: any) => a.id === renderedAttemptId) || completed[0];
            setViewAttemptData(currentAttempt);
          }
        }
      } catch {
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [viewMode, quizId, renderedAttemptId]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0 || result) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timeLeft, result]);

  const handleAnswer = (questionId: string, answerId: string) => {
    setAnswers({ ...answers, [questionId]: answerId });
  };

  const handleTextAnswer = (questionId: string, text: string) => {
    setTextAnswers({ ...textAnswers, [questionId]: text });
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      const csrfToken = getCsrfToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/quiz/quiz/${quizId}/start`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
          body: JSON.stringify({}),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setCurrentAttemptId(data.attempt.id);
        setStarted(true);
        if (data.attempt.startedAt) {
          const startedMs = new Date(data.attempt.startedAt).getTime();
          if (quiz?.timeLimit && quiz.timeLimit > 0) {
            const elapsed = Math.floor((Date.now() - startedMs) / 1000);
            const remaining = Math.max(0, quiz.timeLimit * 60 - elapsed);
            setTimeLeft(remaining);
          }
        }
      } else {
        const err = await response.json();
        setError(err.error || 'Errore nell\'avvio del quiz');
      }
    } catch {
      setError('Errore nell\'avvio del quiz');
    } finally {
      setStarting(false);
    }
  };

  const handleSubmit = async () => {
    if (!quiz || !currentAttemptId) return;

    setSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const questionSubmissions = quiz.questions.map((q) => {
        if (q.questionType === 'MULTIPLE_CHOICE') {
          return {
            questionId: q.id,
            answerId: answers[q.id] || null
          };
        } else {
          return {
            questionId: q.id,
            textAnswer: textAnswers[q.id] || ''
          };
        }
      });

      const csrfToken = getCsrfToken();
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/quiz/quiz/${quizId}/submit`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
          body: JSON.stringify({ attemptId: currentAttemptId, questionSubmissions }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        setResult(data.attempt);
        
        const updatedResults = await api.quiz.results(quizId);
        if (updatedResults.attempts && updatedResults.attempts.length > 0) {
          setAttemptDetails(updatedResults.attempts);
        }
      } else {
        const err = await response.json();
        setError(err.error || 'Errore nella sottomissione');
      }
    } catch {
      setError('Errore nella sottomissione');
    } finally {
      setSubmitting(false);
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Caricamento Quiz...</p>
      </div>
    </div>
  );

  if (!quiz) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">Quiz non trovato</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-slate-900/40 backdrop-blur-xl border border-rose-500/20 p-8 rounded-[32px] text-center">
        <div className="w-16 h-16 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-6">
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
        </div>
        <p className="text-rose-200 font-medium mb-8 leading-relaxed">{error}</p>
        <button
          onClick={() => router.push('/dashboard/student/quiz')}
          className="w-full bg-white text-slate-950 font-black py-4 rounded-2xl transition-all active:scale-95 hover:bg-slate-200"
        >
          Torna ai Quiz
        </button>
      </div>
    </div>
  );

  const hasCompletedAttempts = attemptDetails.some((a: any) => a.completedAt);
  const lastCompletedAttempt = hasCompletedAttempts 
    ? attemptDetails.find((a: any) => a.completedAt) 
    : null;
  
  const completedAttempts = attemptDetails.filter((a: any) => a.completedAt);
  
  const selectedAttempt = viewMode === 'results' 
    ? (viewAttemptData || (selectedAttemptIndex !== null ? completedAttempts[selectedAttemptIndex] : lastCompletedAttempt))
    : (selectedAttemptIndex !== null ? completedAttempts[selectedAttemptIndex] : lastCompletedAttempt);

  const getAttemptStatus = (attempt: any) => {
    const hasPendingGrading = attempt.submissions?.some(
      (s: any) => s.gradingStatus === 'PENDING' || s.gradingStatus === 'NEEDS_REVIEW'
    );
    if (hasPendingGrading) return 'pending';
    if (attempt.percentage === null) return 'pending';
    return 'graded';
  };

  const maxAttempts = quiz?.maxAttempts || 0;
  const canStartNewAttempt = maxAttempts === -1 || !hasCompletedAttempts || (hasCompletedAttempts && maxAttempts > completedAttempts.length);

  if (viewMode === 'results' && attemptDetails.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Caricamento Risultati...</p>
        </div>
      </div>
    );
  }

  if (viewMode === 'results' && hasCompletedAttempts && selectedAttempt) {
    const attemptStatus = getAttemptStatus(selectedAttempt);
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
        <div className="max-w-4xl mx-auto py-12 px-6 relative z-10">
          {/* Blobs */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[100px] animate-blob"></div>
            <div className="absolute bottom-[10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px] animate-blob animation-delay-4000"></div>
          </div>

          <button
            onClick={() => router.push('/dashboard/student/quiz')}
            className="group mb-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <div className="p-2 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            </div>
            <span className="text-sm font-bold uppercase tracking-widest">Torna ai Quiz</span>
          </button>

          <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-8 md:p-12 shadow-2xl mb-12">
            <h1 className="text-4xl font-black text-white tracking-tight mb-8">
              Riepilogo <span className="text-cyan-400">Risultati</span>
            </h1>
            
            {completedAttempts.length > 1 && (
              <div className="mb-12">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4">Seleziona un tentativo:</p>
                <div className="flex flex-wrap gap-2">
                  {completedAttempts.map((attempt: any, index: number) => {
                    const status = getAttemptStatus(attempt);
                    const isSelected = selectedAttemptIndex === index || 
                      (selectedAttemptIndex === null && index === completedAttempts.length - 1);
                    return (
                      <button
                        key={attempt.id || index}
                        onClick={() => {
                          setSelectedAttemptIndex(index);
                          setViewAttemptData(attempt);
                          setRenderedAttemptId(attempt.id);
                        }}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                          isSelected 
                            ? 'bg-cyan-500 text-slate-900 border-cyan-500 shadow-lg shadow-cyan-500/20' 
                            : 'bg-white/5 text-slate-400 border-white/5 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        T#{index + 1} - {status === 'pending' ? 'Pendia' : `${attempt.percentage}%`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Punteggio</p>
                <p className="text-3xl font-black text-cyan-400">{selectedAttempt.percentage}%</p>
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Punti</p>
                <p className="text-3xl font-black text-white">{selectedAttempt.score}/{selectedAttempt.maxScore}</p>
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Stato</p>
                <p className={`text-xl font-black ${selectedAttempt.passed ? 'text-emerald-400' : selectedAttempt.passed === false ? 'text-rose-400' : 'text-amber-400'}`}>
                  {selectedAttempt.passed === true ? 'SUPERATO' : selectedAttempt.passed === false ? 'NON SUPERATO' : 'IN ATTESA'}
                </p>
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl text-center">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Data</p>
                <p className="text-xl font-black text-white">{selectedAttempt.completedAt ? new Date(selectedAttempt.completedAt).toLocaleDateString('it-IT') : '-'}</p>
              </div>
            </div>

            <h3 className="text-xl font-black text-white mb-6">Analisi Risposte</h3>
            <div className="space-y-6">
              {selectedAttempt.submissions.map((sub: any, idx: number) => {
                const isCorrect = sub.answer?.isCorrect;
                const isOpen = sub.question.questionType === 'OPEN_ANSWER';
                
                return (
                  <div key={sub.id} className={`p-8 rounded-3xl border transition-all ${
                    isOpen 
                      ? 'bg-amber-500/5 border-amber-500/20' 
                      : isCorrect 
                        ? 'bg-emerald-500/5 border-emerald-500/20 shadow-lg shadow-emerald-500/5' 
                        : 'bg-rose-500/5 border-rose-500/20 shadow-lg shadow-rose-500/5'
                  }`}>
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-6">
                      <div>
                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 block">Domanda {idx + 1}</span>
                        <p className="text-lg font-bold text-white leading-tight">{sub.question.text}</p>
                      </div>
                      <span className="px-4 py-2 bg-white/5 rounded-xl text-xs font-bold text-slate-300 border border-white/10 whitespace-nowrap">
                        {sub.points !== undefined ? `${sub.points} / ${sub.question.points} PT` : 'IN ATTESA'}
                      </span>
                    </div>
                    
                    <div className="space-y-4">
                      {sub.question?.questionType === 'MULTIPLE_CHOICE' ? (
                        <div className="bg-black/20 rounded-2xl p-6 border border-white/5">
                          <p className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-tighter">La tua risposta:</p>
                          <p className={`text-lg font-medium ${isCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {sub.answer?.text || 'Nessuna risposta'}
                          </p>
                          <div className="mt-4 flex items-center gap-2">
                             {isCorrect ? (
                               <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                 Corretta
                               </div>
                             ) : (
                               <div className="flex items-center gap-2 bg-rose-500/20 text-rose-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                 <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                 Errata
                               </div>
                             )}
                          </div>
                        </div>
                      ) : (
                        <div className="bg-black/20 rounded-2xl p-6 border border-white/5">
                          <p className="text-sm font-bold text-slate-400 mb-2 uppercase tracking-tighter">La tua risposta:</p>
                          <div className="bg-slate-950/50 p-4 rounded-xl text-slate-200 text-sm leading-relaxed border border-white/5 italic">
                            "{sub.textAnswer || 'Nessuna risposta'}"
                          </div>
                          {sub.gradingStatus === 'ACCEPTED' && (
                             <div className="mt-4 flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest w-fit">
                               Valutazione completata
                             </div>
                          )}
                        </div>
                      )}

                      {sub.feedback && (
                        <div className="mt-6 p-6 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 relative overflow-hidden group">
                          <div className="absolute -right-4 -top-4 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl group-hover:bg-cyan-500/20 transition-all"></div>
                          <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                             Feedback del docente:
                          </p>
                          <p className="text-slate-200 text-sm italic font-medium leading-relaxed relative z-10">"{sub.feedback}"</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center mt-12 pt-12 border-t border-white/5">
              <button
                onClick={() => router.push('/dashboard/student/quiz')}
                className="bg-white text-slate-950 font-black py-4 px-12 rounded-2xl transition-all active:scale-95 hover:bg-slate-200 shadow-xl"
              >
                Torna alla cronologia
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (result) {
    const showResults = result.showResultsImmediately && result.needsGrading !== true;
    const lastAttempt = attemptDetails.length > 0 ? attemptDetails[0] : null;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30 py-12 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-12 text-center mb-8 relative overflow-hidden shadow-2xl">
            <div className="absolute -top-12 -left-12 w-48 h-48 bg-cyan-600/10 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-purple-600/10 rounded-full blur-3xl"></div>
            
            <div className="w-20 h-20 bg-cyan-500/20 rounded-[32px] flex items-center justify-center text-cyan-400 mx-auto mb-8 shadow-xl border border-cyan-500/20">
               <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            
            <h1 className="text-4xl font-black text-white tracking-tight mb-4">Quiz Completato!</h1>

            {showResults ? (
              <>
                <div className="mb-8">
                  <div className="text-7xl font-black text-cyan-400 mb-2 drop-shadow-lg leading-none">{result.percentage}%</div>
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">
                    Punteggio: <span className="text-white">{result.score} / {result.maxScore}</span>
                  </p>
                  {quizInfo?.passingScore && (
                    <div className="p-3 bg-white/5 rounded-2xl border border-white/5 w-fit mx-auto mt-6">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
                          Requisito minimo: {quizInfo.passingScore}%
                        </p>
                    </div>
                  )}
                </div>

                <div className={`p-6 rounded-[32px] border mb-12 transform transition-all ${
                  result.passed 
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-100' 
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-100'
                }`}>
                   <p className="text-xl font-bold tracking-tight">
                    {result.passed 
                      ? '🎯 Complimenti! Hai superato brillantemente il test.' 
                      : '📝 Non hai raggiunto il punteggio minimo. Carica le batterie e riprova!'}
                  </p>
                </div>
              </>
            ) : (
              <div className="mb-12 bg-amber-500/10 border border-amber-500/20 p-8 rounded-[32px]">
                <p className="text-xl font-bold text-amber-200">
                  Il tuo insegnante deve ancora valutare le risposte aperte.
                </p>
                <p className="text-slate-400 text-sm mt-3 leading-relaxed">
                  Abbiamo registrato la consegna. Riceverai una notifica non appena il docente caricherà il feedback.
                </p>
              </div>
            )}

            <button
              onClick={() => router.push('/dashboard/student/quiz')}
              className="group bg-white text-slate-950 font-black py-5 px-12 rounded-[24px] transition-all hover:bg-slate-200 active:scale-95 shadow-2xl flex items-center gap-3 mx-auto"
            >
              Torna ai Quiz
              <svg className="w-5 h-5 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 8l4 4m0 0l-4 4m4 4H3" /></svg>
            </button>
          </div>

          {lastAttempt && showResults && lastAttempt.submissions && lastAttempt.submissions.length > 0 && (
            <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-12">
              <h2 className="text-2xl font-black text-white mb-8 tracking-tight">Dettaglio delle risposte</h2>
              <div className="space-y-6">
                {lastAttempt.submissions.map((sub: any, index: number) => (
                  <div key={sub.id || index} className="group bg-white/5 border border-white/5 p-8 rounded-3xl hover:bg-white/[0.07] transition-all">
                    <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-4">
                      <p className="text-lg font-bold text-white leading-tight">{sub.question?.text || 'Domanda #' + (index + 1)}</p>
                      <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border ${
                        sub.points > 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/20' : 'bg-rose-500/20 text-rose-400 border-rose-500/20'
                      }`}>
                        {sub.points} PUNTI
                      </span>
                    </div>
                    
                    <div className="ml-2 text-sm">
                      {sub.question?.questionType === 'MULTIPLE_CHOICE' ? (
                        <div className="space-y-3">
                          <p className="text-slate-400 font-medium">La tua risposta:</p>
                          <div className={`p-4 rounded-xl font-bold ${sub.answer?.isCorrect ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {sub.answer?.text || 'Nessuna risposta'}
                          </div>
                          {sub.feedback && (
                            <div className="mt-4 p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                              <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1">Feedback del docente:</p>
                              <p className="text-slate-300 italic">"{sub.feedback}"</p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-slate-400 font-medium">La tua risposta:</p>
                          <div className="bg-slate-950/50 p-4 rounded-xl text-slate-200 border border-white/5 italic">
                            "{sub.textAnswer || 'Nessuna risposta'}"
                          </div>
                          {sub.feedback && (
                            <div className="mt-4 p-4 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                              <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-1">Feedback del docente:</p>
                              <p className="text-slate-300 italic">"{sub.feedback}"</p>
                            </div>
                          )}
                          {sub.gradingStatus === 'ACCEPTED' && (
                            <div className="mt-4 flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest w-fit">
                               Valutazione completata
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!started && !viewMode && !result) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30 overflow-hidden relative">
        <div className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] bg-cyan-600/10 rounded-full blur-[120px] animate-blob"></div>
        <div className="absolute bottom-[10%] right-[-10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px] animate-blob animation-delay-4000"></div>
        <div className="max-w-2xl mx-auto py-12 px-6 relative z-10">
          <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-8 md:p-12 shadow-2xl text-center">
            <div className="w-20 h-20 bg-cyan-500/20 rounded-[32px] flex items-center justify-center text-cyan-400 mx-auto mb-8 shadow-xl border border-cyan-500/20">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            </div>
            <h1 className="text-4xl font-black text-white tracking-tight mb-4">{quiz.title}</h1>
            {quiz.description && (
              <p className="text-slate-400 text-lg mb-10 leading-relaxed">{quiz.description}</p>
            )}
            <div className="grid grid-cols-2 gap-4 mb-10">
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Domande</p>
                <p className="text-3xl font-black text-cyan-400">{quiz.questions.length}</p>
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Tentativi</p>
                <p className="text-3xl font-black text-purple-400">{quiz.maxAttempts === -1 ? 'Illimitati' : quiz.maxAttempts}</p>
              </div>
              {quiz.timeLimit > 0 && (
                <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Tempo</p>
                  <p className="text-3xl font-black text-amber-400">{quiz.timeLimit} min</p>
                </div>
              )}
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Sufficienza</p>
                <p className="text-3xl font-black text-emerald-400">{quiz.passingScore}%</p>
              </div>
            </div>
            <button
              onClick={handleStart}
              disabled={starting}
              className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 text-white font-black py-5 px-12 rounded-2xl transition-all hover:from-cyan-500 hover:to-cyan-400 active:scale-95 shadow-xl shadow-cyan-500/20 disabled:opacity-50 disabled:grayscale flex items-center justify-center gap-3"
            >
              {starting ? (
                <>
                  <div className="w-5 h-5 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  Avvio...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                  Inizia Quiz
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const question = quiz.questions[currentQuestion];
  const answeredMC = quiz.questions
    .filter(q => q.questionType === 'MULTIPLE_CHOICE')
    .filter(q => answers[q.id]).length;
  const answeredOpen = quiz.questions
    .filter(q => q.questionType === 'OPEN_ANSWER')
    .filter(q => textAnswers[q.id]?.trim()).length;
  const totalMC = quiz.questions.filter(q => q.questionType === 'MULTIPLE_CHOICE').length;
  const totalOpen = quiz.questions.filter(q => q.questionType === 'OPEN_ANSWER').length;
  const totalAnswered = answeredMC + answeredOpen;
  const totalQuestions = quiz.questions.length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30 overflow-hidden relative">
      {/* Dynamic Blobs for Atmosphere */}
      <div className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] animate-blob"></div>
      <div className="absolute bottom-[10%] right-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[100px] animate-blob animation-delay-4000"></div>

      <div className="max-w-3xl mx-auto py-12 px-6 relative z-10">
        <button
          onClick={() => router.push('/dashboard/student/quiz')}
          className="group mb-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <div className="p-2 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </div>
          <span className="text-sm font-bold uppercase tracking-widest">Torna ai Quiz</span>
        </button>

        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-8 md:p-12 shadow-2xl mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 flex flex-col items-end">
            {timeLeft !== null && (
              <div className={`font-mono text-2xl font-black tabular-nums transition-colors ${timeLeft < 60 ? 'text-rose-500 animate-pulse' : 'text-cyan-400'}`}>
                {formatTime(timeLeft)}
              </div>
            )}
          </div>
          
          <h1 className="text-3xl font-black text-white tracking-tight mb-8 max-w-[70%]">{quiz.title}</h1>

          <div className="mt-auto">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Avanzamento Quiz</span>
              <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{totalAnswered} / {totalQuestions} Completate</span>
            </div>
            <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-700 ease-out shadow-[0_0_20px_rgba(34,211,238,0.3)]"
                style={{ width: `${(totalAnswered / totalQuestions) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-900/40 backdrop-blur-3xl border border-white/5 rounded-[40px] p-8 md:p-12 shadow-2xl">
          <div className="flex justify-between items-center mb-10 pb-6 border-b border-white/5">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center text-cyan-400 font-black">
                  {currentQuestion + 1}
               </div>
               <span className="text-xs font-black text-slate-500 uppercase tracking-widest">di {totalQuestions} Domande</span>
            </div>
            <span className="bg-cyan-500/10 text-cyan-400 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-cyan-500/20">
              {question.questionType === 'MULTIPLE_CHOICE' ? 'Scelta multipla' : 'Risposta aperta'} • {question.points} PT
            </span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-12 leading-tight tracking-tight">{question.text}</h2>

          {question.questionType === 'MULTIPLE_CHOICE' ? (
            <div className="grid gap-4 mb-12">
              {question.answers.map((answer) => {
                const isSelected = answers[question.id] === answer.id;
                return (
                  <button
                    key={answer.id}
                    onClick={() => handleAnswer(question.id, answer.id)}
                    className={`group w-full text-left p-6 rounded-3xl border transition-all duration-300 relative overflow-hidden ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500 shadow-[0_0_25px_rgba(34,211,238,0.1)]'
                        : 'bg-white/5 border-white/5 hover:border-white/20 hover:bg-white/[0.07]'
                    }`}
                  >
                    <div className="flex items-center gap-4 relative z-10">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                         isSelected ? 'border-cyan-500 bg-cyan-500' : 'border-slate-700'
                      }`}>
                         {isSelected && <svg className="w-4 h-4 text-slate-950" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <span className={`font-bold transition-colors ${isSelected ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'}`}>{answer.text}</span>
                    </div>
                    {isSelected && <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 to-transparent"></div>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mb-12">
              <textarea
                value={textAnswers[question.id] || ''}
                onChange={(e) => handleTextAnswer(question.id, e.target.value)}
                placeholder="Scrivi qui la tua risposta dettagliata..."
                className="w-full bg-slate-950 border border-white/10 rounded-[32px] p-8 text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500 outline-none transition-all min-h-[250px] shadow-inner text-lg"
              />
            </div>
          )}

          <div className="flex items-center justify-between pt-8 border-t border-white/5">
            <button
              onClick={() => setCurrentQuestion(Math.max(0, currentQuestion - 1))}
              disabled={currentQuestion === 0}
              className="group flex items-center gap-2 bg-white/5 hover:bg-white/10 text-white px-8 py-4 rounded-2xl font-bold transition-all disabled:opacity-30 disabled:grayscale"
            >
              <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" /></svg>
              Precedente
            </button>

            {currentQuestion === totalQuestions - 1 ? (
              <button
                onClick={handleSubmit}
                disabled={submitting || totalAnswered < totalQuestions}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-10 py-4 rounded-2xl font-black transition-all shadow-xl shadow-cyan-500/20 active:scale-95 disabled:opacity-50 disabled:grayscale flex items-center gap-2"
              >
                {submitting ? (
                  <div className="w-5 h-5 border-3 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                   <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                )}
                {submitting ? 'Inviando...' : 'Consegna Quiz'}
              </button>
            ) : (
              <button
                onClick={() => setCurrentQuestion(Math.min(totalQuestions - 1, currentQuestion + 1))}
                className="group flex items-center gap-2 bg-white text-slate-950 px-8 py-4 rounded-2xl font-black transition-all hover:bg-slate-200 active:scale-95 shadow-xl"
              >
                Prossima
                <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
              </button>
            )}
          </div>

          <div className="mt-8 flex flex-wrap gap-2 justify-center">
            {quiz.questions.map((q, idx) => {
              const isAnswered = q.questionType === 'MULTIPLE_CHOICE' ? !!answers[q.id] : !!textAnswers[q.id]?.trim();
              return (
                <button
                  key={q.id}
                  onClick={() => setCurrentQuestion(idx)}
                  className={`w-10 h-10 rounded-xl text-xs font-black transition-all active:scale-90 ${
                    idx === currentQuestion
                      ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20'
                      : isAnswered
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
                      : 'bg-white/5 text-slate-500 border border-white/5 hover:border-white/10'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
