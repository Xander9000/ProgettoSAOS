'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface User {
  id: string;
  email: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  isVerified: boolean;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState<string | null>(null);

  const handleVerifyUser = async (userId: string) => {
    setVerifying(userId);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/users/${userId}/verify`,
        {
          method: 'POST',
          credentials: 'include'
        }
      );
      
      if (response.ok) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, isVerified: true } : u
        ));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setVerifying(null);
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

        if (sessionData.role !== 'ADMIN') {
          router.push(`/dashboard/${sessionData.role?.toLowerCase()}`);
          return;
        }

        const fetchUsers = async () => {
          try {
            const response = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081'}/api/users/admin/list`,
              { credentials: 'include' }
            );
            
            if (response.ok) {
              const data = await response.json();
              setUsers(data.users);
            }
          } catch (err) {
            console.error(err);
          } finally {
            setLoading(false);
          }
        };

        fetchUsers();
      } catch (error) {
        router.replace('/login');
      }
    }

    checkAuth();
  }, [router]);

  if (loading) return <div className="p-4 text-slate-300">Caricamento...</div>;

  return (
    <div className="text-slate-200">
      <h1 className="text-2xl font-bold mb-6 text-white">Gestione Utenti</h1>
      
      <div className="bg-slate-900/50 backdrop-blur-sm border border-white/10 rounded-lg shadow-md overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Ruolo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Verificato</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-white/5 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{user.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                  {user.firstName} {user.lastName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <span className={`px-2 py-1 rounded text-xs ${
                    user.role === 'ADMIN' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    user.role === 'TEACHER' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                    'bg-green-500/20 text-green-400 border border-green-500/30'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  {user.isVerified ? (
                    <span className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      Sì
                    </span>
                  ) : (
                    <span className="px-2 py-1 rounded text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      No
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                  {!user.isVerified && (
                    <button 
                      onClick={() => handleVerifyUser(user.id)}
                      disabled={verifying === user.id}
                      className="text-amber-400 hover:text-amber-300 hover:underline transition-colors disabled:opacity-50"
                    >
                      {verifying === user.id ? 'Verifica...' : 'Verifica'}
                    </button>
                  )}
                  <button 
                    onClick={() => router.push(`/dashboard/admin/users/${user.id}/edit`)}
                    className="text-cyan-400 hover:text-cyan-300 hover:underline transition-colors"
                  >
                    Modifica
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {users.length === 0 && (
        <p className="text-slate-400">Nessun utente trovato.</p>
      )}
    </div>
  );
}
