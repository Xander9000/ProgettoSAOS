'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Enrollment {
  courseId: string;
  title: string;
  teacherId: string;
  isPublished: boolean;
  status: 'ACTIVE' | 'PENDING';
  enrolledAt: string;
}

export default function StudentMyCoursesPage() {
  const router = useRouter();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkAuth() {
      try {
        const sessionData = await api.auth.verifySession();
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }
        if (sessionData.role !== 'STUDENT') {
          router.push(`/dashboard/${sessionData.role?.toLowerCase()}`);
          return;
        }

        const fetchEnrollments = async () => {
          try {
            const courses = await api.courses.myEnrollments();
            setEnrollments(courses);
          } catch (err) {
            setError('Errore nel caricamento dei corsi');
          } finally {
            setLoading(false);
          }
        };

        fetchEnrollments();
      } catch {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router]);

  if (loading) return <div className="p-4">Caricamento...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-black text-white tracking-tight">I Miei Corsi</h1>
        <p className="text-slate-400 mt-2">Continua la tua formazione da dove l'avevi interrotta.</p>
      </div>
      
      {enrollments.length === 0 ? (
        <div className="bg-slate-900/40 backdrop-blur-xl border border-white/5 p-12 rounded-[40px] text-center">
          <div className="w-20 h-20 bg-cyan-500/10 rounded-full flex items-center justify-center text-cyan-400 mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
          </div>
          <p className="text-slate-200 font-bold text-xl mb-2">Ancora nessun corso?</p>
          <p className="text-slate-400 mb-8">Inizia oggi a costruire il tuo futuro esplorando il nostro catalogo.</p>
          <Link
            href="/dashboard/student/courses"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold px-8 py-4 rounded-2xl transition-all shadow-lg shadow-cyan-500/20"
          >
            Sfoglia il catalogo
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4 4H3" /></svg>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {enrollments.map((enrollment) => (
            <div key={enrollment.courseId} className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[32px] hover:border-cyan-500/30 transition-all duration-300">
               <div className="flex justify-between items-start mb-6">
                 <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-cyan-400 border border-white/5">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                 </div>
                 <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                    enrollment.status === 'ACTIVE' 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {enrollment.status === 'ACTIVE' ? 'Attivo' : 'In attesa'}
                  </span>
               </div>

              <h2 className="text-xl font-bold text-white mb-2 group-hover:text-cyan-400 transition-colors line-clamp-1">{enrollment.title}</h2>
              <p className="text-slate-400 text-sm mb-6 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-slate-600 rounded-full"></span>
                  Docente: <span className="text-slate-200">{enrollment.teacherId}</span>
              </p>
              
              <div className="pt-6 border-t border-white/5 flex flex-col gap-3">
                {enrollment.status === 'ACTIVE' ? (
                  <>
                    <Link
                      href={`/courses/${enrollment.courseId}`}
                      className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white font-bold py-3.5 rounded-2xl transition-all shadow-lg shadow-cyan-500/20 text-center active:scale-95"
                    >
                      Riprendi Studio
                    </Link>
                    <Link
                      href={`/quiz/course/${enrollment.courseId}`}
                      className="w-full bg-white/5 hover:bg-white/10 text-slate-300 font-bold py-3.5 rounded-2xl border border-white/5 text-center transition-all active:scale-95"
                    >
                      Esegui Quiz
                    </Link>
                  </>
                ) : (
                  <button disabled className="w-full bg-slate-800/50 text-slate-500 font-bold py-3.5 rounded-2xl border border-white/5 cursor-not-allowed">
                    Accesso Disabilitato
                  </button>
                )}
                <p className="text-[10px] text-center text-slate-500 font-medium mt-2">
                  Iscritto il: {new Date(enrollment.enrolledAt).toLocaleDateString('it-IT')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
