import Fastify from 'fastify';
import proxy from '@fastify/http-proxy';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import crypto from 'crypto';

const fastify = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
  trustProxy: true
});

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'x-csrf-token';

function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

async function setup() {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:8080';
  
  fastify.addHook('onRequest', (request, reply, done) => {
    if (request.headers.expect) {
      delete request.headers.expect;
    }
    done();
  });

  fastify.addHook('preParsing', (request, reply, payload, done) => {
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
      const contentType = request.headers['content-type'];
      if (contentType && !contentType.startsWith('application/json') && !contentType.startsWith('multipart/form-data')) {
        return reply.status(415).send({ error: 'Tipo di contenuto non supportato. Usare application/json.' });
      }
    }
    done(null, payload);
  });

  await fastify.register(cookie);

  fastify.addHook('onRequest', (request, reply, done) => {
    const existingCsrf = request.cookies?.[CSRF_COOKIE_NAME];
    if (!existingCsrf) {
      const token = generateCsrfToken();
      reply.setCookie(CSRF_COOKIE_NAME, token, {
        path: '/',
        sameSite: 'none',
        secure: true,
        httpOnly: false
      });
    }
    done();
  });

  fastify.addHook('preHandler', (request, reply, done) => {
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH' || request.method === 'DELETE') {
      if (request.url.startsWith('/api/health')) return done();
      const csrfCookie = request.cookies?.[CSRF_COOKIE_NAME];
      const csrfHeader = request.headers[CSRF_HEADER_NAME] as string | undefined;
      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return reply.status(403).send({ error: 'CSRF token non valido o mancante.' });
      }
    }
    done();
  });

  await fastify.register(helmet, {
    global: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        formAction: ["'self'"]
      }
    }
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('X-XSS-Protection', '1; mode=block');
    return payload;
  });

  await fastify.register(cors, {
    origin: allowedOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'x-csrf-token']
  });

  await fastify.register(rateLimit, {
    max: 150,
    timeWindow: '1 minute',
    errorResponseBuilder: function (request, context) {
      return {
        code: 429,
        error: 'Too Many Requests',
        message: 'Ho rilevato troppe richieste simultanee dal tuo indirizzo IP. Riprova più tardi.',
        date: Date.now(),
        expiresIn: context.after
      }
    }
  });

  function validateServiceUrl(url: string, name: string): void {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error(`Invalid protocol for ${name}: ${parsed.protocol}`);
      }
      if (!parsed.hostname) {
        throw new Error(`Empty hostname for ${name}`);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Invalid URL for ${name}: ${url}`);
      }
      throw err;
    }
  }

  const services = {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    users: process.env.USER_SERVICE_URL || 'http://localhost:3002',
    courses: process.env.COURSE_SERVICE_URL || 'http://localhost:3003',
    content: process.env.CONTENT_SERVICE_URL || 'http://localhost:3004',
    quiz: process.env.QUIZ_SERVICE_URL || 'http://localhost:3005',
    notifications: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3007'
  };

  for (const [name, url] of Object.entries(services)) {
    validateServiceUrl(url, name);
  }

  fastify.log.info(`Configured Auth Service endpoint: ${services.auth}`);

  await fastify.register(proxy, {
    upstream: services.auth,
    prefix: '/api/auth',
    rewritePrefix: '',
    http2: false
  });

  await fastify.register(proxy, {
    upstream: services.users,
    prefix: '/api/users',
    rewritePrefix: '',
    http2: false
  });

  await fastify.register(proxy, {
    upstream: services.courses,
    prefix: '/api/courses',
    rewritePrefix: '',
    http2: false
  });

  await fastify.register(proxy, {
    upstream: services.content,
    prefix: '/api/content',
    rewritePrefix: '',
    http2: false
  });

  await fastify.register(proxy, {
    upstream: services.quiz,
    prefix: '/api/quiz',
    rewritePrefix: '',
    http2: false
  });

  await fastify.register(proxy, {
    upstream: services.notifications,
    prefix: '/api/notifications',
    rewritePrefix: '',
    http2: false
  });

  fastify.get('/api/health', async (_request, _reply) => {
    return {
      status: 'OK',
      service: 'elearning-api-gateway',
      timestamp: new Date().toISOString()
    };
  });
}

const run = async () => {
  await setup();
  const port = Number(process.env.PORT) || 3000;
  try {
    const address = await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`E-Learning API Gateway is running securely on ${address}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

run();
