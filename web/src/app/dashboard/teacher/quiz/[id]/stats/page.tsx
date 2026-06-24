'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Stats {
  quiz: {
    id: string;
    title: string;
    totalQuestions: number;
    totalAttempts: number;
  };
  stats: {
    totalAttempts: number;
    passedAttempts: number;
    averagePercentage: number;
    passRate: number;
  };
}

interface PendingAttempt {
  id: string;
  studentId: string;
  createdAt: string;
  submissions: {
    id: string;
    questionId: string;
    textAnswer: string;
    gradingStatus: string;
    points?: number;
    feedback?: string;
    answerId?: string | null;
    question: {
      text: string;
      points: number;
      questionType: string;
    };
    answer?: {
      id: string;
      text: string;
      isCorrect: boolean | null;
    } | null;
  }[];
}

interface Attempt {
  id: string;
  studentId: string;
  studentName: string;
  score: number;
  maxScore: number;
  percentage: number;
  passed: boolean | null;
  createdAt: string;
  completedAt: string | null;
  submissions: {
    id: string;
    questionId: string;
    textAnswer: string;
    answerId: string | null;
    points: number;
    gradingStatus: string;
    feedback: string | null;
    question: {
      id: string;
      text: string;
      questionType: string;
      points: number;
    };
    answer: {
      id: string;
      text: string;
      isCorrect: boolean | null;
    } | null;
  }[];
}

export default function QuizStatsPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [pendingGrading, setPendingGrading] = useState<PendingAttempt[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 0 });
  const [selectedAttempt, setSelectedAttempt] = useState<PendingAttempt | null>(null);
  const [selectedStudentAttempt, setSelectedStudentAttempt] = useState<Attempt | null>(null);
  const [grading, setGrading] = useState(false);

  const [gradingData, setGradingData] = useState<{ [submissionId: string]: { points: number; feedback: string } }>({});
  const [allAttemptsList, setAllAttemptsList] = useState<Attempt[]>([]);

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionData = await api.auth.verifySession();
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }
        if (sessionData.role !== 'TEACHER' && sessionData.role !== 'ADMIN') {
          router.push(`/dashboard/${sessionData.role?.toLowerCase()}`);
          return;
        }

        const fetchData = async () => {
          try {
            const [statsData, pendingData, attemptsData, allAttemptsData] = await Promise.all([
              api.quiz.getStats(quizId),
              api.quiz.getPendingGrading(quizId),
              api.quiz.getAttempts(quizId, 1, 10),
              api.quiz.getAllAttempts(quizId, true)
            ]);
            setStats(statsData);
            setPendingGrading(pendingData.attempts || []);
            setAttempts(attemptsData.attempts || []);
            setPagination(attemptsData.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
            setAllAttemptsList(allAttemptsData.attempts || []);
          } catch (err) {
            console.error(err);
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
  }, [quizId, router]);

  const fetchAttempts = async (page: number) => {
    try {
      const attemptsData = await api.quiz.getAttempts(quizId, page, 10);
      setAttempts(attemptsData.attempts || []);
      setPagination(attemptsData.pagination || { page, limit: 10, total: 0, totalPages: 0 });
    } catch (err) {
      console.error(err);
    }
  };

  const handleModifyGrade = (sub: any) => {
    setGradingData({
      [sub.id]: { 
        points: sub.points || 0, 
        feedback: sub.feedback || '' 
      }
    });
    setSelectedAttempt(selectedStudentAttempt as any);
  };

  const handleGradeSubmission = async (submissionId: string, points: number, feedback: string) => {
    setGrading(true);
    try {
      await api.quiz.gradeSubmission(quizId, selectedAttempt!.id, submissionId, points, feedback, 'ACCEPTED');
      
      const pendingData = await api.quiz.getPendingGrading(quizId);
      setPendingGrading(pendingData.attempts || []);
      
      if (selectedAttempt) {
        const updated = pendingData.attempts?.find((a: any) => a.id === selectedAttempt.id);
        if (updated) {
          setSelectedAttempt(updated);
        }
      }
      
      const statsData = await api.quiz.getStats(quizId);
      setStats(statsData);
    } catch (err) {
      console.error(err);
      alert('Errore nella valutazione');
    } finally {
      setGrading(false);
    }
  };

  const handleSaveAllGrades = async () => {
    if (!selectedAttempt) return;
    
    setGrading(true);
    try {
      for (const sub of selectedAttempt.submissions) {
        const data = gradingData[sub.id];
        
        if (!data) continue;
        
        if (sub.question.questionType === 'MULTIPLE_CHOICE') {
          if (data.feedback !== undefined && data.feedback !== null) {
            await api.quiz.updateFeedback(
              quizId, 
              selectedAttempt.id, 
              sub.id, 
              undefined,
              data.feedback
            );
          }
        } else {
          await api.quiz.gradeSubmission(
            quizId, 
            selectedAttempt.id, 
            sub.id, 
            data.points ?? 0, 
            data.feedback || '', 
            'ACCEPTED'
          );
        }
      }
      
      const pendingData = await api.quiz.getPendingGrading(quizId);
      setPendingGrading(pendingData.attempts || []);
      setSelectedAttempt(null);
      
      const statsData = await api.quiz.getStats(quizId);
      setStats(statsData);
    } catch (err) {
      console.error(err);
      alert('Errore nel salvataggio');
    } finally {
      setGrading(false);
    }
  };

  if (loading) return <div className="p-4 text-slate-300">Caricamento...</div>;

  return (
    <div className="text-slate-200">
      <button
        onClick={() => router.push(`/dashboard/teacher/quiz/${quizId}`)}
        className="mb-4 text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        ← Torna al Questionario
      </button>

      <h1 className="text-2xl font-bold mb-6 text-white">Statistiche - {stats?.quiz.title}</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
          <h3 className="text-sm text-slate-400 mb-1">Totale Tentativi</h3>
          <p className="text-3xl font-bold text-cyan-400">{stats?.stats.totalAttempts}</p>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
          <h3 className="text-sm text-slate-400 mb-1">Superati</h3>
          <p className="text-3xl font-bold text-emerald-400">{stats?.stats.passedAttempts}</p>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
          <h3 className="text-sm text-slate-400 mb-1">Media Voto</h3>
          <p className="text-3xl font-bold text-white">{stats?.stats.averagePercentage}%</p>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
          <h3 className="text-sm text-slate-400 mb-1">Tasso Superamento</h3>
          <p className="text-3xl font-bold text-purple-400">{stats?.stats.passRate}%</p>
        </div>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6 mb-6">
        <h2 className="text-xl font-bold mb-4 text-white">Da Valutare</h2>
        
        {pendingGrading.length === 0 ? (
          <p className="text-slate-400">Nessuna risposta aperta da valutare.</p>
        ) : (
          <div className="space-y-4">
            {pendingGrading.map((attempt) => (
              <div key={attempt.id} className="border border-white/10 rounded-xl p-4 bg-white/5">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <p className="font-medium text-white">Tentativo: {attempt.id.slice(0, 8)}...</p>
                    <p className="text-sm text-slate-400">
                      {new Date(attempt.createdAt).toLocaleString('it-IT')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedAttempt(attempt);
                      const initialData: any = {};
                      attempt.submissions.forEach(s => {
                        initialData[s.id] = { 
                          points: s.points || 0, 
                          feedback: s.feedback || '' 
                        };
                      });
                      setGradingData(initialData);
                    }}
                    className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-3 py-1 rounded-xl text-sm transition-colors"
                  >
                    Valuta
                  </button>
                </div>
                <p className="text-sm text-slate-400">
                  {attempt.submissions.length} risposte aperte in attesa
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6">
        <h2 className="text-xl font-bold mb-4 text-white">Studenti</h2>
        
        {attempts.length === 0 ? (
          <p className="text-slate-400">Nessun tentativo ancora registrato.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-2 px-2 text-slate-400">Studente</th>
                    <th className="text-center py-2 px-2 text-slate-400">Tentativi</th>
                    <th className="text-center py-2 px-2 text-slate-400">Miglior Punteggio</th>
                    <th className="text-center py-2 px-2 text-slate-400">Ultimo Tentativo</th>
                    <th className="text-center py-2 px-2 text-slate-400">Stato</th>
                    <th className="text-center py-2 px-2 text-slate-400">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((attempt) => (
                    <tr key={attempt.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2 px-2 font-medium text-white">{attempt.studentName}</td>
                      <td className="text-center py-2 px-2 text-slate-300">1</td>
                      <td className="text-center py-2 px-2">
                        <span className={attempt.passed ? 'text-emerald-400 font-semibold' : 'text-slate-300'}>
                          {attempt.percentage}%
                        </span>
                      </td>
                      <td className="text-center py-2 px-2 text-slate-400">
                        {attempt.completedAt ? new Date(attempt.completedAt).toLocaleDateString('it-IT') : '-'}
                      </td>
                      <td className="text-center py-2 px-2">
                        {attempt.passed === true && (
                          <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-xs border border-emerald-500/20">Superato</span>
                        )}
                        {attempt.passed === false && (
                          <span className="bg-red-500/10 text-red-400 px-2 py-1 rounded text-xs border border-red-500/20">Non superato</span>
                        )}
                        {attempt.passed === null && (
                          <span className="bg-yellow-500/10 text-yellow-400 px-2 py-1 rounded text-xs border border-yellow-500/20">In attesa</span>
                        )}
                      </td>
                      <td className="text-center py-2 px-2">
                        <button
                          onClick={() => setSelectedStudentAttempt(attempt)}
                          className="text-cyan-400 hover:text-cyan-300 hover:underline text-xs transition-colors"
                        >
                          Dettagli
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-4">
                <button
                  onClick={() => fetchAttempts(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="px-3 py-1 rounded-xl border border-white/10 bg-white/5 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                >
                  Precedente
                </button>
                <span className="text-sm text-slate-400">
                  Pagina {pagination.page} di {pagination.totalPages}
                </span>
                <button
                  onClick={() => fetchAttempts(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1 rounded-xl border border-white/10 bg-white/5 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-white/10 transition-colors"
                >
                  Successiva
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedStudentAttempt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/10 rounded-[40px] p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold text-white">Dettagli Studente</h2>
                <p className="text-slate-400">{selectedStudentAttempt.studentName}</p>
              </div>
              <button
                onClick={() => setSelectedStudentAttempt(null)}
                className="text-slate-500 hover:text-white text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-6 text-sm">
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <p className="text-slate-400">Punteggio</p>
                <p className="font-semibold text-white">{selectedStudentAttempt.percentage}%</p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <p className="text-slate-400">Punti</p>
                <p className="font-semibold text-white">{selectedStudentAttempt.score}/{selectedStudentAttempt.maxScore}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <p className="text-slate-400">Stato</p>
                <p className={`font-semibold ${selectedStudentAttempt.passed ? 'text-emerald-400' : selectedStudentAttempt.passed === false ? 'text-red-400' : 'text-yellow-400'}`}>
                  {selectedStudentAttempt.passed === true ? 'Superato' : selectedStudentAttempt.passed === false ? 'Non superato' : 'In attesa'}
                </p>
              </div>
              <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                <p className="text-slate-400">Data</p>
                <p className="font-semibold text-white">{selectedStudentAttempt.completedAt ? new Date(selectedStudentAttempt.completedAt).toLocaleDateString('it-IT') : '-'}</p>
              </div>
            </div>

            <h3 className="font-bold mb-3 text-white">Risposte</h3>
            <div className="space-y-4">
              {selectedStudentAttempt.submissions.map((sub, idx) => (
                <div key={sub.id} className={`border p-4 rounded-xl ${sub.question.questionType === 'OPEN_ANSWER' ? 'bg-yellow-500/5 border-yellow-500/20' : sub.answer?.isCorrect ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <p className="font-medium text-white">Domanda {idx + 1}: {sub.question.text}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm bg-white/5 px-2 py-1 rounded text-slate-300">
                        {sub.points !== undefined ? `${sub.points}/${sub.question.points} punti` : 'Non valutata'}
                      </span>
                      {(sub.question.questionType === 'MULTIPLE_CHOICE' || sub.question.questionType === 'OPEN_ANSWER') && (
                        <button
                          onClick={() => handleModifyGrade(sub)}
                          className="text-xs bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 px-2 py-1 rounded border border-cyan-500/20 transition-colors"
                        >
                          {sub.feedback ? 'Modifica' : 'Feedback'}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {sub.question.questionType === 'MULTIPLE_CHOICE' ? (
                    <div className="ml-4">
                      <p className="text-sm text-slate-400">Risposta selezionata: <span className="font-medium text-white">{sub.answer?.text || '-'}</span></p>
                      {sub.answer?.isCorrect === true && <span className="text-xs text-emerald-400 font-medium ml-2">✓ Corretta</span>}
                      {sub.answer?.isCorrect === false && <span className="text-xs text-red-400 font-medium ml-2">✗ Sbagliata</span>}
                    </div>
                  ) : (
                    <div className="ml-4">
                      <p className="text-sm text-slate-400 mb-1">Risposta:</p>
                      <p className="bg-white/5 p-3 rounded text-white">{sub.textAnswer || '(nessuna risposta)'}</p>
                      {sub.feedback && (
                        <div className="mt-2 p-2 bg-cyan-500/10 rounded text-sm border border-cyan-500/20">
                          <p className="font-medium text-cyan-400">Feedback:</p>
                          <p className="text-cyan-300">{sub.feedback}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setSelectedStudentAttempt(null)}
                className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-xl transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedAttempt && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/10 rounded-[40px] p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Valutazione Risposte Aperte</h2>
              <button
                onClick={() => setSelectedAttempt(null)}
                className="text-slate-500 hover:text-white text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              {selectedAttempt.submissions.map((sub) => (
                <div key={sub.id} className="border border-white/10 p-4 rounded-xl bg-white/5">
                  <h3 className="font-semibold mb-2 text-white">{sub.question.text}</h3>
                  
                  {sub.question.questionType === 'MULTIPLE_CHOICE' ? (
                    <div className="mb-3">
                      <p className="text-slate-400 mb-2">Risposta selezionata:</p>
                      <p className="bg-white/5 p-3 rounded text-white">
                        {sub.answer?.text || '(nessuna risposta)'}
                      </p>
                      {sub.answer?.isCorrect === true && (
                        <span className="text-xs text-emerald-400 font-medium ml-2">✓ Corretta</span>
                      )}
                      {sub.answer?.isCorrect === false && (
                        <span className="text-xs text-red-400 font-medium ml-2">✗ Sbagliata</span>
                      )}
                    </div>
                  ) : (
                    <p className="text-slate-400 mb-3 bg-white/5 p-3 rounded text-white">
                      {sub.textAnswer || '(nessuna risposta)'}
                    </p>
                  )}
                  
                  <div className="grid grid-cols-2 gap-4">
                    {sub.question.questionType === 'OPEN_ANSWER' ? (
                      <div>
                        <label className="block text-sm font-medium mb-1 text-slate-300">Punti (max {sub.question.points})</label>
                        <input
                          type="number"
                          value={gradingData[sub.id]?.points ?? 0}
                          onChange={(e) => setGradingData({
                            ...gradingData,
                            [sub.id]: { ...gradingData[sub.id], points: parseFloat(e.target.value) }
                          })}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          min={0}
                          max={sub.question.points}
                          step={0.5}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <span className="text-sm text-slate-400">
                          Punti: {sub.points}/{sub.question.points} (automatici)
                        </span>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium mb-1 text-slate-300">Feedback</label>
                      <input
                        type="text"
                        value={gradingData[sub.id]?.feedback ?? ''}
                        onChange={(e) => setGradingData({
                          ...gradingData,
                          [sub.id]: { ...gradingData[sub.id], feedback: e.target.value }
                        })}
                        placeholder="Feedback opzionale"
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <button
                onClick={() => setSelectedAttempt(null)}
                className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-xl transition-colors"
              >
                Annulla
              </button>
              <button
                onClick={handleSaveAllGrades}
                disabled={grading}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
              >
                {grading ? 'Salvataggio...' : 'Salva Tutto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}