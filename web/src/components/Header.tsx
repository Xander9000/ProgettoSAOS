'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import NotificationBell from './NotificationBell';
import { useForceLogout } from './ForceLogoutContext';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: string;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  courseId?: string;
  isRead: boolean;
  createdAt: string;
}

interface HeaderProps {
  onRemovalNotification?: (notification: Notification) => void;
}

export default function Header({ onRemovalNotification }: HeaderProps) {
  const router = useRouter();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const { triggerForceLogout } = useForceLogout();

  useEffect(() => {
    async function loadUser() {
      try {
        const sessionData = await api.auth.verifySession();
        if (sessionData.valid) {
          setUser({
            id: sessionData.userId || '',
            email: sessionData.email || '',
            role: sessionData.role || 'STUDENT'
          });
        }
      } catch (error) {
        console.error('Failed to load user:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, []);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.log('Logout error:', error);
    }
    router.push('/login');
  };

  const getDashboardLink = () => {
    if (!user) return '/login';
    return `/dashboard/${user.role.toLowerCase()}`;
  };

  const getNavLinks = () => {
    if (!user) return [];
    const role = user.role.toLowerCase();
    const links: { label: string; path: string }[] = [];
    switch (role) {
      case 'admin':
        links.push({ label: 'Dashboard', path: '/dashboard/admin' });
        links.push({ label: 'Corsi', path: '/dashboard/admin/courses' });
        links.push({ label: 'Utenti', path: '/dashboard/admin/users' });
        break;
      case 'teacher':
        links.push({ label: 'Dashboard', path: '/dashboard/teacher' });
        links.push({ label: 'I Miei Corsi', path: '/dashboard/teacher/courses' });
        links.push({ label: 'Quiz', path: '/dashboard/teacher/quiz' });
        break;
      case 'student':
        links.push({ label: 'Dashboard', path: '/dashboard/student' });
        links.push({ label: 'I Miei Corsi', path: '/dashboard/student/my-courses' });
        links.push({ label: 'Corsi Disponibili', path: '/dashboard/student/courses' });
        links.push({ label: 'Quiz', path: '/dashboard/student/quiz' });
        break;
    }
    return links;
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'Amministratore';
      case 'TEACHER': return 'Docente';
      case 'STUDENT': return 'Studente';
      default: return role;
    }
  };

  if (isLoading) return null;

  return (
    <header className="sticky top-0 z-50 w-full bg-slate-900/60 backdrop-blur-xl border-b border-white/10 shadow-2xl">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          {/* Brand */}
          <div className="flex items-center gap-4">
            <div 
              className="group flex items-center gap-2 cursor-pointer"
              onClick={() => user ? router.push(getDashboardLink()) : router.push('/login')}
            >
              <div className="w-10 h-10 bg-gradient-to-tr from-cyan-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform duration-200">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <h1 className="text-xl font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors duration-200">
                E-<span className="text-cyan-400 group-hover:text-white">LEARN</span>
              </h1>
            </div>
          </div>

          {/* User Section */}
          <div className="flex items-center gap-4">
            {user && (
              <>
                <div className="hidden md:flex items-center gap-2 mr-4 relative">
                  <button
                    onClick={() => { setIsNavOpen(!isNavOpen); setIsMenuOpen(false); }}
                    className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2"
                  >
                    Naviga
                    <svg className={`h-4 w-4 transition-transform ${isNavOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isNavOpen && (
                    <div className="absolute top-full mt-2 left-0 w-56 bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-3 z-50 animate-fade-in-up">
                      {getNavLinks().map((link) => (
                        <button
                          key={link.path}
                          onClick={() => { router.push(link.path); setIsNavOpen(false); }}
                          className="w-full text-left px-5 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3"
                        >
                          {link.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-full border border-white/5">
                  <NotificationBell 
                    onRemovalNotification={onRemovalNotification}
                    onRoleChangeNotification={() => triggerForceLogout()}
                  />
                  
                  <div className="relative">
                    <button
                      onClick={() => { setIsMenuOpen(!isMenuOpen); setIsNavOpen(false); }}
                      className="flex items-center gap-3 px-3 py-1.5 rounded-full hover:bg-white/10 transition-all duration-200"
                    >
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center border border-white/10 text-xs font-bold text-white">
                        {user.email[0]?.toUpperCase()}
                      </div>
                      <div className="hidden lg:block text-left">
                        <p className="text-xs font-bold text-white leading-tight">{user.email.split('@')[0]}</p>
                        <p className="text-[10px] text-cyan-400 font-medium uppercase tracking-tighter">{getRoleLabel(user.role)}</p>
                      </div>
                      <svg className={`h-4 w-4 text-slate-400 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 mt-3 w-64 bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl py-3 z-50 animate-fade-in-up">
                        <div className="px-5 py-3 border-b border-white/5 mb-2">
                          <p className="text-sm font-bold text-white truncate">{user.email}</p>
                          <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full font-bold uppercase">{user.role}</span>
                        </div>
                        
                        <button
                          onClick={() => { router.push('/profile'); setIsMenuOpen(false); }}
                          className="w-full text-left px-5 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-3"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37a1.724 1.724 0 002.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          Profilo e Sicurezza
                        </button>
                        
                        <button
                          onClick={handleLogout}
                          className="w-full text-left px-5 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-colors flex items-center gap-3"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                          Disconnetti
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
