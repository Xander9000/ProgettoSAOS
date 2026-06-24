'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import SessionMonitor from '@/components/SessionMonitor';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: string;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    async function checkUser() {
      try {
        const sessionData = await api.auth.verifySession();
        if (sessionData.valid) {
          const sessionRole = (sessionData.role || 'STUDENT').toLowerCase();
          const urlRole = pathname.split('/')[2];
          if (urlRole && urlRole !== sessionRole) {
            router.replace(`/dashboard/${sessionRole}`);
            return;
          }
          setUser({ 
            id: sessionData.userId || '', 
            email: sessionData.email || '', 
            role: sessionData.role || 'STUDENT' 
          });
        } else {
          router.replace('/login');
        }
      } catch (error) {
        router.replace('/login');
      } finally {
        setIsLoading(false);
      }
    }
    checkUser();
  }, [router, pathname]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-cyan-500/20 rounded-full border-2 border-cyan-500/50 animate-spin border-t-transparent"></div>
          <span className="text-cyan-400 font-bold tracking-widest uppercase text-xs">Caricamento Dashboard...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const role = user.role.toLowerCase();
  
  const navItems = {
    student: [
      { href: `/dashboard/student`, label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '/dashboard/student/my-courses', label: 'I Miei Corsi', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
      { href: '/dashboard/student/courses', label: 'Catalogo Corsi', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
      { href: '/dashboard/student/quiz', label: 'I Miei Quiz', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
    ],
    teacher: [
      { href: `/dashboard/teacher`, label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { href: '/dashboard/teacher/courses', label: 'Gestione Corsi', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
      { href: '/dashboard/teacher/create', label: 'Nuovo Corso', icon: 'M12 4v16m8-8H4' },
      { href: '/dashboard/teacher/quiz', label: 'Gestione Quiz', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    ],
    admin: [
      { href: `/dashboard/admin`, label: 'Overview', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { href: '/dashboard/admin/users', label: 'Gestione Utenti', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { href: '/dashboard/admin/courses', label: 'Gestione Corsi', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    ],
  };

  const items = navItems[role as keyof typeof navItems] || [];

  return (
    <SessionMonitor pathname={pathname}>
      <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-cyan-500/30">
        
        <div className="flex relative">
          {/* Animated Background Elements */}
          <div className="fixed inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px] animate-blob"></div>
            <div className="absolute bottom-[10%] left-[5%] w-[400px] h-[400px] bg-cyan-600/10 rounded-full blur-[100px] animate-blob animation-delay-2000"></div>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col w-72 h-[calc(100vh-80px)] sticky top-20 border-r border-white/5 bg-slate-900/40 backdrop-blur-md">
            <nav className="flex-1 px-4 py-8 space-y-2">
              <p className="px-4 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Navigazione</p>
              {items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${
                      isActive 
                        ? 'bg-gradient-to-r from-cyan-500/10 to-transparent text-cyan-400 border border-cyan-500/20 shadow-[0_0_20px_rgba(6,182,212,0.1)]' 
                        : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <svg className={`w-5 h-5 transition-colors ${isActive ? 'text-cyan-400' : 'text-slate-500 group-hover:text-slate-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                    </svg>
                    <span className="text-sm font-semibold">{item.label}</span>
                    {isActive && <div className="ml-auto w-1.5 h-1.5 bg-cyan-500 rounded-full shadow-[0_0_8px_#06b6d4]"></div>}
                  </Link>
                );
              })}
            </nav>
            
          </aside>

          {/* Main Content */}
          <main className="flex-1 p-6 md:p-10 relative z-10 w-full overflow-x-hidden">
            <div className="max-w-6xl mx-auto animate-fade-in-up">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SessionMonitor>
  );
}
