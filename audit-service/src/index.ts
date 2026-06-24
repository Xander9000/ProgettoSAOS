import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import amqp from 'amqplib';
import crypto from 'crypto';
import { PrismaClient, AuditSeverity } from '@prisma/client';
import { FastifyRequest } from 'fastify';

if (!process.env.JWT_PUBLIC_KEY_B64) {
  throw new Error('JWT_PUBLIC_KEY_B64 environment variable is required');
}
const JWT_PUBLIC_KEY = Buffer.from(process.env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf-8');

const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

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

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
if (!INTERNAL_API_KEY) {
  throw new Error('INTERNAL_API_KEY environment variable is required');
}

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

const requireAdmin = async (request: any, reply: any) => {
  const user = request.user as { role?: string };
  if (user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Accesso riservato agli amministratori' });
  }
};

const RABBITMQ_URL = process.env.RABBITMQ_URL as string;
if (!RABBITMQ_URL) {
  throw new Error('RABBITMQ_URL environment variable is required');
}
const QUEUE_NAME = 'security_audit_events';
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

const authenticate = async (request: any, reply: any) => {
  try {
    await request.jwtVerify();
    
    const cookieHeader = request.headers.cookie;
    const response = await fetch(`${AUTH_SERVICE_URL}/verify-session`, {
      headers: cookieHeader ? { 'Cookie': cookieHeader } : {}
    });
    
    if (!response.ok) {
      return reply.status(401).send({ error: 'Sessione non valida o scaduta' });
    }
    
    const data = await response.json() as { valid: boolean };
    if (!data.valid) {
      return reply.status(401).send({ error: 'Sessione non valida o scaduta' });
    }
  } catch (err) {
    return reply.status(401).send({ error: 'Autenticazione richiesta' });
  }
};

async function connectToMessageBroker() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    const channel = await connection.createChannel();
    
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    
    fastify.log.info(`[Event Bus] Connesso a RabbitMQ, in ascolto asincrono della coda: ${QUEUE_NAME}...`);
    
    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg) {
        const event = JSON.parse(msg.content.toString());
        
        await prisma.auditLog.create({
          data: {
            eventType: event.type,
            userId: event.userId || null,
            severity: event.severity as AuditSeverity || 'INFO',
            details: event.details || {},
            source: 'RABBITMQ'
          }
        });
        
        if (event.severity === 'CRITICAL' || event.severity === 'HIGH') {
            fastify.log.error(`[AUDIT ALLARME] Evento critico rilevato: ${event.type}! Origine Utente: ${event.userId || 'N/A'}`);
        } else {
            fastify.log.warn(`[AUDIT EVENT] Tipo: ${event.type} | Utente: ${event.userId || 'Sconosciuto'}`);
        }

        channel.ack(msg);
      }
    });

    connection.on('close', () => { fastify.log.error('Connessione RabbitMQ persa'); });

  } catch (error) {
    fastify.log.error('RabbitMQ offline. Il Broker potrebbe non essere ancora pronto.');
  }
}

fastify.get('/logs', { preValidation: [authenticate, requireAdmin] }, async (request, reply) => {
  const logsCount = await prisma.auditLog.count();
  const recentLogs = await prisma.auditLog.findMany({
    take: 50,
    orderBy: { receivedAt: 'desc' }
  });

  return { total_events: logsCount, recent_logs: recentLogs };
});

fastify.post('/webhook', async (request, reply) => {
  if (!isInternalRequest(request)) {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Autenticazione richiesta' });
    }
    const user = request.user as { role?: string };
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Accesso riservato agli amministratori' });
    }
  }

  const event = request.body as any;
  
  await prisma.auditLog.create({
    data: {
      eventType: event.type,
      userId: event.userId || null,
      severity: event.severity as AuditSeverity || 'INFO',
      details: event.details || {},
      source: isInternalRequest(request) ? 'INTERNAL_SERVICE' : 'WEBHOOK'
    }
  });

  fastify.log.info(`[SYNC EVENT] Rilevato evento sincrono: ${event.type} da ${isInternalRequest(request) ? 'servizio interno' : 'admin'}`);
  return { success: true };
});

fastify.addHook('onClose', async () => {
  await prisma.$disconnect();
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3006;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Audit Service Passivo (Immutabile) in attesa su http://0.0.0.0:${port}`);
    
    if (process.env.NODE_ENV !== 'test') {
      connectToMessageBroker();
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { fastify, prisma };
