'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function RoleDashboard() {
  const router = useRouter();
  const params = useParams();
  const role = params.role as string;
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [stats, setStats] = useState({ active: 0 });
  const [recentAttempts, setRecentAttempts] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const sessionData = await api.auth.verifySession();
        if (!sessionData.valid) {
          router.replace('/login');
          return;
        }
        setUserName(sessionData.email?.split('@')[0] || 'Utente');
        const userRole = sessionData.role?.toLowerCase() || 'student';
        if (userRole !== role) {
          router.push(`/dashboard/${userRole}`);
          return;
        }

        if (userRole === 'student') {
          const [enrollments, quizHistory] = await Promise.all([
            api.courses.myEnrollments(),
            api.quiz.getStudentHistory()
          ]);

          const activeCount = enrollments.filter((e: any) => e.status === 'ACTIVE').length;
          setStats({ active: activeCount });

          const allAttempts = (quizHistory as any).history?.flatMap((h: any) =>
            h.attempts.map((a: any) => ({ ...a, quizTitle: h.quiz.title, quizId: h.quiz.id }))
          ) || [];
          allAttempts.sort((a: any, b: any) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
          setRecentAttempts(allAttempts.slice(0, 5));
        } else if (userRole === 'teacher') {
          const courses = await api.courses.myCourses();
          setStats({ active: courses.length });
        }

        setLoading(false);
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        router.replace('/login');
      }
    }
    fetchData();
  }, [router, role]);

  if (loading) return (
    <div className="min-h-[60vh] flex items-center justify-center">
       <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Caricamento Analitiche...</p>
       </div>
    </div>
  );

  const Card = ({ href, title, description, icon, colorClass, gradientClass }: any) => (
    <Link
      href={href}
      className={`group relative overflow-hidden p-8 rounded-3xl bg-slate-900 border border-white/5 hover:border-${colorClass}-500/50 transition-all duration-300 transform hover:-translate-y-2 hover:shadow-2xl shadow-lg shadow-black/20`}
    >
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradientClass} opacity-0 group-hover:opacity-10 blur-3xl transition-opacity duration-300`}></div>
      <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${gradientClass} flex items-center justify-center text-white mb-6 shadow-lg shadow-${colorClass}-500/20 group-hover:scale-110 transition-transform`}>
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <h3 className="text-xl font-bold text-white mb-2 group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-white group-hover:to-slate-400 transition-all">
        {title}
      </h3>
      <p className="text-slate-400 text-sm leading-relaxed">{description}</p>
      
      <div className={`mt-6 flex items-center text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-${colorClass}-400 transition-colors`}>
        Apri Sezione
        <svg className="ml-2 w-4 h-4 transform group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4 4H3" /></svg>
      </div>
    </Link>
  );

  return (
    <div className="space-y-12">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            Bentornato, <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 capitalize">{userName}</span>!
          </h1>
          <p className="text-slate-400 mt-2 font-medium">Ecco cosa sta succedendo oggi nella tua area <span className="text-cyan-400 uppercase tracking-widest text-[10px] px-2 py-1 bg-white/5 rounded-full ml-1 border border-white/5">{role}</span></p>
        </div>
        <div className="flex gap-4">
            <div className="px-6 py-4 bg-slate-900 border border-white/5 rounded-2xl shadow-xl">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Corsi Attivi</p>
                <p className="text-3xl font-black text-white tracking-tighter">{stats.active}</p>
            </div>

        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {role === 'admin' && (
          <>
            <Card 
              href="/dashboard/admin/users" 
              title="Gestione Utenti" 
              description="Controlla l'accesso, modifica ruoli e gestisci le iscrizioni globali." 
              icon="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" 
              colorClass="blue" 
              gradientClass="from-blue-500 to-indigo-600"
            />
            <Card 
              href="/dashboard/admin/courses" 
              title="Gestione Corsi" 
              description="Revisiona tutti i corsi sulla piattaforma, approva nuovi contenuti." 
              icon="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" 
              colorClass="emerald" 
              gradientClass="from-emerald-500 to-teal-600"
            />
          </>
        )}

        {role === 'student' && (
          <>
            <Card 
              href="/dashboard/student/my-courses" 
              title="I Miei Corsi" 
              description="Continua da dove avevi interrotto e tieni traccia dei tuoi progressi." 
              icon="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" 
              colorClass="cyan" 
              gradientClass="from-cyan-500 to-blue-600"
            />
            <Card 
              href="/dashboard/student/courses" 
              title="Esplora Catalogo" 
              description="Trova nuovi argomenti e iscriviti ai corsi più popolari." 
              icon="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" 
              colorClass="purple" 
              gradientClass="from-violet-500 to-purple-600"
            />
            <Card 
              href="/dashboard/student/quiz" 
              title="I Miei Quiz" 
              description="Analizza i tuoi risultati e riprendi i quiz pendenti." 
              icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" 
              colorClass="pink" 
              gradientClass="from-pink-500 to-rose-600"
            />
          </>
        )}

        {role === 'teacher' && (
          <>
            <Card 
              href="/dashboard/teacher/courses" 
              title="Gestione Corsi" 
              description="Aggiungi materiali, visualizza le analitiche degli studenti." 
              icon="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" 
              colorClass="indigo" 
              gradientClass="from-indigo-500 to-blue-600"
            />
            <Card 
              href="/dashboard/teacher/create" 
              title="Nuovo Contenuto" 
              description="Crea un nuovo corso da zero usando il builder avanzato." 
              icon="M12 4v16m8-8H4" 
              colorClass="cyan" 
              gradientClass="from-cyan-500 to-teal-500"
            />
            <Card 
              href="/dashboard/teacher/quiz" 
              title="Questionari" 
              description="Progetta quiz interattivi e assegnali ai tuoi corsi." 
              icon="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" 
              colorClass="amber" 
              gradientClass="from-amber-500 to-orange-600"
            />
          </>
        )}
      </div>
      
      {role === 'student' && recentAttempts.length > 0 && (
        <section className="bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-[40px] p-8 md:p-12 overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 text-white/5 transform translate-x-1/4 -translate-y-1/4">
            <svg className="w-64 h-64" fill="currentColor" viewBox="0 0 24 24"><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9l-7-7zM13 9V3.5L18.5 9H13z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-6 relative z-10">Attività Recente</h2>
          <div className="space-y-4 relative z-10">
            {recentAttempts.map((a: any) => (
              <Link key={a.id} href={`/quiz/${a.quizId}?view=results`} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl hover:bg-white/10 transition-colors border border-transparent hover:border-white/10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${a.passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'}`}>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={a.passed ? 'M5 13l4 4L19 7' : 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-200 truncate">
                    {a.passed
                      ? `Hai superato "${a.quizTitle}" con ${a.percentage}%`
                      : a.passed === null
                        ? `Hai completato "${a.quizTitle}" (in attesa di valutazione)`
                        : `Hai tentato "${a.quizTitle}" (${a.percentage}%)`}
                  </p>
                  <p className="text-xs text-slate-500">{new Date(a.completedAt).toLocaleString('it-IT')}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
