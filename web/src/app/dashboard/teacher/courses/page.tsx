'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Course {
  id: string;
  title: string;
  teacherId: string;
  isPublished: boolean;
}

interface Enrollment {
  courseId: string;
  studentId: string;
  status: string;
  createdAt: string;
}

export default function TeacherCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);

  const handlePublish = async (courseId: string) => {
    try {
      await api.courses.publish(courseId);
      setCourses(courses.map(c => 
        c.id === courseId ? { ...c, isPublished: true } : c
      ));
    } catch (err) {
      console.error(err);
    }
  };

  const handleViewEnrollments = async (courseId: string) => {
    setSelectedCourseId(courseId);
    setLoadingEnrollments(true);
    try {
      const data = await api.courses.getEnrollments(courseId);
      setEnrollments(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const handleApprove = async (courseId: string, studentId: string) => {
    try {
      await api.courses.approveEnrollment(courseId, studentId);
      setEnrollments(enrollments.map(e => 
        e.studentId === studentId ? { ...e, status: 'ACTIVE' } : e
      ));
    } catch (err) {
      console.error(err);
    }
  };

  const handleReject = async (courseId: string, studentId: string) => {
    try {
      await api.courses.rejectEnrollment(courseId, studentId);
      setEnrollments(enrollments.filter(e => e.studentId !== studentId));
    } catch (err) {
      console.error(err);
    }
  };

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

        const fetchCourses = async () => {
          try {
            const data = await api.courses.myCourses();
            setCourses(data);
          } catch (err) {
            console.error(err);
          } finally {
            setLoading(false);
          }
        };

        fetchCourses();
      } catch {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router]);

  if (loading) return <div className="p-4 text-slate-300">Caricamento...</div>;

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tight">Gestione Corsi</h1>
          <p className="text-slate-400 mt-2">Crea, modifica e gestisci i tuoi percorsi formativi.</p>
        </div>
        <button 
          onClick={() => router.push('/dashboard/teacher/create')}
          className="bg-cyan-500 hover:bg-cyan-400 text-slate-900 font-bold px-6 py-3 rounded-2xl transition-all shadow-lg shadow-cyan-500/20 active:scale-95 flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
          Nuovo Corso
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {courses.map((course) => (
          <div key={course.id} className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/5 p-8 rounded-[32px] hover:border-cyan-500/30 transition-all duration-300 transform hover:-translate-y-1">
            <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center text-cyan-400 border border-white/5">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                </div>
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full border ${
                    course.isPublished 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                      : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                  }`}>
                    {course.isPublished ? 'Pubblicato' : 'Bozza'}
                  </span>
            </div>

            <h2 className="text-xl font-bold text-white mb-6 group-hover:text-cyan-400 transition-colors line-clamp-1">{course.title}</h2>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => router.push(`/dashboard/teacher/courses/${course.id}/edit`)}
                className="bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-bold py-3 rounded-xl border border-white/5 transition-all active:scale-95"
              >
                Modifica
              </button>
              
              {!course.isPublished ? (
                <button
                  onClick={() => handlePublish(course.id)}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-900 text-xs font-bold py-3 rounded-xl transition-all active:scale-95"
                >
                  Pubblica
                </button>
              ) : (
                <button
                    onClick={() => handleViewEnrollments(course.id)}
                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold py-3 rounded-xl border border-amber-500/20 transition-all active:scale-95"
                >
                    Iscrizioni
                </button>
              )}

              <button
                onClick={() => router.push(`/courses/${course.id}`)}
                className="col-span-2 bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-white text-xs font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-cyan-500/10 active:scale-95 text-center mt-2"
              >
                Gestisci Contenuti
              </button>
            </div>
          </div>
        ))}
      </div>

      {courses.length === 0 && (
        <div className="text-center py-20 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-[40px]">
            <p className="text-slate-500 font-medium">Non hai ancora creato alcun corso.</p>
        </div>
      )}

      {selectedCourseId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-white/10 rounded-[40px] p-8 md:p-12 max-w-2xl w-full shadow-2xl animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-3xl font-black text-white tracking-tight">Iscrizioni 👥</h2>
              <button
                onClick={() => setSelectedCourseId(null)}
                className="p-2 text-slate-500 hover:text-white transition-colors"
              >
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            {loadingEnrollments ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : enrollments.length === 0 ? (
              <div className="text-center py-10 bg-white/5 rounded-2xl border border-white/5">
                <p className="text-slate-400 font-medium">Nessuna richiesta di iscrizione trovata.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {enrollments.map((enrollment) => (
                  <div key={enrollment.studentId} className="bg-white/5 border border-white/5 p-6 rounded-2xl hover:border-white/10 transition-colors">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                      <div>
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-300">S</div>
                            <p className="font-bold text-white truncate max-w-[200px]">{enrollment.studentId}</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          <span>Status: <span className={enrollment.status === 'PENDING' ? 'text-amber-400' : 'text-emerald-400'}>{enrollment.status}</span></span>
                          <span className="w-1 h-1 bg-slate-700 rounded-full"></span>
                          <span>{new Date(enrollment.createdAt).toLocaleDateString('it-IT')}</span>
                        </div>
                      </div>
                      {enrollment.status === 'PENDING' && (
                        <div className="flex gap-2 w-full md:w-auto mt-4 md:mt-0">
                          <button
                            onClick={() => handleApprove(selectedCourseId, enrollment.studentId)}
                            className="flex-1 md:flex-none bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95"
                          >
                            Approva
                          </button>
                          <button
                            onClick={() => handleReject(selectedCourseId, enrollment.studentId)}
                            className="flex-1 md:flex-none bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white font-bold px-4 py-2 rounded-xl text-xs border border-rose-500/20 transition-all active:scale-95"
                          >
                            Rifiuta
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
