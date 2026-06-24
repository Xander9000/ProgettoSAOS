'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';

interface Question {
  id: string;
  text: string;
  order: number;
  questionType: string;
  points: number;
  answers: { id: string; text: string; isCorrect: boolean; order: number }[];
}

interface QuizSettings {
  id: string;
  title: string;
  description: string | null;
  courseId: string;
  status: string;
  quizType: string;
  maxAttempts: number;
  shuffleQuestions: boolean;
  shuffleAnswers: boolean;
  showResultsImmediately: boolean;
  passingScore: number;
  timeLimit: number | null;
  enableNegativePoints: boolean;
  negativePointsValue: number;
  _count: { questions: number; attempts: number };
}

export default function QuizDetailPage() {
  const router = useRouter();
  const params = useParams();
  const quizId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<QuizSettings | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [showAnswerModal, setShowAnswerModal] = useState<string | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);

  const [newSettings, setNewSettings] = useState({
    title: '',
    description: '',
    quizType: 'CUSTOM',
    maxAttempts: 3,
    shuffleQuestions: false,
    shuffleAnswers: false,
    showResultsImmediately: true,
    passingScore: 70,
    timeLimit: '',
    enableNegativePoints: false,
    negativePointsValue: 0.5
  });

  const [newQuestion, setNewQuestion] = useState({
    text: '',
    questionType: 'MULTIPLE_CHOICE',
    points: 1,
    answers: [
      { text: '', isCorrect: true },
      { text: '', isCorrect: false }
    ]
  });

  const [newAnswer, setNewAnswer] = useState({ text: '', isCorrect: false });

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

        const fetchQuiz = async () => {
          try {
            const [settingsData, quizData] = await Promise.all([
              api.quiz.getSettings(quizId),
              api.quiz.get(quizId)
            ]);
            setSettings(settingsData);
            setQuestions(quizData.questions || []);
            setNewSettings({
              title: settingsData.title,
              description: settingsData.description || '',
              quizType: settingsData.quizType,
              maxAttempts: settingsData.maxAttempts,
              shuffleQuestions: settingsData.shuffleQuestions,
              shuffleAnswers: settingsData.shuffleAnswers,
              showResultsImmediately: settingsData.showResultsImmediately,
              passingScore: settingsData.passingScore,
              timeLimit: settingsData.timeLimit?.toString() || '',
              enableNegativePoints: settingsData.enableNegativePoints || false,
              negativePointsValue: settingsData.negativePointsValue || 0.5
            });
          } catch {
            alert('Errore nel caricamento del quiz');
            router.push('/dashboard/teacher/quiz');
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

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const data: any = {
        title: newSettings.title,
        description: newSettings.description || undefined,
        quizType: newSettings.quizType,
        shuffleQuestions: newSettings.shuffleQuestions,
        shuffleAnswers: newSettings.shuffleAnswers,
        showResultsImmediately: newSettings.showResultsImmediately,
        passingScore: newSettings.passingScore,
        timeLimit: newSettings.timeLimit ? parseInt(newSettings.timeLimit) : undefined,
        enableNegativePoints: newSettings.enableNegativePoints,
        negativePointsValue: newSettings.negativePointsValue
      };

      if (newSettings.quizType === 'CUSTOM') {
        data.maxAttempts = newSettings.maxAttempts;
      }

      await api.quiz.update(quizId, data);
      setShowSettingsModal(false);
      
      const settingsData = await api.quiz.getSettings(quizId);
      setSettings(settingsData);
    } catch {
      alert('Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.text.trim()) {
      alert('Inserisci il testo della domanda');
      return;
    }

    if (newQuestion.questionType === 'MULTIPLE_CHOICE') {
      const validAnswers = newQuestion.answers.filter(a => a.text.trim());
      if (validAnswers.length < 2) {
        alert('Inserisci almeno 2 risposte');
        return;
      }
      if (!validAnswers.some(a => a.isCorrect)) {
        alert('Seleziona almeno una risposta corretta');
        return;
      }
    }

    setSaving(true);
    try {
      await api.quiz.addQuestion(
        quizId,
        newQuestion.text,
        newQuestion.questionType,
        newQuestion.points,
        newQuestion.questionType === 'MULTIPLE_CHOICE' ? newQuestion.answers : undefined
      );

      setShowQuestionModal(false);
      setNewQuestion({
        text: '',
        questionType: 'MULTIPLE_CHOICE',
        points: 1,
        answers: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false }
        ]
      });

      const quizData = await api.quiz.get(quizId);
      setQuestions(quizData.questions || []);
      
      const settingsData = await api.quiz.getSettings(quizId);
      setSettings(settingsData);
    } catch {
      alert('Errore nell\'aggiunta della domanda');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateQuestion = async () => {
    if (!editingQuestion || !newQuestion.text.trim()) {
      return;
    }

    setSaving(true);
    try {
      await api.quiz.updateQuestion(quizId, editingQuestion.id, {
        text: newQuestion.text,
        questionType: newQuestion.questionType,
        points: newQuestion.points
      });

      setShowQuestionModal(false);
      setEditingQuestion(null);
      setNewQuestion({
        text: '',
        questionType: 'MULTIPLE_CHOICE',
        points: 1,
        answers: [
          { text: '', isCorrect: true },
          { text: '', isCorrect: false }
        ]
      });

      const quizData = await api.quiz.get(quizId);
      setQuestions(quizData.questions || []);
    } catch {
      alert('Errore nella modifica della domanda');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questa domanda?')) return;

    try {
      await api.quiz.deleteQuestion(quizId, questionId);
      const quizData = await api.quiz.get(quizId);
      setQuestions(quizData.questions || []);
      
      const settingsData = await api.quiz.getSettings(quizId);
      setSettings(settingsData);
    } catch {
      alert('Errore nell\'eliminazione');
    }
  };

  const handleAddAnswer = async (questionId: string) => {
    if (!newAnswer.text.trim()) {
      alert('Inserisci il testo della risposta');
      return;
    }

    try {
      await api.quiz.addAnswer(quizId, questionId, newAnswer.text, newAnswer.isCorrect);
      setShowAnswerModal(null);
      setNewAnswer({ text: '', isCorrect: false });
      
      const quizData = await api.quiz.get(quizId);
      setQuestions(quizData.questions || []);
    } catch {
      alert('Errore nell\'aggiunta della risposta');
    }
  };

  const handleToggleCorrect = async (questionId: string, answerId: string, isCorrect: boolean) => {
    try {
      await api.quiz.updateAnswer(quizId, questionId, answerId, { isCorrect: !isCorrect });
      const quizData = await api.quiz.get(quizId);
      setQuestions(quizData.questions || []);
    } catch {
    }
  };

  const handleDeleteAnswer = async (questionId: string, answerId: string) => {
    try {
      await api.quiz.deleteAnswer(quizId, questionId, answerId);
      const quizData = await api.quiz.get(quizId);
      setQuestions(quizData.questions || []);
    } catch {
    }
  };

  const openEditQuestion = (question: Question) => {
    setEditingQuestion(question);
    setNewQuestion({
      text: question.text,
      questionType: question.questionType,
      points: question.points,
      answers: question.answers.map(a => ({ text: a.text, isCorrect: a.isCorrect }))
    });
    setShowQuestionModal(true);
  };

  const handlePreview = async () => {
    try {
      const previewData = await api.quiz.preview(quizId);
      const previewWindow = window.open('', '_blank');
      if (previewWindow) {
        const html = generatePreviewHtml(previewData);
        previewWindow.document.write(html);
        previewWindow.document.close();
      }
    } catch {
      alert('Errore nel caricamento preview');
    }
  };

  function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function generatePreviewHtml(data: any): string {
    let questionsHtml = '';
    for (let i = 0; i < data.questions.length; i++) {
      const q = data.questions[i];
      let answersHtml = '';
      if (q.questionType === 'MULTIPLE_CHOICE') {
        for (let j = 0; j < q.answers.length; j++) {
          answersHtml += '<div class="answer">' + escapeHtml(q.answers[j].text) + '</div>';
        }
      }
      questionsHtml += '<div class="question"><div class="question-number">Domanda ' + (i + 1) + '</div>' +
        '<div class="question-text">' + escapeHtml(q.text) + '</div>' +
        (q.questionType === 'MULTIPLE_CHOICE' ? '<div class="answers">' + answersHtml + '</div>' : '<em>Risposta aperta</em>') +
        '<div class="points">' + q.points + (q.points !== 1 ? ' punti' : ' punto') + '</div></div>';
    }

    const negativeHtml = data.enableNegativePoints ? 
      '<p class="negative"><strong>Punti negativi abilitati:</strong> -' + escapeHtml(String(data.negativePointsValue)) + ' punti per ogni risposta errata</p>' : '';

    return '<!DOCTYPE html><html><head><title>Preview: ' + escapeHtml(data.title) + '</title>' +
      '<style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px}' +
      '.question{margin-bottom:24px;padding:16px;border:1px solid #ddd;border-radius:8px}' +
      '.question-number{color:#666;font-size:14px}.question-text{font-size:18px;margin:8px 0}' +
      '.answer{margin:8px 0;padding:8px;border-radius:4px;background:#f9f9f9}' +
      '.points{color:#666;font-size:14px}.negative{color:#d00;font-size:14px;margin-bottom:16px}</style></head>' +
      '<body><h1>' + escapeHtml(data.title) + '</h1>' +
      (data.description ? '<p>' + escapeHtml(data.description) + '</p>' : '') +
      negativeHtml + questionsHtml + '</body></html>';
  }

  if (loading) return <div className="p-4 text-slate-300">Caricamento...</div>;
  if (!settings) return <div className="p-4 text-slate-300">Quiz non trovato</div>;

  return (
    <div className="text-slate-200">
      <button
        onClick={() => router.push('/dashboard/teacher/quiz')}
        className="mb-4 text-cyan-400 hover:text-cyan-300 transition-colors"
      >
        ← Torna ai Questionari
      </button>

      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{settings.title}</h1>
          <p className="text-slate-400">
            {settings.status === 'PUBLISHED' ? 'Pubblicato' : 'Bozza'} - {settings.quizType}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handlePreview}
            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl transition-colors"
          >
            Preview
          </button>
          <button
            onClick={() => setShowSettingsModal(true)}
            className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-xl transition-colors"
          >
            Impostazioni
          </button>
          {settings.status === 'DRAFT' && (
            <button
              onClick={async () => {
                try {
                  await api.quiz.publish(quizId);
                  const settingsData = await api.quiz.getSettings(quizId);
                  setSettings(settingsData);
                  } catch {
                    alert('Errore nella pubblicazione');
                }
              }}
              className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-xl transition-colors"
            >
              Pubblica
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold mb-2 text-slate-300">Domande</h3>
          <p className="text-3xl font-bold text-cyan-400">{settings._count.questions}</p>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold mb-2 text-slate-300">Tentativi</h3>
          <p className="text-3xl font-bold text-emerald-400">{settings._count.attempts}</p>
        </div>
        <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
          <h3 className="font-semibold mb-2 text-slate-300">Tipo</h3>
          <p className="text-xl font-semibold text-white">{settings.quizType}</p>
          <p className="text-sm text-slate-400">
            {settings.maxAttempts === -1 ? 'Illimitati' : settings.maxAttempts === 1 ? '1 tentativo' : `${settings.maxAttempts} tentativi`}
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-white">Domande</h2>
        <button
          onClick={() => {
            setEditingQuestion(null);
            setNewQuestion({
              text: '',
              questionType: 'MULTIPLE_CHOICE',
              points: 1,
              answers: [
                { text: '', isCorrect: true },
                { text: '', isCorrect: false }
              ]
            });
            setShowQuestionModal(true);
          }}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-4 py-2 rounded-xl transition-colors"
        >
          + Aggiungi Domanda
        </button>
      </div>

      <div className="space-y-4">
        {questions.length === 0 ? (
          <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-8 text-center">
            <p className="text-slate-400 mb-4">Nessuna domanda ancora.</p>
            <button
              onClick={() => setShowQuestionModal(true)}
              className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-4 py-2 rounded-xl transition-colors"
            >
              Aggiungi la prima domanda
            </button>
          </div>
        ) : (
          questions.map((question, qIdx) => (
            <div key={question.id} className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="text-sm text-slate-500">#{qIdx + 1}</span>
                  <h3 className="text-lg font-semibold text-white">{question.text}</h3>
                  <div className="flex gap-2 mt-1">
                    <span className="text-xs bg-white/5 text-slate-300 px-2 py-1 rounded border border-white/10">
                      {question.questionType === 'MULTIPLE_CHOICE' ? 'Scelta multipla' : 'Risposta aperta'}
                    </span>
                    <span className="text-xs bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded border border-cyan-500/20">
                      {question.points} punti
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditQuestion(question)}
                    className="text-cyan-400 hover:text-cyan-300 hover:underline text-sm transition-colors"
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => handleDeleteQuestion(question.id)}
                    className="text-red-400 hover:text-red-300 hover:underline text-sm transition-colors"
                  >
                    Elimina
                  </button>
                </div>
              </div>

              {question.questionType === 'MULTIPLE_CHOICE' && (
                <div className="ml-4 space-y-2">
                  {question.answers.sort((a, b) => a.order - b.order).map((answer) => (
                    <div key={answer.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={answer.isCorrect}
                        onChange={() => handleToggleCorrect(question.id, answer.id, answer.isCorrect)}
                        className="rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
                      />
                      <span className={answer.isCorrect ? 'font-semibold text-green-400' : 'text-slate-300'}>
                        {answer.text}
                      </span>
                      <button
                        onClick={() => handleDeleteAnswer(question.id, answer.id)}
                        className="text-red-500 hover:text-red-400 text-sm"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {question.answers.length < 6 && (
                    <button
                      onClick={() => setShowAnswerModal(question.id)}
                      className="text-cyan-400 hover:text-cyan-300 hover:underline text-sm transition-colors"
                    >
                      + Aggiungi risposta
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {showSettingsModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/10 rounded-[40px] p-6 max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Impostazioni Questionario</h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-slate-500 hover:text-white text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Titolo</label>
                <input
                  type="text"
                  value={newSettings.title}
                  onChange={(e) => setNewSettings({ ...newSettings, title: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Descrizione</label>
                <textarea
                  value={newSettings.description}
                  onChange={(e) => setNewSettings({ ...newSettings, description: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Tipo</label>
                <select
                  value={newSettings.quizType}
                  onChange={(e) => setNewSettings({ ...newSettings, quizType: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="ESAME" className="bg-slate-800">Esame (1 tentativo)</option>
                  <option value="PREPARAZIONE" className="bg-slate-800">Preparazione (illimitati)</option>
                  <option value="CUSTOM" className="bg-slate-800">Custom</option>
                </select>
              </div>

              {newSettings.quizType === 'CUSTOM' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Numero tentativi</label>
                  <input
                    type="number"
                    value={newSettings.maxAttempts}
                    onChange={(e) => setNewSettings({ ...newSettings, maxAttempts: parseInt(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    min={1}
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Punteggio minimo (%)</label>
                  <input
                    type="number"
                    value={newSettings.passingScore}
                    onChange={(e) => setNewSettings({ ...newSettings, passingScore: parseInt(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    min={0}
                    max={100}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Tempo limite (min)</label>
                  <input
                    type="number"
                    value={newSettings.timeLimit}
                    onChange={(e) => setNewSettings({ ...newSettings, timeLimit: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="Opzionale"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={newSettings.shuffleQuestions}
                    onChange={(e) => setNewSettings({ ...newSettings, shuffleQuestions: e.target.checked })}
                    className="rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Mescola ordine domande</span>
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={newSettings.shuffleAnswers}
                    onChange={(e) => setNewSettings({ ...newSettings, shuffleAnswers: e.target.checked })}
                    className="rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Mescola ordine risposte</span>
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={newSettings.showResultsImmediately}
                    onChange={(e) => setNewSettings({ ...newSettings, showResultsImmediately: e.target.checked })}
                    className="rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Mostra risultati subito</span>
                </label>
                <label className="flex items-center gap-2 text-slate-300">
                  <input
                    type="checkbox"
                    checked={newSettings.enableNegativePoints}
                    onChange={(e) => setNewSettings({ ...newSettings, enableNegativePoints: e.target.checked })}
                    className="rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
                  />
                  <span>Abilita punti negativi</span>
                </label>
                {newSettings.enableNegativePoints && (
                  <div className="ml-6 mt-2">
                    <label className="block text-sm font-medium mb-1 text-slate-400">Punti da sottrarre per risposta errata:</label>
                    <input
                      type="number"
                      value={newSettings.negativePointsValue}
                      onChange={(e) => setNewSettings({ ...newSettings, negativePointsValue: parseFloat(e.target.value) })}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      min={0.1}
                      max={10}
                      step={0.5}
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={handleSaveSettings}
                  disabled={saving}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? 'Salvataggio...' : 'Salva'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuestionModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/10 rounded-[40px] p-6 max-w-xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">
                {editingQuestion ? 'Modifica Domanda' : 'Nuova Domanda'}
              </h2>
              <button
                onClick={() => {
                  setShowQuestionModal(false);
                  setEditingQuestion(null);
                }}
                className="text-slate-500 hover:text-white text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Testo domanda *</label>
                <textarea
                  value={newQuestion.text}
                  onChange={(e) => setNewQuestion({ ...newQuestion, text: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  rows={3}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Tipo</label>
                  <select
                    value={newQuestion.questionType}
                    onChange={(e) => setNewQuestion({ ...newQuestion, questionType: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option value="MULTIPLE_CHOICE" className="bg-slate-800">Scelta multipla</option>
                    <option value="OPEN_ANSWER" className="bg-slate-800">Risposta aperta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-slate-300">Punti</label>
                  <input
                    type="number"
                    value={newQuestion.points}
                    onChange={(e) => setNewQuestion({ ...newQuestion, points: parseInt(e.target.value) })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    min={1}
                  />
                </div>
              </div>

              {newQuestion.questionType === 'MULTIPLE_CHOICE' && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-slate-300">Risposte *</label>
                  <div className="space-y-2">
                    {newQuestion.answers.map((answer, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="correctAnswer"
                          checked={answer.isCorrect}
                          onChange={() => {
                            const updated = newQuestion.answers.map((a, i) => ({
                              ...a,
                              isCorrect: i === idx
                            }));
                            setNewQuestion({ ...newQuestion, answers: updated });
                          }}
                          className="border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
                        />
                        <input
                          type="text"
                          value={answer.text}
                          onChange={(e) => {
                            const updated = [...newQuestion.answers];
                            updated[idx] = { ...updated[idx], text: e.target.value };
                            setNewQuestion({ ...newQuestion, answers: updated });
                          }}
                          placeholder={`Risposta ${idx + 1}`}
                          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        />
                        {newQuestion.answers.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              const updated = newQuestion.answers.filter((_, i) => i !== idx);
                              setNewQuestion({ ...newQuestion, answers: updated });
                            }}
                            className="text-red-500 hover:text-red-400"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    {newQuestion.answers.length < 6 && (
                      <button
                        type="button"
                        onClick={() => setNewQuestion({
                          ...newQuestion,
                          answers: [...newQuestion.answers, { text: '', isCorrect: false }]
                        })}
                        className="text-cyan-400 hover:text-cyan-300 hover:underline text-sm transition-colors"
                      >
                        + Aggiungi risposta
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={() => {
                    setShowQuestionModal(false);
                    setEditingQuestion(null);
                  }}
                  className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={editingQuestion ? handleUpdateQuestion : handleAddQuestion}
                  disabled={saving}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-4 py-2 rounded-xl transition-colors disabled:opacity-50"
                >
                  {saving ? 'Salvataggio...' : editingQuestion ? 'Modifica' : 'Aggiungi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAnswerModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-white/10 rounded-[40px] p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">Nuova Risposta</h2>
              <button
                onClick={() => setShowAnswerModal(null)}
                className="text-slate-500 hover:text-white text-2xl transition-colors"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-300">Testo risposta *</label>
                <input
                  type="text"
                  value={newAnswer.text}
                  onChange={(e) => setNewAnswer({ ...newAnswer, text: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <label className="flex items-center gap-2 text-slate-300">
                <input
                  type="checkbox"
                  checked={newAnswer.isCorrect}
                  onChange={(e) => setNewAnswer({ ...newAnswer, isCorrect: e.target.checked })}
                  className="rounded border-white/20 bg-white/5 text-cyan-500 focus:ring-cyan-500"
                />
                <span>Risposta corretta</span>
              </label>

              <div className="flex gap-2 justify-end pt-4">
                <button
                  onClick={() => setShowAnswerModal(null)}
                  className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded-xl transition-colors"
                >
                  Annulla
                </button>
                <button
                  onClick={() => handleAddAnswer(showAnswerModal)}
                  className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-4 py-2 rounded-xl transition-colors"
                >
                  Aggiungi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}