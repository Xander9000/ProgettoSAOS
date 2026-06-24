'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Quiz {
  id: string;
  title: string;
  description: string | null;
  courseId: string;
  courseTitle: string;
  status: string;
  quizType: string;
  _count: { questions: number; attempts: number };
}

export default function TeacherQuizPage() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [filteredQuizzes, setFilteredQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [courses, setCourses] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);

  const [filters, setFilters] = useState({
    search: '',
    courseId: '',
    status: ''
  });

  const [newQuiz, setNewQuiz] = useState({
    courseId: '',
    title: '',
    description: '',
    quizType: 'CUSTOM',
    maxAttempts: 3,
    shuffleQuestions: false,
    shuffleAnswers: false,
    showResultsImmediately: true,
    passingScore: 70,
    timeLimit: ''
  });

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
            const [quizzesData, coursesData] = await Promise.all([
              api.quiz.myCoursesQuizzes(),
              api.courses.myCourses()
            ]);
            setQuizzes(quizzesData.quizzes || []);
            setCourses(coursesData || []);
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
  }, [router]);

  useEffect(() => {
    let result = quizzes;
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(q => 
        q.title.toLowerCase().includes(searchLower) ||
        q.description?.toLowerCase().includes(searchLower) ||
        q.courseTitle.toLowerCase().includes(searchLower)
      );
    }
    
    if (filters.courseId) {
      result = result.filter(q => q.courseId === filters.courseId);
    }
    
    if (filters.status) {
      result = result.filter(q => q.status === filters.status);
    }
    
    setFilteredQuizzes(result);
  }, [filters, quizzes]);

  const handleCreateQuiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const data: any = {
        courseId: newQuiz.courseId,
        title: newQuiz.title,
        description: newQuiz.description || undefined,
        quizType: newQuiz.quizType,
        shuffleQuestions: newQuiz.shuffleQuestions,
        shuffleAnswers: newQuiz.shuffleAnswers,
        showResultsImmediately: newQuiz.showResultsImmediately,
        passingScore: newQuiz.passingScore,
        timeLimit: newQuiz.timeLimit ? parseInt(newQuiz.timeLimit) : undefined
      };

      if (newQuiz.quizType === 'CUSTOM') {
        data.maxAttempts = newQuiz.maxAttempts;
      }

      const result = await api.quiz.create(
        data.courseId,
        data.title,
        data.description,
        data.quizType,
        data.maxAttempts,
        data.shuffleQuestions,
        data.shuffleAnswers,
        data.showResultsImmediately,
        data.passingScore,
        data.timeLimit
      );

      if (result.success) {
        setShowCreateModal(false);
        setNewQuiz({
          courseId: '',
          title: '',
          description: '',
          quizType: 'CUSTOM',
          maxAttempts: 3,
          shuffleQuestions: false,
          shuffleAnswers: false,
          showResultsImmediately: true,
          passingScore: 70,
          timeLimit: ''
        });
        const quizzesData = await api.quiz.myCoursesQuizzes();
        setQuizzes(quizzesData.quizzes || []);
      }
    } catch (err) {
      console.error(err);
      alert('Errore nella creazione del quiz');
    } finally {
      setCreating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return <span className="bg-emerald-500/10 text-emerald-400 px-2 py-1 rounded text-sm border border-emerald-500/20">Pubblicato</span>;
      case 'ARCHIVED':
        return <span className="bg-slate-500/10 text-slate-400 px-2 py-1 rounded text-sm border border-slate-500/20">Archiviato</span>;
      default:
        return <span className="bg-amber-500/10 text-amber-400 px-2 py-1 rounded text-sm border border-amber-500/20">Bozza</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'ESAME':
        return <span className="bg-red-500/10 text-red-400 px-2 py-1 rounded text-sm border border-red-500/20">Esame</span>;
      case 'PREPARAZIONE':
        return <span className="bg-blue-500/10 text-blue-400 px-2 py-1 rounded text-sm border border-blue-500/20">Preparazione</span>;
      default:
        return <span className="bg-purple-500/10 text-purple-400 px-2 py-1 rounded text-sm border border-purple-500/20">Custom</span>;
    }
  };

  if (loading) return <div className="p-4 text-slate-300">Caricamento...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Gestione Quiz</h1>
          <p className="text-slate-400 mt-2">Crea e monitora i questionari dei tuoi corsi.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-6 py-3 rounded-2xl transition-all shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuovo Quiz
        </button>
      </div>

      <div className="bg-slate-900/50 backdrop-blur-md border border-white/5 p-6 rounded-3xl">
        <div className="flex flex-wrap gap-6 items-end">
          <div className="flex-1 min-w-[280px]">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 ml-1">Cerca</label>
            <div className="relative">
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input
                    type="text"
                    placeholder="Titolo, descrizione o corso..."
                    value={filters.search}
                    onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                    className="w-full bg-slate-800/50 border border-white/5 rounded-2xl pl-12 pr-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder:text-slate-600"
                />
            </div>
          </div>
          <div className="w-64">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 ml-1">Filtra per Corso</label>
            <select
              value={filters.courseId}
              onChange={(e) => setFilters({ ...filters, courseId: e.target.value })}
              className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
            >
              <option value="" className="bg-slate-900">Tutti i corsi</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id} className="bg-slate-900">{course.title}</option>
              ))}
            </select>
          </div>
          <div className="w-48">
            <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2 ml-1">Stato</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all"
            >
              <option value="" className="bg-slate-900">Qualsiasi Stato</option>
              <option value="DRAFT" className="bg-slate-900">Bozza</option>
              <option value="PUBLISHED" className="bg-slate-900">Pubblicato</option>
              <option value="ARCHIVED" className="bg-slate-900">Archiviato</option>
            </select>
          </div>
          {(filters.search || filters.courseId || filters.status) && (
            <button
              onClick={() => setFilters({ search: '', courseId: '', status: '' })}
              className="h-[46px] px-6 text-xs font-bold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-2xl transition-all"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">
        {filteredQuizzes.length === quizzes.length 
          ? `Totale: ${filteredQuizzes.length} Quiz`
          : `Risultati: ${filteredQuizzes.length} di ${quizzes.length}`}
      </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredQuizzes.map((quiz) => (
            <div key={quiz.id} className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[32px] hover:border-cyan-500/30 transition-all duration-300 transform hover:-translate-y-1">
               <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-purple-400 border border-white/5">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                   <div className="flex gap-1.5">
                      <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                          quiz.status === 'PUBLISHED' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {quiz.status}
                        </span>
                        <span className="text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-md border bg-white/5 text-slate-400 border-white/5">
                            {quiz.quizType}
                        </span>
                   </div>
                </div>
              </div>

              <h2 className="text-xl font-bold text-white mb-1 group-hover:text-purple-400 transition-colors line-clamp-1">{quiz.title}</h2>
              <p className="text-[10px] font-black uppercase tracking-widest text-cyan-400 mb-4">{quiz.courseTitle}</p>
              <p className="text-slate-400 text-sm mb-6 line-clamp-2 h-10">{quiz.description || 'Nessuna descrizione fornita.'}</p>
              
              <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-slate-500 mb-8 pt-4 border-t border-white/5">
                <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>{quiz._count.questions} Domande</span>
                <span className="flex items-center gap-1.5"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>{quiz._count.attempts} Tentativi</span>
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => router.push(`/dashboard/teacher/quiz/${quiz.id}`)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-bold py-3.5 rounded-2xl border border-white/5 transition-all active:scale-95"
                >
                  Gestisci
                </button>
                {quiz.status === 'DRAFT' ? (
                  <button
                    onClick={async () => {
                      try {
                        await api.quiz.publish(quiz.id);
                        const quizzesData = await api.quiz.myCoursesQuizzes();
                        setQuizzes(quizzesData.quizzes || []);
                      } catch (err) {
                        console.error(err);
                      }
                    }}
                    className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-slate-900 text-xs font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-emerald-500/10 active:scale-95"
                  >
                    Pubblica
                  </button>
                ) : (
                  <button
                    onClick={() => router.push(`/dashboard/teacher/quiz/${quiz.id}/stats`)}
                    className="flex-1 bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white text-xs font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-purple-500/10 active:scale-95"
                  >
                    Statistiche
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

      {filteredQuizzes.length === 0 && quizzes.length > 0 && (
        <div className="text-center py-20 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[40px]">
          <p className="text-slate-500 font-medium mb-6">Nessun questionario corrisponde ai filtri applicati.</p>
          <button
            onClick={() => setFilters({ search: '', courseId: '', status: '' })}
            className="bg-white/5 hover:bg-white/10 text-cyan-400 font-bold px-8 py-4 rounded-2xl border border-cyan-500/20 transition-all"
          >
            Pulisci filtri
          </button>
        </div>
      )}

      {quizzes.length === 0 && (
        <div className="text-center py-20 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[40px]">
          <p className="text-slate-500 font-medium mb-8">Non hai ancora creato questionari per i tuoi corsi.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-8 py-4 rounded-2xl transition-all shadow-lg shadow-cyan-500/20"
          >
            Crea il primo questionario
          </button>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-white/10 rounded-[40px] p-8 md:p-12 max-w-xl w-full shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black text-white tracking-tight">Nuovo Quiz 📝</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 text-slate-500 hover:text-white transition-colors"
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleCreateQuiz} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">Corso di Riferimento *</label>
                    <select
                        value={newQuiz.courseId}
                        onChange={(e) => setNewQuiz({ ...newQuiz, courseId: e.target.value })}
                        className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium"
                        required
                    >
                        <option value="" className="bg-slate-900">Seleziona un corso</option>
                        {courses.map((course) => (
                        <option key={course.id} value={course.id} className="bg-slate-900">
                            {course.title}
                        </option>
                        ))}
                    </select>
                </div>

                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">Tipologia Quiz *</label>
                    <select
                        value={newQuiz.quizType}
                        onChange={(e) => setNewQuiz({ ...newQuiz, quizType: e.target.value })}
                        className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium"
                    >
                        <option value="ESAME" className="bg-slate-900">Esame (1 tentativo)</option>
                        <option value="PREPARAZIONE" className="bg-slate-900">Preparazione (illimitati)</option>
                        <option value="CUSTOM" className="bg-slate-900">Customizzato</option>
                    </select>
                </div>

                <div className="col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">Titolo del Questionario *</label>
                    <input
                        type="text"
                        value={newQuiz.title}
                        onChange={(e) => setNewQuiz({ ...newQuiz, title: e.target.value })}
                        className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium placeholder:text-slate-600"
                        placeholder="Es: Test Finale Modulo 1"
                        required
                    />
                </div>

                <div className="col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">Descrizione Breve</label>
                    <textarea
                        value={newQuiz.description}
                        onChange={(e) => setNewQuiz({ ...newQuiz, description: e.target.value })}
                        className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium placeholder:text-slate-600 min-h-[100px]"
                        placeholder="Inserisci una breve introduzione al quiz..."
                        rows={3}
                    />
                </div>

                {newQuiz.quizType === 'CUSTOM' && (
                    <div className="col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">Max Tentativi</label>
                    <input
                        type="number"
                        value={newQuiz.maxAttempts}
                        onChange={(e) => setNewQuiz({ ...newQuiz, maxAttempts: parseInt(e.target.value) })}
                        className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium"
                        min={1}
                        max={100}
                    />
                    </div>
                )}

                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">Soglia Superamento (%)</label>
                    <input
                        type="number"
                        value={newQuiz.passingScore}
                        onChange={(e) => setNewQuiz({ ...newQuiz, passingScore: parseInt(e.target.value) })}
                        className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium"
                        min={0}
                        max={100}
                    />
                </div>

                <div className="col-span-2 md:col-span-1">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">Timer (minuti)</label>
                    <input
                        type="number"
                        value={newQuiz.timeLimit}
                        onChange={(e) => setNewQuiz({ ...newQuiz, timeLimit: e.target.value })}
                        className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-3.5 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all font-medium placeholder:text-slate-600"
                        min={1}
                        placeholder="Lascia vuoto per nessun limite"
                    />
                </div>
              </div>

              <div className="space-y-4 py-4 border-y border-white/5">
                <label className="flex items-center gap-3 group cursor-pointer">
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            checked={newQuiz.shuffleQuestions}
                            onChange={(e) => setNewQuiz({ ...newQuiz, shuffleQuestions: e.target.checked })}
                            className="w-5 h-5 rounded-lg bg-slate-800 border-white/10 text-cyan-500 focus:ring-offset-slate-900 transition-all cursor-pointer"
                        />
                    </div>
                    <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Mescola l'ordine delle domande</span>
                </label>
                <label className="flex items-center gap-3 group cursor-pointer">
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            checked={newQuiz.shuffleAnswers}
                            onChange={(e) => setNewQuiz({ ...newQuiz, shuffleAnswers: e.target.checked })}
                            className="w-5 h-5 rounded-lg bg-slate-800 border-white/10 text-cyan-500 focus:ring-offset-slate-900 transition-all cursor-pointer"
                        />
                    </div>
                    <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Mescola le opzioni di risposta</span>
                </label>
                <label className="flex items-center gap-3 group cursor-pointer">
                    <div className="relative flex items-center">
                        <input
                            type="checkbox"
                            checked={newQuiz.showResultsImmediately}
                            onChange={(e) => setNewQuiz({ ...newQuiz, showResultsImmediately: e.target.checked })}
                            className="w-5 h-5 rounded-lg bg-slate-800 border-white/10 text-cyan-500 focus:ring-offset-slate-900 transition-all cursor-pointer"
                        />
                    </div>
                    <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">Mostra correzione immediata</span>
                </label>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-4 rounded-2xl transition-all"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-4 px-10 rounded-2xl transition-all disabled:opacity-50 shadow-lg shadow-cyan-500/20"
                >
                  {creating ? 'Creazione in corso...' : 'Crea Questionario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
