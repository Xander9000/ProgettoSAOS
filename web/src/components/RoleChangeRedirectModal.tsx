'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface RoleChangeRedirectModalProps {
  isOpen: boolean;
  countdown?: number;
}

export default function RoleChangeRedirectModal({ 
  isOpen, 
  countdown = 5 
}: RoleChangeRedirectModalProps) {
  const router = useRouter();
  const [seconds, setSeconds] = useState(countdown);

  useEffect(() => {
    if (!isOpen) return;
    
    setSeconds(countdown);
    const timer = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          localStorage.removeItem('user');
          router.replace('/login');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, countdown, router]);

  if (!isOpen) return null;

  const handleRedirectNow = () => {
    localStorage.removeItem('user');
    router.replace('/login');
  };

  const progressPercentage = ((countdown - seconds) / countdown) * 100;

  return (
    <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-md animate-fade-in" />
      <div className="relative bg-slate-900 border border-amber-500/20 rounded-[40px] shadow-2xl p-8 md:p-12 max-w-md w-full animate-fade-in-up">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-20 w-20 rounded-3xl bg-amber-500/10 border border-amber-500/20 mb-8">
            <svg 
              className="h-10 w-10 text-amber-500 animate-pulse" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2.5} 
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
              />
            </svg>
          </div>
          
          <h2 className="text-3xl font-black text-white tracking-tight mb-4">
            Azione Richiesta
          </h2>
          
          <p className="text-slate-400 font-medium leading-relaxed mb-8">
            Il tuo ruolo è stato modificato da un amministratore. È necessario un nuovo login per aggiornare i permessi.
          </p>
          
          <div className="relative inline-flex items-center justify-center mb-8">
            <svg className="w-24 h-24 transform -rotate-90">
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                className="text-white/5"
              />
              <circle
                cx="48"
                cy="48"
                r="40"
                stroke="currentColor"
                strokeWidth="8"
                fill="transparent"
                strokeDasharray={251.2}
                strokeDashoffset={251.2 - (251.2 * progressPercentage) / 100}
                className="text-amber-500 transition-all duration-1000 ease-linear"
              />
            </svg>
            <span className="absolute text-3xl font-black text-white">{seconds}</span>
          </div>
          
          <button
            onClick={handleRedirectNow}
            className="w-full bg-amber-500 hover:bg-amber-400 text-slate-900 font-black py-4 px-6 rounded-2xl transition-all shadow-lg shadow-amber-500/20 active:scale-95 mb-4"
          >
            Sincronizza Ora
          </button>
          
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
            Reindirizzamento automatico a breve
          </p>
        </div>
      </div>
    </div>
  );
}
