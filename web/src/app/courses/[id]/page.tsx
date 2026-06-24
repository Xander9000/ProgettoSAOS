'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';

const API_URL = typeof process !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081') 
  : 'http://localhost:8081';

function getCsrfToken(): string {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.match(/(?:^|; )csrf-token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function formatFileSize(bytes: string | number): string {
  const num = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (isNaN(num) || num === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  const val = num / Math.pow(1024, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`;
}

interface Content {
  id: string;
  title: string;
  type: string;
  size: string;
  mimeType?: string;
  isPublic: boolean;
}

interface Course {
  id: string;
  title: string;
  description: string | null;
  teacherId: string;
}

interface TeacherMessage {
  id: string;
  content: string;
  createdAt: string;
}

interface EnrolledStudent {
  studentId: string;
  status: string;
  createdAt: string;
  student: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface User {
  id: string;
  email: string;
  role: string;
  userId?: string;
}

export default function CourseDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [courseId, setCourseId] = useState<string>('');
  const [course, setCourse] = useState<Course | null>(null);
  const [contents, setContents] = useState<Content[]>([]);
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [messages, setMessages] = useState<TeacherMessage[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [selectedContents, setSelectedContents] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isTeacher = user?.role === 'TEACHER' || user?.role === 'ADMIN';

  useEffect(() => {
    const pathParts = window.location.pathname.split('/');
    const courseIdFromUrl = pathParts[pathParts.indexOf('courses') + 1];
    if (courseIdFromUrl && courseIdFromUrl !== 'undefined') {
      setCourseId(courseIdFromUrl);
    }
  }, []);

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionRes = await fetch(`${API_URL}/api/auth/verify-session`, {
          credentials: 'include'
        });
        
        if (!sessionRes.ok) {
          router.replace('/login');
          return;
        }
        
        const sessionData = await sessionRes.json();
        if (sessionData.valid) {
          setUser({ 
            id: sessionData.userId, 
            email: sessionData.email, 
            role: sessionData.role 
          });
        } else {
          router.replace('/login');
        }
      } catch {
        router.replace('/login');
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!courseId) return;
      try {
        const [courseRes, contentsRes] = await Promise.all([
          fetch(`${API_URL}/api/courses/${courseId}`, {
            credentials: 'include'
          }),
          fetch(`${API_URL}/api/content/course/${courseId}`, {
            credentials: 'include'
          })
        ]);

        if (courseRes.ok) {
          const courseData = await courseRes.json();
          setCourse(courseData);
        }

        if (contentsRes.ok) {
          const contentsData = await contentsRes.json();
          setContents(contentsData.contents || []);
          setHasFullAccess(contentsData.hasFullAccess || false);
        }

        // Fetch enrolled students if user is teacher
        if (user?.role === 'TEACHER' || user?.role === 'ADMIN') {
          const enrollmentsRes = await fetch(`${API_URL}/api/courses/${courseId}/enrollments`, {
            credentials: 'include'
          });
          if (enrollmentsRes.ok) {
            const enrollmentsData = await enrollmentsRes.json();
            setEnrolledStudents(enrollmentsData);
          }
        }

        if (hasFullAccess) {
          const messagesRes = await fetch(`${API_URL}/api/courses/${courseId}/messages`, {
            credentials: 'include'
          });
          if (messagesRes.ok) {
            const messagesData = await messagesRes.json();
            setMessages(messagesData);
          }
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [courseId, router, hasFullAccess, user]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !courseId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const csrfToken = getCsrfToken();
      const response = await fetch(
        `${API_URL}/api/content/${courseId}/materials`,
        {
          method: 'POST',
          credentials: 'include',
          headers: csrfToken ? { 'x-csrf-token': csrfToken } : undefined,
          body: formData,
        }
      );

      if (response.ok) {
        const newContent = await response.json();
        setContents([...contents, { ...newContent.content, isPublic: false }]);
      } else {
        const error = await response.json();
        alert(error.error || 'Errore durante upload');
      }
    } catch {
      alert('Errore durante upload');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDelete = async (contentId: string, title: string) => {
    if (!courseId || !confirm(`Sei sicuro di voler eliminare "${title}"?`)) return;

    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const response = await fetch(
        `${API_URL}/api/content/${courseId}/materials/${contentId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers,
        }
      );

      if (response.ok) {
        setContents(contents.filter(c => c.id !== contentId));
      } else {
        const error = await response.json();
        alert(error.error || 'Errore durante eliminazione');
      }
    } catch {
      alert('Errore durante eliminazione');
    }
  };

  const handleDownload = async (contentId: string, title: string) => {
    if (!courseId) return;

    try {
      const response = await fetch(
        `${API_URL}/api/content/${courseId}/materials/${contentId}`,
        {
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        alert(error.error || 'Errore durante il caricamento');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      alert('Errore durante il caricamento');
    }
  };

  const handleToggleVisibility = async (contentId: string, currentVisibility: boolean) => {
    if (!courseId) return;

    try {
      const csrfToken = getCsrfToken();
      const response = await fetch(
        `${API_URL}/api/content/${courseId}/materials/${contentId}`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
          body: JSON.stringify({ isPublic: !currentVisibility }),
        }
      );

      if (response.ok) {
        setContents(contents.map(c => 
          c.id === contentId ? { ...c, isPublic: !currentVisibility } : c
        ));
      } else {
        const error = await response.json();
        alert(error.error || 'Errore durante aggiornamento visibilità');
      }
    } catch {
      alert('Errore durante aggiornamento visibilità');
    }
  };

  const handleSelectAll = () => {
    if (selectedContents.size === contents.length) {
      setSelectedContents(new Set());
    } else {
      setSelectedContents(new Set(contents.map(c => c.id)));
    }
  };

  const handleSelectContent = (contentId: string) => {
    const newSelected = new Set(selectedContents);
    if (newSelected.has(contentId)) {
      newSelected.delete(contentId);
    } else {
      newSelected.add(contentId);
    }
    setSelectedContents(newSelected);
  };

  const handleBatchUpdateVisibility = async (makePublic: boolean) => {
    if (!courseId || selectedContents.size === 0) return;

    try {
      const csrfToken = getCsrfToken();
      const response = await fetch(
        `${API_URL}/api/content/${courseId}/materials/batch`,
        {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
          body: JSON.stringify({ 
            contentIds: Array.from(selectedContents),
            isPublic: makePublic 
          }),
        }
      );

      if (response.ok) {
        setContents(contents.map(c => 
          selectedContents.has(c.id) ? { ...c, isPublic: makePublic } : c
        ));
        setSelectedContents(new Set());
      } else {
        const error = await response.json();
        alert(error.error || 'Errore durante aggiornamento batch');
      }
    } catch {
      alert('Errore durante aggiornamento batch');
    }
  };

  const handleSendMessage = async () => {
    if (!courseId || !newMessage.trim()) return;

    setSendingMessage(true);
    try {
      const csrfToken = getCsrfToken();
      const response = await fetch(
        `${API_URL}/api/courses/${courseId}/messages`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}) },
          body: JSON.stringify({ content: newMessage }),
        }
      );

      if (response.ok) {
        const messageData = await response.json();
        setMessages([messageData.message, ...messages]);
        setNewMessage('');
      } else {
        const error = await response.json();
        alert(error.error || 'Errore durante invio messaggio');
      }
    } catch {
      alert('Errore durante invio messaggio');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!courseId || !confirm('Sei sicuro di voler eliminare questo messaggio?')) return;

    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const response = await fetch(
        `${API_URL}/api/courses/${courseId}/messages/${messageId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers,
        }
      );

      if (response.ok) {
        setMessages(messages.filter(m => m.id !== messageId));
      } else {
        const error = await response.json();
        alert(error.error || 'Errore durante eliminazione messaggio');
      }
    } catch {
      alert('Errore durante eliminazione messaggio');
    }
  };

  const handleRemoveStudent = async (studentId: string, studentName: string) => {
    if (!courseId || !confirm(`Sei sicuro di voler rimuovere ${studentName} da questo corso?`)) return;

    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;
      const response = await fetch(
        `${API_URL}/api/courses/${courseId}/enrollments/${studentId}`,
        {
          method: 'DELETE',
          credentials: 'include',
          headers,
        }
      );

      if (response.ok) {
        setEnrolledStudents(enrolledStudents.filter(e => e.studentId !== studentId));
        alert(`${studentName} è stato rimosso dal corso.`);
      } else {
        const error = await response.json();
        alert(error.error || 'Errore durante rimozione studente');
      }
    } catch {
      alert('Errore durante rimozione studente');
    }
  };

  if (loading) return <div className="p-4">Caricamento...</div>;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
      <div className="max-w-7xl mx-auto py-12 px-6 relative z-10">
        {/* Blobs */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[20%] left-[-10%] w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[120px] animate-blob"></div>
          <div className="absolute bottom-[10%] right-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[100px] animate-blob animation-delay-4000"></div>
        </div>

        <button
          onClick={() => router.back()}
          className="group mb-8 flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <div className="p-2 bg-white/5 rounded-lg group-hover:bg-white/10 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          </div>
          <span className="text-sm font-bold uppercase tracking-widest">Torna indietro</span>
        </button>

      {course && (
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight mb-4">
            {course.title}
          </h1>
          {course.description && (
            <p className="text-lg text-slate-400 max-w-3xl leading-relaxed">{course.description}</p>
          )}
        </div>
      )}

      {!hasFullAccess && contents.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 mb-12 flex items-center gap-4">
          <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <p className="text-amber-200 font-medium text-sm">
            Stai visualizzando solo i materiali pubblici. 
            Registrati al corso per accedere a tutti i contenuti e interagire con il docente.
          </p>
        </div>
      )}

      {hasFullAccess && messages.length > 0 && (
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
               <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
            </div>
            <h2 className="text-2xl font-bold text-white">Messaggi dal Docente</h2>
          </div>
          <div className="grid gap-4">
            {messages.map(message => (
              <div key={message.id} className="group bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 hover:bg-slate-900/60 transition-all">
                <p className="text-slate-200 mb-4 leading-relaxed">{message.content}</p>
                <div className="flex justify-between items-center border-t border-white/5 pt-4">
                  <div className="flex items-center gap-2 text-slate-500 text-xs font-medium uppercase tracking-tighter">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {new Date(message.createdAt).toLocaleDateString('it-IT', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                  {isTeacher && (
                    <button
                      onClick={() => handleDeleteMessage(message.id)}
                      className="text-red-400 hover:text-red-300 text-sm font-bold opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      Elimina
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasFullAccess && (
        <div className="mb-12 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl">
          <h2 className="text-xl font-bold text-white mb-6">Invia un messaggio agli studenti</h2>
          <div className="flex flex-col gap-4">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Scrivi qui il tuo messaggio..."
              className="w-full bg-slate-950 border border-white/10 rounded-2xl p-6 text-white placeholder-slate-600 focus:ring-2 focus:ring-cyan-500 outline-none transition-all min-h-[120px]"
            />
            <div className="flex justify-end">
              <button
                onClick={handleSendMessage}
                disabled={sendingMessage || !newMessage.trim()}
                className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black py-3 px-8 rounded-xl transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-2"
              >
                {sendingMessage ? (
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                )}
                Invia Messaggio
              </button>
            </div>
          </div>
        </div>
      )}

      {isTeacher && enrolledStudents.length > 0 && (
        <div className="mb-12 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-3">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
              Studenti Iscritti
            </h2>
            <span className="px-3 py-1 bg-white/5 rounded-full text-xs font-black text-cyan-400 uppercase tracking-widest">{enrolledStudents.length} Iscritti</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white/5">
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Email</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Stato</th>
                  <th className="px-8 py-4 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest">Iscritto il</th>
                  <th className="px-8 py-4 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest">Azioni</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {enrolledStudents.map((enrollment) => (
                  <tr key={enrollment.studentId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-8 py-5">
                      <div className="text-sm font-bold text-white">
                        {enrollment.student?.firstName && enrollment.student?.lastName
                          ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
                          : enrollment.student?.email || `ID: ${enrollment.studentId}`}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="text-sm text-slate-400">{enrollment.student?.email || 'Email non disponibile'}</div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full ${
                        enrollment.status === 'ACTIVE' 
                          ? 'bg-emerald-500/20 text-emerald-400' 
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {enrollment.status === 'ACTIVE' ? 'Attivo' : 'In attesa'}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm text-slate-500">
                      {new Date(enrollment.createdAt).toLocaleDateString('it-IT')}
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button
                        onClick={() => handleRemoveStudent(
                          enrollment.studentId,
                          enrollment.student?.firstName && enrollment.student?.lastName
                            ? `${enrollment.student.firstName} ${enrollment.student.lastName}`
                            : enrollment.student?.email || enrollment.studentId
                        )}
                        className="p-2 text-slate-500 hover:text-red-400 transition-colors"
                        title="Rimuovi studente"
                      >
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <h2 className="text-3xl font-black text-white tracking-tight">Contenuti del Corso</h2>
        
        {isTeacher && (
          <div className="flex flex-wrap gap-4 items-center">
            {contents.length > 0 && (
              <div className="flex gap-4 mr-4">
                <button
                  onClick={handleSelectAll}
                  className="text-xs font-bold text-slate-500 hover:text-white transition-colors uppercase tracking-widest"
                >
                  {selectedContents.size === contents.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
                </button>
                {selectedContents.size > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleBatchUpdateVisibility(true)}
                      className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-emerald-500/30"
                    >
                      Pubblica {selectedContents.size}
                    </button>
                    <button
                      onClick={() => handleBatchUpdateVisibility(false)}
                      className="bg-slate-800 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-white/5"
                    >
                      Privati {selectedContents.size}
                    </button>
                  </div>
                )}
              </div>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
              id="file-upload"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.mp4,.webm,.mov"
            />
            <label
              htmlFor="file-upload"
              className={`bg-white text-slate-950 px-6 py-3 rounded-xl font-black text-sm cursor-pointer hover:bg-slate-200 transition-all flex items-center gap-2 shadow-xl ${uploading ? 'opacity-50' : ''}`}
            >
              {uploading ? (
                <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              )}
              {uploading ? 'Caricamento...' : 'Carica Materiale'}
            </label>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {contents.map((content) => (
          <div key={content.id} className="group bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[32px] p-8 hover:bg-slate-900/60 transition-all hover:border-cyan-500/30 hover:shadow-2xl hover:shadow-cyan-500/10 relative overflow-hidden">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${content.type === 'VIDEO' ? 'from-red-500' : 'from-blue-500'} to-transparent opacity-0 group-hover:opacity-10 blur-2xl transition-opacity`}></div>
            
            <div className="flex justify-between items-start mb-6">
              <div className="flex flex-col gap-1">
                <span className={`w-fit px-3 py-1 rounded-lg text-[10px] font-black tracking-widest uppercase ${
                  content.type === 'VIDEO' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                }`}>
                  {content.type}
                </span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">{formatFileSize(content.size)}</span>
              </div>
              {content.isPublic && (
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                  Pubblico
                </span>
              )}
            </div>

            <h2 className="text-xl font-bold text-white mb-8 group-hover:text-cyan-400 transition-colors line-clamp-2 min-h-[3.5rem] leading-tight">
              {content.title}
            </h2>
            
            <div className="flex flex-col gap-3">
              <button
                onClick={() => handleDownload(content.id, content.title)}
                className="w-full bg-white/5 border border-white/10 hover:bg-white text-slate-300 hover:text-slate-950 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                {content.type === 'VIDEO' ? 'Guarda' : 'Visualizza'}
              </button>

              {isTeacher && (
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button
                    onClick={() => handleToggleVisibility(content.id, content.isPublic)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                      content.isPublic 
                        ? 'bg-slate-800 text-slate-400 border-white/5 hover:text-white' 
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                  >
                    {content.isPublic ? 'Privato' : 'Pubblico'}
                  </button>
                  <button
                    onClick={() => handleDelete(content.id, content.title)}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-500/20 transition-all text-center"
                  >
                    Elimina
                  </button>
                </div>
              )}
            </div>

            {isTeacher && (
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <input
                  type="checkbox"
                  checked={selectedContents.has(content.id)}
                  onChange={() => handleSelectContent(content.id)}
                  className="w-5 h-5 rounded-lg bg-slate-900 border-white/20 text-cyan-500 focus:ring-cyan-500"
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {contents.length === 0 && (
        <div className="bg-slate-900/40 border border-dashed border-white/10 p-12 rounded-[32px] text-center">
            <p className="text-slate-500 italic">Nessun contenuto disponibile per questo corso.</p>
        </div>
      )}
      </div>
    </div>
  );
}
