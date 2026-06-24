'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getCsrfToken } from '@/lib/api';

interface Course {
  id: string;
  title: string;
  teacherId: string;
  isPublished: boolean;
  enrollmentType?: string;
}

interface Enrollment {
  courseId: string;
  status: string;
}

export default function StudentCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [enrolledCourseIds, setEnrolledCourseIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [selectedCourseForEnrollment, setSelectedCourseForEnrollment] = useState<string | null>(null);
  const [enrollmentKey, setEnrollmentKey] = useState('');
  const [keyError, setKeyError] = useState('');
  const [enrolling, setEnrolling] = useState(false);

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
            const [coursesData, enrollmentsData] = await Promise.all([
              api.courses.catalog(),
              api.courses.myEnrollments()
            ]);
            
            setCourses(coursesData);
            
            const enrolledIds = new Set(
              enrollmentsData
                .filter((e: Enrollment) => e.status === 'ACTIVE')
                .map((e: Enrollment) => e.courseId)
            );
            setEnrolledCourseIds(enrolledIds);
          } catch (err) {
            setError('Errore nel caricamento dei corsi');
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

  const handleEnroll = async (courseId: string, enrollmentType?: string) => {
    if (enrollmentType === 'KEY') {
      setSelectedCourseForEnrollment(courseId);
      setShowKeyModal(true);
      setEnrollmentKey('');
      setKeyError('');
      return;
    }

    if (enrollmentType === 'APPROVAL') {
      await enrollInCourse(courseId, '');
      return;
    }

    await enrollInCourse(courseId, '');
  };

  const enrollInCourse = async (courseId: string, key: string) => {
    setEnrolling(true);
    setKeyError('');
    try {
      const csrfToken = getCsrfToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (csrfToken) {
        headers['x-csrf-token'] = csrfToken;
      }

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/courses/${courseId}/enroll`,
        {
          method: 'POST',
          credentials: 'include',
          headers,
          body: JSON.stringify({ enrollmentKey: key })
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(data.message || 'Iscrizione completata!');
        setEnrolledCourseIds(prev => {
          const newSet = new Set(prev);
          newSet.add(courseId);
          return newSet;
        });
        setShowKeyModal(false);
        setSelectedCourseForEnrollment(null);
        setEnrollmentKey('');
      } else {
        const data = await response.json();
        if (key) {
          setKeyError(data.error || 'Chiave di iscrizione non valida');
        } else {
          alert(data.error || 'Errore nell\'iscrizione');
        }
      }
    } catch (err) {
      alert('Errore di connessione');
    } finally {
      setEnrolling(false);
    }
  };

  const handleKeySubmit = () => {
    if (selectedCourseForEnrollment) {
      enrollInCourse(selectedCourseForEnrollment, enrollmentKey);
    }
  };

  const availableCourses = courses.filter(c => !enrolledCourseIds.has(c.id));

  if (loading) return <div className="p-4">Caricamento...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Catalogo Corsi</h1>
          <p className="text-slate-400 mt-2">Esplora e iscriviti a nuovi contenuti formativi.</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {availableCourses.map((course) => (
          <div key={course.id} className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[32px] hover:border-cyan-500/30 transition-all duration-300 transform hover:-translate-y-1 hover:shadow-2xl hover:shadow-cyan-500/10">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-cyan-500/10 to-purple-500/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
            
            <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-cyan-400 mb-6 border border-white/5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </div>

            <h2 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors">{course.title}</h2>
            <p className="text-slate-400 text-sm mb-6 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-slate-600 rounded-full"></span>
                Docente: <span className="text-slate-200">{course.teacherId}</span>
            </p>
            
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleEnroll(course.id, course.enrollmentType)}
                className="flex-1 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold py-3 rounded-2xl transition-all shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center justify-center gap-2"
              >
                <span>Iscriviti</span>
                {course.enrollmentType === 'KEY' && <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>}
              </button>
              <Link
                href={`/courses/${course.id}`}
                className="p-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-2xl border border-white/5 transition-all active:scale-95"
                title="Dettagli Corso"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </Link>
            </div>
          </div>
        ))}
      </div>

      {availableCourses.length === 0 && courses.length > 0 && (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-12 rounded-[40px] text-center">
          <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center text-cyan-400 mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Sei un grande!</h2>
          <p className="text-slate-400 mb-8">Sei già iscritto a tutti i corsi disponibili nella piattaforma.</p>
          <Link
            href="/dashboard/student/my-courses"
            className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 text-cyan-400 font-bold px-8 py-4 rounded-2xl border border-cyan-500/20 transition-all"
          >
            Visualizza i tuoi corsi
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4 4H3" /></svg>
          </Link>
        </div>
      )}

      {courses.length === 0 && (
        <div className="text-center py-20">
            <p className="text-slate-500 font-medium">Nessun corso attualmente disponibile nel catalogo.</p>
        </div>
      )}

      {showKeyModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-white/10 rounded-[40px] p-8 md:p-12 max-w-md w-full shadow-2xl animate-fade-in-up">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black text-white tracking-tight">Iscrizione 🔒</h2>
              <button
                onClick={() => setShowKeyModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <p className="text-slate-400 mb-8 font-medium">
              Questo corso richiede una chiave di iscrizione. Inseriscila per continuare il tuo percorso di apprendimento.
            </p>

            <div className="mb-4">
              <label htmlFor="enrollmentKey" className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 ml-1">
                Chiave di Iscrizione
              </label>
              <input
                type="text"
                id="enrollmentKey"
                value={enrollmentKey}
                onChange={(e) => setEnrollmentKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleKeySubmit()}
                className="w-full bg-slate-800/50 border border-white/5 rounded-2xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all placeholder:text-slate-600"
                placeholder="Inserisci la chiave segreta"
                autoFocus
              />
              {keyError && (
                <p className="mt-2 text-sm text-red-600">{keyError}</p>
              )}
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowKeyModal(false)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-4 rounded-2xl transition-all"
                disabled={enrolling}
              >
                Annulla
              </button>
              <button
                onClick={handleKeySubmit}
                disabled={enrolling}
                className="flex-2 bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold py-4 px-8 rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20"
              >
                {enrolling ? 'Iscrizione...' : 'Sblocca Corso'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
