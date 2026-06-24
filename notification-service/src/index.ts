import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import crypto from 'crypto';

const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

if (!process.env.JWT_PUBLIC_KEY_B64) {
  throw new Error('JWT_PUBLIC_KEY_B64 environment variable is required');
}
const JWT_PUBLIC_KEY = Buffer.from(process.env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf-8');
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL || 'http://localhost:3006';

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

interface AuthUser {
  userId: string;
  role: string;
  tokenVersion?: number;
}

async function verifySessionWithTokenVersion(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  try {
    await request.jwtVerify();
    const userPayload = request.user as AuthUser;
    
    const cookieHeader = request.headers.cookie;
    
    const response = await fetch(`${AUTH_SERVICE_URL}/verify-session`, {
      headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
    });
    
    if (!response.ok) {
      reply.status(401).send({ error: 'Token non valido o sessione scaduta.', invalidated: true });
      return false;
    }
    
    const data = await response.json() as { valid: boolean; role?: string; userId?: string; tokenVersion?: number; updated?: boolean };
    
    if (!data.valid) {
      reply.status(401).send({ error: 'Token non valido o sessione scaduta.', invalidated: true });
      return false;
    }
    
    if (data.updated) {
      (request as any).user = { ...userPayload, role: data.role, tokenVersion: data.tokenVersion };
    } else {
      (request as any).user = { ...userPayload, role: data.role };
    }
    return true;
  } catch (err) {
    fastify.log.error({ err }, 'DEBUG: verifySessionWithTokenVersion error');
    reply.status(401).send({ error: 'Token non valido o sessione scaduta.' });
    return false;
  }
}

fastify.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
  const isValid = await verifySessionWithTokenVersion(request, reply);
  if (!isValid) {
    throw new Error('Unauthorized');
  }
});

interface CreateNotificationBody {
  userId: string;
  type: 'ENROLLMENT' | 'REMOVAL' | 'MESSAGE' | 'ROLE_CHANGE' | 'SESSION_INVALIDATED';
  title: string;
  message: string;
  courseId?: string;
}

const INTERNAL_API_KEY: string = process.env.INTERNAL_API_KEY || (() => { throw new Error('INTERNAL_API_KEY environment variable is required'); })();

const isInternalRequest = (request: FastifyRequest): boolean => {
  const apiKey = request.headers['x-internal-api-key'];
  if (!apiKey || typeof apiKey !== 'string') return false;
  try {
    const keyBuffer = Buffer.from(apiKey);
    const internalBuffer = Buffer.from(INTERNAL_API_KEY);
    if (keyBuffer.length !== internalBuffer.length) return false;
    return crypto.timingSafeEqual(keyBuffer, internalBuffer);
  } catch {
    return false;
  }
};

const requireInternalOrAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (isInternalRequest(request)) return;

  try {
    await request.jwtVerify();
    const user = request.user as AuthUser;
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Accesso riservato. Solo servizi interni o amministratori.' });
    }
  } catch (err) {
    return reply.status(401).send({ error: 'Autenticazione richiesta' });
  }
};

async function sendAuditEvent(eventType: string, userId: string | null, severity: string, details: any) {
  try {
    await fetch(`${AUDIT_SERVICE_URL}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({ type: eventType, userId, severity, details })
    });
  } catch (err) {
    fastify.log.error({ err }, 'Failed to send audit event');
  }
}

interface NotificationParams {
  id: string;
}

interface UserNotificationsParams {
  userId: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

fastify.addHook('onClose', async () => {
  await prisma.$disconnect();
});

fastify.get('/stream', { preValidation: [(fastify as any).authenticate] }, async (request: any, reply: FastifyReply) => {
  const userId = request.user.userId;
  const lastCheck = (request.query as { lastCheck?: string }).lastCheck;
  const since = lastCheck ? new Date(lastCheck) : new Date(Date.now() - 60000);
  const timeout = 30000;

  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const newNotifications = await prisma.notification.findMany({
      where: {
        userId,
        createdAt: { gt: since }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    if (newNotifications.length > 0) {
      const unreadCount = await prisma.notification.count({
        where: { userId, isRead: false }
      });
      return { notifications: newNotifications, unreadCount, hasMore: true, timestamp: new Date().toISOString() };
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false }
  });
  return { notifications: [], unreadCount, hasMore: false, heartbeat: true, timestamp: new Date().toISOString() };
});

fastify.get('/health', async (request, reply) => {
  return { status: 'OK', service: 'notification-service' };
});

fastify.post<{ Body: CreateNotificationBody }>('/', { preValidation: [requireInternalOrAdmin] }, async (request: FastifyRequest<{ Body: CreateNotificationBody }>, reply: FastifyReply) => {
  const { userId, type, title, message, courseId } = request.body;

  if (!userId || !type || !title || !message) {
    return reply.status(400).send({ error: 'Parametri mancanti: userId, type, title, message sono richiesti' });
  }

  const notification = await prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      courseId: courseId || null,
      isRead: false
    }
  });

  fastify.log.info(`Notifica creata: ${notification.id} per utente ${userId}, tipo ${type}`);

  if (!isInternalRequest(request)) {
    const user = request.user as AuthUser;
    sendAuditEvent('NOTIFICATION_CREATED', user.userId, 'INFO', {
      notificationId: notification.id,
      targetUserId: userId,
      type,
      title
    });
  }

  return { success: true, notification };
});

fastify.post<{ Body: { userIds: string[]; type: string; title: string; message: string; courseId?: string } }>('/bulk', { preValidation: [requireInternalOrAdmin] }, async (request, reply) => {
  const { userIds, type, title, message, courseId } = request.body;

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return reply.status(400).send({ error: 'userIds deve essere un array non vuoto' });
  }

  const notifications = await prisma.notification.createMany({
    data: userIds.map(userId => ({
      userId,
      type,
      title,
      message,
      courseId: courseId || null,
      isRead: false
    }))
  });

  fastify.log.info(`${notifications.count} notifiche create per tipo ${type}`);

  if (!isInternalRequest(request)) {
    const user = request.user as AuthUser;
    sendAuditEvent('NOTIFICATIONS_BULK_CREATED', user.userId, 'INFO', {
      count: notifications.count,
      targetUserIds: userIds,
      type,
      title
    });
  }

  return { success: true, count: notifications.count };
});

fastify.get('/', { preValidation: [(fastify as any).authenticate] }, async (request: any, reply: FastifyReply) => {
  const user = request.user;
  const userId = user.userId;
  const { unreadOnly } = request.query as { unreadOnly?: string };

  const where: any = { userId };
  if (unreadOnly === 'true') {
    where.isRead = false;
  }

  const notifications = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50
  });

  const unreadCount = await prisma.notification.count({
    where: { userId, isRead: false }
  });

  return { notifications, unreadCount };
});

fastify.get('/count', { preValidation: [(fastify as any).authenticate] }, async (request: any, reply: FastifyReply) => {
  const userId = request.user.userId;

  const count = await prisma.notification.count({
    where: { userId, isRead: false }
  });

  return { unreadCount: count };
});

fastify.put('/:read', { preValidation: [(fastify as any).authenticate] }, async (request: any, reply: FastifyReply) => {
  const userId = request.user.userId;
  const { notificationId } = request.body as { notificationId?: string };

  if (!notificationId) {
    return reply.status(400).send({ error: 'notificationId richiesto' });
  }

  const notification = await prisma.notification.findFirst({
    where: { id: notificationId, userId }
  });

  if (!notification) {
    return reply.status(404).send({ error: 'Notifica non trovata' });
  }

  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { isRead: true }
  });

  return { success: true };
});

fastify.put('/read-all', { preValidation: [(fastify as any).authenticate] }, async (request: any, reply: FastifyReply) => {
  const userId = request.user.userId;

  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true }
  });

  fastify.log.info(`Tutte le notifiche marcate come lette per utente ${userId}`);

  return { success: true };
});

fastify.delete('/:id', { preValidation: [(fastify as any).authenticate] }, async (request: any, reply: FastifyReply) => {
  const userId = request.user.userId;
  const { id } = request.params;

  const notification = await prisma.notification.findFirst({
    where: { id, userId }
  });

  if (!notification) {
    return reply.status(404).send({ error: 'Notifica non trovata' });
  }

  await prisma.notification.deleteMany({
    where: { id, userId }
  });

  return { success: true, message: 'Notifica eliminata' };
});

fastify.delete('/clear', { preValidation: [(fastify as any).authenticate] }, async (request: any, reply: FastifyReply) => {
  const userId = request.user.userId;

  await prisma.notification.deleteMany({
    where: { userId, isRead: true }
  });

  fastify.log.info(`Notifiche lette eliminate per utente ${userId}`);

  return { success: true };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3007;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Notification Service in ascolto su http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { fastify, prisma };
