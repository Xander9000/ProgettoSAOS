import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';

const fastify = Fastify({ logger: true });

async function setup() {
  await fastify.register(rateLimit, {
    max: 10,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip + ':register',
    errorResponseBuilder: function () {
      return {
        code: 429,
        error: 'Troppi tentativi. Riprova tra un minuto.'
      };
    }
  });
}

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const NOTIFICATION_SERVICE_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007';
const INTERNAL_API_KEY: string = process.env.INTERNAL_API_KEY || '';
if (!INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY environment variable is required');
}
if (!process.env.JWT_PUBLIC_KEY_B64) {
  throw new Error('JWT_PUBLIC_KEY_B64 environment variable is required');
}
const JWT_PUBLIC_KEY = Buffer.from(process.env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf-8');

fastify.register(cookie);
fastify.register(jwt, { 
  secret: { public: JWT_PUBLIC_KEY },
  verify: {
    algorithms: ['RS256']
  },
  cookie: {
    cookieName: 'accessToken',
    signed: false
  }
});

const authenticate = async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ error: 'Azione negata, autenticazione richiesta.' });
  }
};

async function proxyToAuth(method: string, path: string, body?: any, requestCookies?: string) {
  const headers: Record<string, string> = {};
  if (body) {
    headers['Content-Type'] = 'application/json';
  }
  if (requestCookies) {
    headers['Cookie'] = requestCookies;
  }
  
  const response = await fetch(`${AUTH_SERVICE_URL}${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
    credentials: 'include'
  });
  return response;
}

async function invalidateUserSessions(userId: string): Promise<boolean> {
  try {
    const response = await fetch(`${AUTH_SERVICE_URL}/invalidate-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({ userId })
    });
    return response.ok;
  } catch (error) {
    fastify.log.error(`Error invalidating sessions: ${error}`);
    return false;
  }
}

async function sendNotification(userId: string, type: string, title: string, message: string): Promise<boolean> {
  try {
    const response = await fetch(`${NOTIFICATION_SERVICE_URL}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({ userId, type, title, message })
    });
    return response.ok;
  } catch (error) {
    fastify.log.error(`Error sending notification: ${error}`);
    return false;
  }
}

fastify.post('/register', async (request, reply) => {
  const body = request.body as { email?: string; password?: string; firstName?: string; lastName?: string; role?: string };
  const { email, password, firstName, lastName, role } = body;
  
  if (!email || !password || !firstName || !lastName) {
    return reply.status(400).send({ error: 'Tutti i campi sono obbligatori' });
  }

  if (typeof email !== 'string' || typeof password !== 'string') {
    return reply.status(400).send({ error: 'Formato dati non valido' });
  }

  const response = await proxyToAuth('POST', '/register', {
    email,
    password,
    firstName,
    lastName
  });

  const data = await response.json();
  
  if (!response.ok) {
    return reply.status(response.status).send(data);
  }

  return {
    success: true,
    userId: data.id,
    email: data.email,
    message: data.message || 'Registrazione completata'
  };
});

fastify.post('/register/verify', async (request, reply) => {
  const body = request.body as { email?: string; code?: string };
  const { email, code } = body;

  if (!email || !code) {
    return reply.status(400).send({ error: 'Email e codice sono obbligatori' });
  }

  const response = await proxyToAuth('POST', '/register/verify', { email, code });
  const data = await response.json();

  if (!response.ok) {
    return reply.status(response.status).send(data);
  }

  return data;
});

fastify.post('/register/resend-code', async (request, reply) => {
  const body = request.body as { email?: string };
  const { email } = body;

  if (!email) {
    return reply.status(400).send({ error: 'Email obbligatoria' });
  }

  const response = await proxyToAuth('POST', '/register/resend-code', { email });
  const data = await response.json();

  if (!response.ok) {
    return reply.status(response.status).send(data);
  }

  return data;
});

fastify.get('/profile', { preValidation: [authenticate] }, async (request, reply) => {
  const userPayload = request.user as { userId: string, role: string };
  const cookies = request.headers.cookie;
  
  const response = await proxyToAuth('GET', `/users/${userPayload.userId}`, undefined, cookies);

  if (!response.ok) {
    return reply.status(response.status).send({ error: 'Utente non trovato' });
  }

  const user = await response.json();
  
  return {
    userId: user.id,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    preferences: user.preferences
  };
});

fastify.get('/verify-role', { preValidation: [authenticate] }, async (request, reply) => {
  const userPayload = request.user as { userId: string, role: string };
  const cookies = request.headers.cookie;
  
  const response = await proxyToAuth('GET', `/users/${userPayload.userId}`, undefined, cookies);

  if (!response.ok) {
    return reply.status(response.status).send({ error: 'Utente non trovato' });
  }

  const user = await response.json();
  
  return {
    userId: userPayload.userId,
    role: user.role,
    roleMatchesToken: user.role === userPayload.role
  };
});

fastify.get('/admin/list', { preValidation: [authenticate] }, async (request, reply) => {
  const userPayload = request.user as any;
  const cookies = request.headers.cookie;

  if (userPayload.role !== 'ADMIN') {
    fastify.log.warn(`Utente ${userPayload.userId} ha tentato di accedere alla route /admin/list senza permessi.`);
    return reply.status(403).send({ error: 'Permessi amministrativi richiesti per questa operazione.' });
  }

  const response = await proxyToAuth('GET', '/users', undefined, cookies);

  if (!response.ok) {
    return reply.status(response.status).send({ error: 'Errore nel recupero utenti' });
  }

  const data = await response.json();
  
  return { users: data.users.map((u: any) => ({ ...u, active: true })) };
});

fastify.get('/admin/teachers', { preValidation: [authenticate] }, async (request, reply) => {
  const userPayload = request.user as any;
  const cookies = request.headers.cookie;

  if (userPayload.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Permessi amministrativi richiesti.' });
  }

  const response = await proxyToAuth('GET', '/teachers', undefined, cookies);

  if (!response.ok) {
    return reply.status(response.status).send({ error: 'Errore nel recupero teachers' });
  }

  const data = await response.json();
  return { teachers: data.teachers };
});

fastify.put<{ Params: { id: string } }>('/:id', { preValidation: [authenticate] }, async (request, reply) => {
  const userPayload = request.user as any;
  const { id: targetUserId } = request.params;
  const { firstName, lastName, role } = request.body as any;
  const cookies = request.headers.cookie;

  if (userPayload.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Permessi amministrativi richiesti.' });
  }

  const targetResponse = await proxyToAuth('GET', `/users/${targetUserId}`, undefined, cookies);
  if (!targetResponse.ok) {
    return reply.status(404).send({ error: 'Utente non trovato.' });
  }
  const targetUser = await targetResponse.json();

  if (userPayload.userId === targetUserId && role !== undefined && role !== userPayload.role) {
    return reply.status(403).send({ error: 'Non puoi modificare il tuo proprio ruolo.' });
  }

  const updateData: any = {};
  let roleChanged = false;

  if (firstName !== undefined) updateData.firstName = firstName;
  if (lastName !== undefined) updateData.lastName = lastName;
  if (role !== undefined) {
    if (!['STUDENT', 'TEACHER', 'ADMIN'].includes(role)) {
      return reply.status(400).send({ error: 'Ruolo non valido.' });
    }
    if (role !== targetUser.role) {
      roleChanged = true;
      updateData.role = role;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { success: true, user: targetUser, roleChanged: false };
  }

  const updateResponse = await proxyToAuth('PUT', `/users/${targetUserId}`, updateData, cookies);
  
  if (!updateResponse.ok) {
    return reply.status(500).send({ error: 'Errore aggiornamento utente' });
  }

  const updatedUser = await updateResponse.json();

  await invalidateUserSessions(targetUserId);
  
  if (roleChanged) {
    const oldRoleLabel = targetUser.role === 'STUDENT' ? 'Studente' : targetUser.role === 'TEACHER' ? 'Docente' : 'Amministratore';
    const newRoleLabel = role === 'STUDENT' ? 'Studente' : role === 'TEACHER' ? 'Docente' : 'Amministratore';
    await sendNotification(
      targetUserId,
      'ROLE_CHANGE',
      'Ruolo aggiornato',
      `Il tuo ruolo è stato modificato da ${oldRoleLabel} a ${newRoleLabel} da un amministratore.`
    );
  }
  
  fastify.log.info(`Utente ${targetUserId} aggiornato da admin ${userPayload.userId}. RoleChanged: ${roleChanged}`);
  
  return { success: true, user: updatedUser, roleChanged, affectedUserId: targetUserId, sessionsInvalidated: true };
});

fastify.delete<{ Params: { id: string } }>('/:id', { preValidation: [authenticate] }, async (request, reply) => {
  const userPayload = request.user as any;
  const { id: targetUserId } = request.params;
  const cookies = request.headers.cookie;

  if (userPayload.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Permessi amministrativi richiesti.' });
  }

  if (targetUserId === userPayload.userId) {
    return reply.status(400).send({ error: 'Non puoi eliminare il tuo proprio account.' });
  }

  const response = await proxyToAuth('DELETE', `/users/${targetUserId}`, undefined, cookies);

  if (!response.ok) {
    return reply.status(404).send({ error: 'Utente non trovato.' });
  }

  await invalidateUserSessions(targetUserId);
  await sendNotification(
    targetUserId,
    'SESSION_INVALIDATED',
    'Account eliminato',
    'Il tuo account è stato eliminato da un amministratore.'
  );

  fastify.log.info(`Utente ${targetUserId} eliminato da admin ${userPayload.userId}.`);
  return { success: true, message: 'Utente eliminato con successo.', sessionsInvalidated: true };
});

fastify.post<{ Params: { id: string } }>('/:id/verify', { preValidation: [authenticate] }, async (request, reply) => {
  const userPayload = request.user as any;
  const { id: targetUserId } = request.params;
  const cookies = request.headers.cookie;

  if (userPayload.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Permessi amministrativi richiesti.' });
  }

  const response = await proxyToAuth('POST', `/users/${targetUserId}/verify`, undefined, cookies);

  if (!response.ok) {
    const data = await response.json();
    return reply.status(response.status).send(data);
  }

  const data = await response.json();
  return { success: true, message: data.message };
});

const start = async () => {
  await setup();
  try {
    const port = Number(process.env.PORT) || 3002;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`User Service (Proxy to Auth) operante su http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { fastify };
