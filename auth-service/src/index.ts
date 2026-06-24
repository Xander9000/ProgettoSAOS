import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import rateLimit from '@fastify/rate-limit';
import cookie from '@fastify/cookie';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import nodemailer from 'nodemailer';
import { generateSecret, verify, generateURI } from 'otplib';
import qrcode from 'qrcode';
import { z } from 'zod';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type { RegistrationResponseJSON, AuthenticationResponseJSON, AuthenticatorTransportFuture } from '@simplewebauthn/server';

const prisma = new PrismaClient();

if (!process.env.JWT_PRIVATE_KEY_B64 || !process.env.JWT_PUBLIC_KEY_B64) {
  throw new Error('JWT_PRIVATE_KEY_B64 and JWT_PUBLIC_KEY_B64 environment variables are required');
}
const JWT_PRIVATE_KEY = Buffer.from(process.env.JWT_PRIVATE_KEY_B64, 'base64').toString('utf-8');
const JWT_PUBLIC_KEY = Buffer.from(process.env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf-8');

if (!process.env.COOKIE_SECRET) {
  throw new Error('COOKIE_SECRET environment variable is required');
}
const COOKIE_SECRET = process.env.COOKIE_SECRET;

if (!process.env.TWO_FACTOR_ENCRYPTION_KEY) {
  throw new Error('TWO_FACTOR_ENCRYPTION_KEY environment variable is required');
}
const TWO_FACTOR_ENCRYPTION_KEY = process.env.TWO_FACTOR_ENCRYPTION_KEY;

const fastify = Fastify({ 
  logger: true,
  trustProxy: true 
});

const LoginSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(1, 'Password richiesta')
});

const Verify2FASchema = z.object({
  pendingLoginId: z.string().uuid('ID login non valido'),
  token: z.string().length(6, 'Codice 2FA deve essere di 6 cifre')
});

const RegisterSchema = z.object({
  email: z.string().email('Email non valida'),
  password: z.string().min(8, 'Password deve essere di almeno 8 caratteri'),
  role: z.enum(['STUDENT', 'TEACHER', 'ADMIN']).optional(),
  firstName: z.string().min(1, 'Nome richiesto'),
  lastName: z.string().min(1, 'Cognome richiesto')
});

const VerifyRegistrationSchema = z.object({
  email: z.string().email('Email non valida'),
  code: z.string().regex(/^\d{6}$/, 'Codice di verifica non valido')
});

const ResendRegistrationCodeSchema = z.object({
  email: z.string().email('Email non valida')
});

const RequestPasswordResetSchema = z.object({
  email: z.string().email('Email non valida')
});

const ConfirmPasswordResetSchema = z.object({
  token: z.string().min(20, 'Token di reset non valido'),
  password: z.string().min(8, 'Password deve essere di almeno 8 caratteri')
});

const VERIFICATION_CODE_TTL_MINUTES = 15;
const VERIFICATION_MAX_ATTEMPTS = 5;
const PASSWORD_RESET_TTL_MINUTES = 30;

function generateVerificationCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function hashVerificationCode(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generatePasswordResetToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashPasswordResetToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashRefreshToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function encryptSecret(plaintext: string): string {
  const key = Buffer.from(TWO_FACTOR_ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function tryDecryptSecret(ciphertext: string): string | null {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    return ciphertext;
  }
  for (const ivSize of [12, 16]) {
    try {
      const key = Buffer.from(TWO_FACTOR_ENCRYPTION_KEY, 'hex');
      const iv = Buffer.from(parts[0], 'hex');
      if (iv.length !== ivSize) continue;
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      // try next IV size
    }
  }
  return null;
}

const AUDIT_SERVICE_URL = process.env.AUDIT_SERVICE_URL;

async function reportAuditEvent(eventType: string, payload: Record<string, any>) {
  if (!AUDIT_SERVICE_URL) return;
  try {
    await fetch(`${AUDIT_SERVICE_URL}/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-api-key': INTERNAL_API_KEY
      },
      body: JSON.stringify({ event_type: eventType, payload })
    });
  } catch {
    // fire-and-forget, ignore failures
  }
}

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

function buildEmailMessage(code: string) {
  return `Conferma il tuo account inserendo questo codice: ${code}. Il codice scade tra ${VERIFICATION_CODE_TTL_MINUTES} minuti.`;
}

function buildPasswordResetMessage(resetLink: string) {
  return `Hai richiesto il ripristino della password. Apri questo link per impostare una nuova password: ${resetLink}. Il link scade tra ${PASSWORD_RESET_TTL_MINUTES} minuti.`;
}

async function sendTransactionalEmail(email: string, subject: string, text: string, html: string) {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || 'noreply@localhost';
  const sendmailPath = process.env.SENDMAIL_PATH || 'sendmail';
  const smtpConfigured = Boolean(smtpHost && smtpPort && smtpUser && smtpPass);

  if (smtpConfigured) {
    try {
      const smtpTransport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      await smtpTransport.sendMail({ from, to: email, subject, text, html });
      fastify.log.info({ transport: 'smtp', subject }, 'Email transazionale inviata');
      return true;
    } catch (error) {
      fastify.log.warn({ error, subject }, 'Invio SMTP fallito, provo sendmail');
    }
  }

  try {
    const sendmailTransport = nodemailer.createTransport({
      sendmail: true,
      newline: 'unix',
      path: sendmailPath
    });

    await sendmailTransport.sendMail({ from, to: email, subject, text, html });
    fastify.log.info({ transport: 'sendmail', subject }, 'Email transazionale inviata');
    return true;
  } catch (error) {
    fastify.log.error({ error, subject }, 'Invio email fallito anche con sendmail');
    return false;
  }
}

async function sendRegistrationVerificationEmail(email: string, code: string) {
  const subject = 'Conferma registrazione';
  const text = buildEmailMessage(code);
  const html = `<p>${text}</p><p><strong>${code}</strong></p>`;
  await sendTransactionalEmail(email, subject, text, html);
}

const Enable2FASchema = z.object({
  token: z.string().length(6, 'Codice 2FA deve essere di 6 cifre')
});

const Disable2FASchema = z.object({
  currentPassword: z.string().min(1, 'Password richiesta'),
  token: z.string().length(6, 'Codice 2FA deve essere di 6 cifre')
});

async function setup() {
  await fastify.register(cookie, { secret: COOKIE_SECRET });

  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute'
  });

  await fastify.register(rateLimit, {
    max: 5,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip + ':login',
    global: false,
    allowList: [
      '/refresh',
      '/health'
    ],
    errorResponseBuilder: function (request, context) {
      return {
        code: 429,
        error: 'Too Many Requests',
        message: 'Troppi tentativi di login. Riprova tra un minuto.',
        date: Date.now(),
        expiresIn: context.after
      };
    }
  });

  await fastify.register(jwt, {
    secret: { private: JWT_PRIVATE_KEY, public: JWT_PUBLIC_KEY },
    sign: {
      algorithm: 'RS256',
      expiresIn: '15m'
    },
    verify: {
      algorithms: ['RS256']
    },
    cookie: {
      cookieName: 'accessToken',
      signed: false
    }
  });
}

const INTERNAL_API_KEY: string = (() => {
  const key = process.env.INTERNAL_API_KEY;
  if (!key) throw new Error('INTERNAL_API_KEY environment variable is required');
  return key;
})();

const isInternalRequest = (request: any): boolean => {
  const apiKey = request.headers['x-internal-api-key'];
  if (!apiKey || typeof apiKey !== 'string') return false;
  const keyBuffer = Buffer.from(apiKey);
  const internalBuffer = Buffer.from(INTERNAL_API_KEY);
  if (keyBuffer.length !== internalBuffer.length) return false;
  return crypto.timingSafeEqual(keyBuffer, internalBuffer);
};

const authenticate = async (request: any, reply: any) => {
  if (isInternalRequest(request)) {
    return;
  }
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ error: 'Autenticazione richiesta' });
  }
};

setup().then(() => {
  fastify.post('/login', async (request, reply) => {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      fastify.log.warn({ email, ip: request.ip }, 'Tentativo di login fallito: credenziali non valide');
      return reply.status(401).send({ error: 'Credenziali non valide o utente inesistente' });
    }

    if (!(user as any).isVerified) {
      return reply.status(403).send({ error: 'Account non verificato. Controlla il codice di conferma inviato via email.' });
    }

    if ((user as any).twoFactorEnabled) {
      const pendingLogin = await prisma.pendingLogin.create({
        data: {
          userId: user.id,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        }
      });
      return {
        requires2fa: true,
        pendingLoginId: pendingLogin.id
      };
    }

    const accessToken = fastify.jwt.sign({
      userId: user.id,
      role: user.role,
      tokenVersion: (user as any).tokenVersion ?? 0
    });
    
    const refreshToken = fastify.jwt.sign({ userId: user.id, tokenVersion: (user as any).tokenVersion ?? 0 }, { expiresIn: '7d' });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/'
    };

    reply.setCookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 });
    reply.setCookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 });

    fastify.log.info(`Utente [${user.role}] ${user.id} ha effettuato il login con successo.`);

    return {
      user: { id: user.id, email: user.email, role: user.role },
      message: 'Login effettuato con successo'
    };
  });

  fastify.post("/login/verify-2fa", {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (request: any) => request.ip + ':2fa'
      }
    }
  }, async (request, reply) => {
    const parsed = Verify2FASchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { pendingLoginId, token } = parsed.data;

    const pendingLogin = await prisma.pendingLogin.findUnique({ where: { id: pendingLoginId } });
    if (!pendingLogin) return reply.status(401).send({ error: 'Richiesta di login non valida' });
    if (pendingLogin.usedAt) return reply.status(401).send({ error: 'Richiesta di login già utilizzata' });
    if (pendingLogin.expiresAt < new Date()) return reply.status(401).send({ error: 'Richiesta di login scaduta' });
    if (pendingLogin.attemptCount >= 5) return reply.status(429).send({ error: 'Troppi tentativi. Effettua di nuovo il login.' });

    const user = await prisma.user.findUnique({ where: { id: pendingLogin.userId } });
    if (!user) return reply.status(401).send({ error: 'Utente non trovato' });
    if (!(user as any).twoFactorEnabled) return reply.status(400).send({ error: '2FA non abilitata' });
    if (!(user as any).twoFactorSecret) return reply.status(400).send({ error: '2FA non configurata' });

    const secret = tryDecryptSecret((user as any).twoFactorSecret as string);
    if (!secret) return reply.status(400).send({ error: 'Configurazione 2FA non valida. Effettua di nuovo il login.' });

    const isValid = await verify({ token, secret });
    if (!isValid.valid) {
      await prisma.pendingLogin.update({
        where: { id: pendingLoginId },
        data: { attemptCount: { increment: 1 } }
      });
      return reply.status(401).send({ error: 'Codice 2FA non valido' });
    }

    await prisma.pendingLogin.update({
      where: { id: pendingLoginId },
      data: { usedAt: new Date() }
    });

    const accessToken = fastify.jwt.sign({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
    const refreshToken = fastify.jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, { expiresIn: '7d' });

    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
    reply.setCookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 });
    reply.setCookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 });

    fastify.log.info(`Utente [${user.role}] ${user.id} ha effettuato il login con 2FA.`);
    return { user: { id: user.id, email: user.email, role: user.role }, message: 'Login con 2FA effettuato con successo' };
  });

  fastify.get('/2fa/generate', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: userPayload.userId } });
    
    const secret = generateSecret();
    const encryptedSecret = encryptSecret(secret);
    const otpauth = generateURI({ secret, label: user?.email || 'user', issuer: 'ELearningPlatform' });
    const qrCodeDataURL = await qrcode.toDataURL(otpauth);

    await prisma.user.update({
      where: { id: userPayload.userId },
      data: { twoFactorSecret: encryptedSecret } as any
    });

    return { qrCode: qrCodeDataURL };
  });

  fastify.post('/2fa/enable', { preValidation: [authenticate] }, async (request, reply) => {
    const parsed = Enable2FASchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { token } = parsed.data;
    
    const userPayload = request.user as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: userPayload.userId } });
    if (!user || !(user as any).twoFactorSecret) return reply.status(400).send({ error: 'Generare prima il secret' });

    const secret = tryDecryptSecret((user as any).twoFactorSecret as string);
    if (!secret) return reply.status(400).send({ error: 'Configurazione 2FA non valida. Rigenera il secret.' });
    
    const isValid = await verify({ token, secret });

    if (!isValid.valid) return reply.status(400).send({ error: 'Codice non valido' });

    await prisma.user.update({
      where: { id: userPayload.userId },
      data: { twoFactorEnabled: true } as any
    });
    return { success: true };
  });

  fastify.post('/2fa/disable', { preValidation: [authenticate] }, async (request, reply) => {
    const parsed = Disable2FASchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { currentPassword, token } = parsed.data;

    const userPayload = request.user as { userId: string };
    const user = await prisma.user.findUnique({ where: { id: userPayload.userId } });
    if (!user) return reply.status(404).send({ error: 'Utente non trovato' });
    if (!(user as any).twoFactorEnabled) {
      return reply.status(400).send({ error: 'La 2FA non è attualmente attiva.' });
    }

    if (!bcrypt.compareSync(currentPassword, user.passwordHash)) {
      return reply.status(403).send({ error: 'Password non valida' });
    }

    if (!(user as any).twoFactorSecret) {
      return reply.status(400).send({ error: '2FA non configurata' });
    }

    const secret = tryDecryptSecret((user as any).twoFactorSecret as string);
    if (!secret) return reply.status(400).send({ error: 'Configurazione 2FA non valida.' });

    const isValid = await verify({ token, secret });
    if (!isValid.valid) {
      return reply.status(401).send({ error: 'Codice 2FA non valido' });
    }

    await prisma.user.update({
      where: { id: userPayload.userId },
      data: { twoFactorEnabled: false, twoFactorSecret: null, tokenVersion: { increment: 1 } } as any
    });

    reportAuditEvent('TWO_FACTOR_DISABLED', {
      userId: userPayload.userId,
      ip: request.ip,
      userAgent: request.headers['user-agent']
    });

    return { success: true };
  });

  const rpName = 'E-Learning Platform';
  
  const getRpID = (request: any) => {
    const origin = request?.headers?.origin;
    if (origin) {
      try {
        const url = new URL(origin);
        const rpID = url.hostname;
        const allowedRpIDs = (process.env.ALLOWED_RP_IDS || 'localhost').split(',');
        if (allowedRpIDs.includes(rpID)) return rpID;
      } catch {}
    }
    return process.env.DEFAULT_RP_ID || 'localhost';
  };
  
  const getOrigin = (request: any) => {
    const origin = request?.headers?.origin;
    if (origin) {
      const allowedOrigins = (process.env.ALLOWED_WEBAUTHN_ORIGINS || 'http://localhost:8080,http://localhost:3000').split(',');
      if (allowedOrigins.includes(origin)) return origin;
    }
    return process.env.ALLOWED_WEBAUTHN_ORIGINS?.split(',')[0] || 'http://localhost:8080';
  };

  fastify.get('/webauthn/generate-registration-options', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string; role: string; email?: string };
    const user = await prisma.user.findUnique({ where: { id: userPayload.userId }, include: { passkeys: true } });
    if (!user) return reply.status(404).send({ error: 'Utente non trovato' });

    const currentRpID = getRpID(request);
    const currentOrigin = getOrigin(request);
    fastify.log.info({ rpID: currentRpID, origin: currentOrigin, passkeysCount: user.passkeys.length, headers: request.headers.origin }, 'WebAuthn registration options');
    
    const options = await generateRegistrationOptions({
      rpName,
      rpID: currentRpID,
      userID: Buffer.from(user.id),
      userName: user.email,
      userDisplayName: (user.firstName && user.lastName) ? `${user.firstName} ${user.lastName}` : user.email,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { webauthnCurrentChallenge: options.challenge } as any
    });

    return options;
  });

  fastify.post('/webauthn/verify-registration', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string };
    const body = request.body as RegistrationResponseJSON;

    const user = await prisma.user.findUnique({ where: { id: userPayload.userId } });
    if (!user || !(user as any).webauthnCurrentChallenge) {
      return reply.status(400).send({ error: 'Challenge mancante o utente inesistente' });
    }

    const currentRpID = getRpID(request);
    const currentOrigin = getOrigin(request);
    
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: (user as any).webauthnCurrentChallenge as string,
        expectedOrigin: currentOrigin,
        expectedRPID: currentRpID,
      });
    } catch (error: any) {
      return reply.status(400).send({ error: 'Errore durante la registrazione WebAuthn.' });
    }

    if (verification.verified && verification.registrationInfo) {
      const { credential } = verification.registrationInfo;

      await prisma.passkeyCredential.create({
        data: {
          userId: user.id,
          credentialId: Buffer.from(credential.id, 'base64url'),
          credentialPublicKey: Buffer.from(credential.publicKey),
          counter: credential.counter,
          transports: body.response.transports ? body.response.transports.join(',') : '',
        }
      });

return { verified: true };
    }
    return reply.status(400).send({ error: 'Registrazione passkey fallita' });
  });

  fastify.post('/webauthn/generate-authentication-options', async (request, reply) => {
    const { email } = request.body as any;
    if (!email) return reply.status(400).send({ error: 'Email richiesta' });

    const user = await prisma.user.findUnique({ where: { email }, include: { passkeys: true } });

    if (!user || user.passkeys.length === 0) {
      const fakeChallenge = crypto.randomBytes(32).toString('base64url');
      return {
        challenge: fakeChallenge,
        rpId: getRpID(request),
        allowCredentials: [],
        userVerification: 'preferred',
      };
    }

    const currentRpID = getRpID(request);
    
    const options = await generateAuthenticationOptions({
      rpID: currentRpID,
      allowCredentials: user.passkeys.map(passkey => ({
        id: Buffer.from(passkey.credentialId).toString('base64url'),
        type: 'public-key',
        transports: passkey.transports ? (passkey.transports.split(',') as AuthenticatorTransportFuture[]) : undefined,
      })),
      userVerification: 'preferred',
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { webauthnCurrentChallenge: options.challenge } as any
    });

    return options;
  });

  fastify.post('/webauthn/verify-authentication', async (request, reply) => {
    const { email, body } = request.body as { email: string, body: AuthenticationResponseJSON };
    if (!email || !body) return reply.status(400).send({ error: 'Dati mancanti' });

    const user = await prisma.user.findUnique({ where: { email }, include: { passkeys: true } });
    if (!user || !(user as any).webauthnCurrentChallenge) {
      return reply.status(400).send({ error: 'Utente non pronto per autenticazione webauthn' });
    }

    // Simplewebauthn uses Base64URL for ID, Buffer.from doesn't handle base64url natively, so we need a cleaner check or parse
    // But SimpleWebAuthn's verifyAuthenticationResponse handles a lot of this.
    // For manual lookup, it's safer to compare after parsing.
    
    // We can just find the passkey by matching in array
    // credentialId is stored as Bytes in Prisma, which comes as Buffer.
    const expectedBuffer = Buffer.from(body.id, 'base64url');
    const passkey = user.passkeys.find(p => Buffer.compare(Buffer.from(p.credentialId), expectedBuffer) === 0);
    
    if (!passkey) {
      return reply.status(400).send({ error: 'Passkey non trovata' });
    }

    const currentRpID = getRpID(request);
    const currentOrigin = getOrigin(request);
    
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: (user as any).webauthnCurrentChallenge as string,
        expectedOrigin: currentOrigin,
        expectedRPID: currentRpID,
        credential: {
          id: Buffer.from(passkey.credentialId).toString('base64url'),
          publicKey: new Uint8Array(passkey.credentialPublicKey),
          counter: Number(passkey.counter),
        },
      });
    } catch (error: any) {
      return reply.status(400).send({ error: 'Errore durante l\'autenticazione WebAuthn.' });
    }

    if (verification.verified) {
      await prisma.passkeyCredential.update({
        where: { id: passkey.id },
        data: { counter: verification.authenticationInfo.newCounter }
      });

      await prisma.user.update({
        where: { id: user.id },
        data: { webauthnCurrentChallenge: null }
      });

      const accessToken = fastify.jwt.sign({ userId: user.id, role: user.role, tokenVersion: user.tokenVersion });
      const refreshToken = fastify.jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, { expiresIn: '7d' });

      const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/' };
      reply.setCookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 });
      reply.setCookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 });

      fastify.log.info(`Utente [${user.role}] ${user.id} ha effettuato il login con Passkey.`);
      return { user: { id: user.id, email: user.email, role: user.role }, message: 'Login con Passkey effettuato con successo' };
    }

    return reply.status(400).send({ error: 'Autenticazione passkey fallita' });
  });

  fastify.get('/passkeys', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string };
    const passkeys = await prisma.passkeyCredential.findMany({ where: { userId: userPayload.userId } });
    return passkeys.map(p => ({ id: p.id, createdAt: p.createdAt }));
  });

  fastify.get('/security-status', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: userPayload.userId },
      select: { twoFactorEnabled: true, passkeys: { select: { id: true } } }
    });
    return {
      twoFactorEnabled: user?.twoFactorEnabled || false,
      passkeyCount: user?.passkeys.length || 0
    };
  });

  fastify.delete<{ Params: { id: string } }>('/passkeys/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string };
    const { id } = request.params;
    await prisma.passkeyCredential.deleteMany({ where: { id, userId: userPayload.userId } });
    return { success: true };
  });

  fastify.post('/refresh', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (request: any) => request.ip + ':refresh'
      }
    }
  }, async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    
    if (!refreshToken) {
      return reply.status(401).send({ error: 'Refresh token non fornito' });
    }

    try {
      const decoded: any = fastify.jwt.verify(refreshToken);
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
      
      if (!user) throw new Error('Utente revocato o inesistente');

      if ((user as any).sessionInvalidated) {
        return reply.status(401).send({ error: 'Sessione invalidata. Effettua il login.' });
      }

      if (decoded.tokenVersion !== (user as any).tokenVersion) {
        return reply.status(401).send({ error: 'Sessione invalidata. Effettua il login.' });
      }

      const tokenHash = hashRefreshToken(refreshToken);

      const revoked = await prisma.revokedToken.findUnique({
        where: { tokenHash }
      });
      
      if (revoked) {
        // Replay detected — refresh token already used
        reportAuditEvent('REFRESH_TOKEN_REPLAY', {
          userId: decoded.userId,
          ip: request.ip,
          userAgent: request.headers['user-agent']
        });
        return reply.status(401).send({ error: 'Refresh token già utilizzato. Effettua il login.' });
      }

      // Atomic insert — unique constraint on tokenHash prevents race conditions
      try {
        await prisma.revokedToken.create({
          data: {
            tokenHash,
            userId: decoded.userId,
            expiresAt: new Date(decoded.exp * 1000)
          }
        });
      } catch (err: any) {
        if (err.code === 'P2002') {
          // Unique constraint violation — concurrent refresh detected
          reportAuditEvent('REFRESH_TOKEN_REPLAY', {
            userId: decoded.userId,
            ip: request.ip,
            userAgent: request.headers['user-agent']
          });
          return reply.status(401).send({ error: 'Refresh token già utilizzato. Effettua il login.' });
        }
        throw err;
      }

      const newRefreshToken = fastify.jwt.sign({ userId: user.id, tokenVersion: (user as any).tokenVersion }, { expiresIn: '7d' });
      const newAccessToken = fastify.jwt.sign({ 
        userId: user.id, 
        role: user.role,
        tokenVersion: (user as any).tokenVersion 
      });

      const cookieOptions = {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/'
      };
      reply.setCookie('accessToken', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 });
      reply.setCookie('refreshToken', newRefreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 });
      
      return { message: 'Token aggiornato con successo' };
    } catch (err) {
      return reply.status(401).send({ error: 'Refresh Token invalido o scaduto' });
    }
  });

  fastify.post('/logout', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 minute',
        keyGenerator: (request: any) => request.ip + ':logout'
      }
    }
  }, async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    
    if (!refreshToken) {
      return reply.status(400).send({ error: 'Refresh token richiesto' });
    }

    try {
      const decoded: any = fastify.jwt.verify(refreshToken);
      const expiresAt = new Date(decoded.exp * 1000);
      
      const tokenHash = hashRefreshToken(refreshToken);

      const existing = await prisma.revokedToken.findUnique({ where: { tokenHash } });
      if (!existing) {
        await prisma.revokedToken.create({
          data: {
            tokenHash,
            userId: decoded.userId,
            expiresAt
          }
        });
      }

      await prisma.user.update({
        where: { id: decoded.userId },
        data: { 
          tokenVersion: { increment: 1 }
        }
      });

      reply.clearCookie('accessToken', { path: '/' });
      reply.clearCookie('refreshToken', { path: '/' });

      fastify.log.info(`Logout effettuato. Tutte le sessioni invalidate per utente ${decoded.userId}`);
      
      return { success: true, message: 'Logout effettuato con successo' };
    } catch (err) {
      return reply.status(401).send({ error: 'Token non valido' });
    }
  });

  fastify.post<{ Body: { userId: string } }>('/invalidate-sessions', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string; role: string };
    const { userId } = request.body;
    
    if (!userId) {
      return reply.status(400).send({ error: 'userId richiesto' });
    }

    if (userPayload.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Accesso riservato agli amministratori' });
    }

    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } }
      });

      fastify.log.info(`Sessioni invalidate per utente ${userId}. Nuova tokenVersion: ${user.tokenVersion}`);
      
      return { success: true, message: 'Sessioni invalidate', tokenVersion: user.tokenVersion };
    } catch (err) {
      fastify.log.error(`Errore invalidazione sessioni: ${err}`);
      return reply.status(500).send({ error: 'Errore invalidazione sessioni' });
    }
  });

  fastify.get('/verify', async (request, reply) => {
    try {
      await request.jwtVerify();
      return { valid: true, user: request.user };
    } catch (err) {
      return reply.status(401).send({ valid: false, error: 'Token non valido' });
    }
  });

  fastify.post<{ Body: { email: string; password: string; role: string; firstName?: string; lastName?: string; preferences?: object } }>('/register', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request) => request.ip + ':register'
      }
    }
  }, async (request, reply) => {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }
    const { email, password, firstName, lastName } = parsed.data;
    const preferences = (request.body as any)?.preferences;

    if (password.length < 8) {
      return reply.status(400).send({ error: 'La password deve essere di almeno 8 caratteri' });
    }

    if (!/[A-Z]/.test(password)) {
      return reply.status(400).send({ error: 'La password deve contenere almeno una lettera maiuscola' });
    }

    if (!/[a-z]/.test(password)) {
      return reply.status(400).send({ error: 'La password deve contenere almeno una lettera minuscola' });
    }

    if (!/[0-9]/.test(password)) {
      return reply.status(400).send({ error: 'La password deve contenere almeno un numero' });
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return reply.status(400).send({ error: 'La password deve contenere almeno un carattere speciale' });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return reply.status(409).send({ error: 'Registrazione non riuscita. Controlla i dati e riprova.' });
    }

    const role = 'STUDENT';

    const passwordHash = bcrypt.hashSync(password, 10);

    const verificationCode = generateVerificationCode();
    const verificationCodeHash = hashVerificationCode(verificationCode);
    const verificationCodeExpiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        firstName: escapeHtml(firstName),
        lastName: escapeHtml(lastName),
        preferences: preferences || { receiveEmails: true },
        isVerified: false,
        verificationCodeHash,
        verificationCodeExpiresAt,
        verificationAttempts: 0
      }
    });

    await sendRegistrationVerificationEmail(email, verificationCode);

    fastify.log.info(`Nuovo utente registrato: ${user.id} con ruolo ${role}`);

    return {
      success: true,
      message: 'Registrazione completata. Inserisci il codice di conferma ricevuto via email.',
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName
    };
  });

  fastify.post('/register/verify', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request: any) => request.ip + ':verify'
      }
    }
  }, async (request, reply) => {
    const parsed = VerifyRegistrationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { email, code } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return reply.status(400).send({ error: 'Codice non valido o scaduto' });
    }

    if ((user as any).isVerified) {
      return { success: true, message: 'Account già verificato' };
    }

    if (!(user as any).verificationCodeHash || !(user as any).verificationCodeExpiresAt) {
      return reply.status(400).send({ error: 'Nessun codice attivo. Richiedi un nuovo codice.' });
    }

    if (new Date((user as any).verificationCodeExpiresAt).getTime() < Date.now()) {
      return reply.status(400).send({ error: 'Codice scaduto. Richiedi un nuovo codice.' });
    }

    if (((user as any).verificationAttempts ?? 0) >= VERIFICATION_MAX_ATTEMPTS) {
      return reply.status(429).send({ error: 'Troppi tentativi. Richiedi un nuovo codice.' });
    }

    const inputHash = hashVerificationCode(code);
    const expectedHash = (user as any).verificationCodeHash as string;
    const inputBuffer = Buffer.from(inputHash);
    const expectedBuffer = Buffer.from(expectedHash);
    const isValid = inputBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(inputBuffer, expectedBuffer);

    if (!isValid) {
      await prisma.user.update({
        where: { id: user.id },
        data: { verificationAttempts: { increment: 1 } } as any
      });
      return reply.status(400).send({ error: 'Codice non valido o scaduto' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCodeHash: null,
        verificationCodeExpiresAt: null,
        verificationAttempts: 0
      } as any
    });

    return { success: true, message: 'Account verificato con successo' };
  });

  fastify.post('/register/resend-code', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 minute',
        keyGenerator: (request) => request.ip + ':register-resend'
      }
    }
  }, async (request, reply) => {
    const parsed = ResendRegistrationCodeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { email } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || (user as any).isVerified) {
      return { success: true, message: 'Se l\'email esiste, un nuovo codice è stato inviato.' };
    }

    const verificationCode = generateVerificationCode();
    const verificationCodeHash = hashVerificationCode(verificationCode);
    const verificationCodeExpiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MINUTES * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationCodeHash,
        verificationCodeExpiresAt,
        verificationAttempts: 0
      } as any
    });

    await sendRegistrationVerificationEmail(email, verificationCode);

    return { success: true, message: 'Se l\'email esiste, un nuovo codice è stato inviato.' };
  });

  fastify.post('/password-reset/request', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request) => request.ip + ':password-reset-request'
      }
    }
  }, async (request, reply) => {
    const parsed = RequestPasswordResetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { email } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      return { success: true, message: 'Se l\'email esiste, riceverai un link per il reset della password.' };
    }

    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000);
    const appPublicUrl = process.env.APP_PUBLIC_URL || 'http://localhost:8080';
    const resetLink = `${appPublicUrl}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: expiresAt
      } as any
    });

    const subject = 'Ripristino password';
    const text = buildPasswordResetMessage(resetLink);
    const html = `<p>${text}</p><p><a href="${resetLink}">Ripristina password</a></p>`;
    await sendTransactionalEmail(email, subject, text, html);

    return { success: true, message: 'Se l\'email esiste, riceverai un link per il reset della password.' };
  });

  fastify.post('/password-reset/confirm', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 minute',
        keyGenerator: (request: any) => request.ip + ':reset-confirm'
      }
    }
  }, async (request, reply) => {
    const parsed = ConfirmPasswordResetSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.issues[0].message });
    }

    const { token, password } = parsed.data;
    const tokenHash = hashPasswordResetToken(token);
    const user = await prisma.user.findFirst({
      where: { passwordResetTokenHash: tokenHash }
    });

    if (!user || !(user as any).passwordResetTokenExpiresAt) {
      return reply.status(400).send({ error: 'Token non valido o scaduto' });
    }

    if (new Date((user as any).passwordResetTokenExpiresAt).getTime() < Date.now()) {
      return reply.status(400).send({ error: 'Token non valido o scaduto' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        tokenVersion: { increment: 1 }
      } as any
    });

    return { success: true, message: 'Password aggiornata con successo' };
  });

  fastify.get('/users', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userPayload = request.user as { userId: string; role: string };

      if (userPayload.role !== 'ADMIN') {
        return reply.status(403).send({ error: 'Accesso negato' });
      }

      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          preferences: true,
          createdAt: true,
          updatedAt: true,
          isVerified: true
        }
      });

      return { users };
    } catch (err) {
      return reply.status(401).send({ error: 'Token non valido' });
    }
  });

  fastify.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      return reply.status(401).send({ error: 'Autenticazione richiesta' });
    }

    const userPayload = request.user as { userId: string; role: string };
    const { id } = request.params;

    if (userPayload.role !== 'ADMIN' && userPayload.userId !== id) {
      return reply.status(403).send({ error: 'Accesso negato. Puoi visualizzare solo il tuo profilo.' });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        preferences: true,
        createdAt: true,
        updatedAt: true,
        isVerified: true
      }
    });

    if (!user) {
      return reply.status(404).send({ error: 'Utente non trovato' });
    }

    return user;
  });

  fastify.put<{ Params: { id: string }; Body: { email?: string; firstName?: string; lastName?: string; preferences?: object; role?: string } }>('/users/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string; role: string };
    const { id } = request.params;
    const { email, firstName, lastName, preferences, role } = request.body;

    if (userPayload.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Solo gli amministratori possono modificare gli utenti.' });
    }

    try {
      let roleChanged = false;
      const updateData: any = {};
      if (email !== undefined) updateData.email = email;
      if (firstName !== undefined) updateData.firstName = escapeHtml(firstName);
      if (lastName !== undefined) updateData.lastName = escapeHtml(lastName);
      if (preferences !== undefined) updateData.preferences = preferences;
      
      if (role !== undefined) {
        const validRoles = ['STUDENT', 'TEACHER', 'ADMIN'];
        if (!validRoles.includes(role)) {
          return reply.status(400).send({ error: 'Ruolo non valido. Valori consentiti: STUDENT, TEACHER, ADMIN' });
        }
        
        const currentUser = await prisma.user.findUnique({ where: { id } });
        if (!currentUser) {
          return reply.status(404).send({ error: 'Utente non trovato' });
        }
        
        if (currentUser.role !== role) {
          updateData.role = role;
          updateData.tokenVersion = { increment: 1 };
          roleChanged = true;
          fastify.log.info(`Ruolo utente ${id} cambiato da ${currentUser.role} a ${role}`);
        }
      }

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({ error: 'Nessun campo da aggiornare' });
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          preferences: true,
          updatedAt: true
        }
      });

      fastify.log.info(`Utente ${id} aggiornato`);

      return { ...user, roleChanged };
    } catch (err) {
      fastify.log.error(`Errore aggiornamento utente: ${err}`);
      return reply.status(500).send({ error: 'Errore aggiornamento utente' });
    }
  });

  fastify.delete<{ Params: { id: string } }>('/users/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string; role: string };
    const { id } = request.params;

    if (userPayload.role !== 'ADMIN' && userPayload.userId !== id) {
      return reply.status(403).send({ error: 'Accesso negato. Solo gli amministratori possono eliminare altri utenti.' });
    }

    try {
      await prisma.user.delete({ where: { id } });
      fastify.log.info(`Utente ${id} eliminato da ${userPayload.userId}`);
      return { success: true, message: 'Utente eliminato' };
    } catch (err) {
      return reply.status(500).send({ error: 'Errore eliminazione utente' });
    }
  });

  fastify.post<{ Params: { id: string } }>('/users/:id/verify', { preValidation: [authenticate] }, async (request, reply) => {
    const userPayload = request.user as { userId: string; role: string };
    const { id } = request.params;

    if (userPayload.role !== 'ADMIN') {
      return reply.status(403).send({ error: 'Accesso riservato agli amministratori' });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return reply.status(404).send({ error: 'Utente non trovato' });
      }

      if ((user as any).isVerified) {
        return { success: true, message: 'Utente già verificato' };
      }

      await prisma.user.update({
        where: { id },
        data: {
          isVerified: true,
          verificationCodeHash: null,
          verificationCodeExpiresAt: null,
          verificationAttempts: 0
        } as any
      });

      fastify.log.info(`Utente ${id} verificato manualmente da admin ${userPayload.userId}`);
      return { success: true, message: 'Utente verificato con successo' };
    } catch (err) {
      fastify.log.error(`Errore verifica utente: ${err}`);
      return reply.status(500).send({ error: 'Errore verifica utente' });
    }
  });

  fastify.get<{ Params: { id: string } }>('/check-teacher/:id', { preValidation: [authenticate] }, async (request, reply) => {
    const { id } = request.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { role: true }
    });

    if (!user) {
      return reply.status(404).send({ isTeacher: false, error: 'Utente non trovato' });
    }

    return { isTeacher: user.role === 'TEACHER', role: user.role };
  });

  fastify.get('/teachers', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 minute',
        keyGenerator: (request: any) => request.ip + ':teachers'
      }
    }
  }, async (request, reply) => {
    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    return { teachers };
  });

  fastify.post<{ Body: { ids: string[] } }>('/users/batch', { preValidation: [authenticate] }, async (request, reply) => {
    const { ids } = request.body;

    if (!ids || !Array.isArray(ids)) {
      return reply.status(400).send({ error: 'Array di IDs richiesto' });
    }

    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true
      }
    });

    return { users };
  });

  fastify.get('/verify-session', async (request, reply) => {
    try {
      await request.jwtVerify();
      const userPayload = request.user as { userId: string; tokenVersion: number };
      
      const user = await prisma.user.findUnique({
        where: { id: userPayload.userId },
        select: { tokenVersion: true, role: true, email: true, sessionInvalidated: true }
      });
      
      if (!user) {
        return reply.status(401).send({ valid: false, error: 'Utente non trovato', invalidated: true });
      }
      
      if (user.sessionInvalidated) {
        return reply.status(401).send({ valid: false, error: 'Sessione invalidata. Effettua il login.', invalidated: true });
      }
      
      if (userPayload.tokenVersion !== user.tokenVersion) {
        return reply.status(401).send({ 
          valid: false, 
          error: 'Sessione scaduta. Effettua il login.' 
        });
      }
      
      return { 
        valid: true, 
        userId: userPayload.userId,
        role: user.role,
        email: user.email,
        tokenVersion: user.tokenVersion
      };
    } catch (err) {
      return reply.status(401).send({ valid: false, error: 'Token non valido' });
    }
  });

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  const start = async () => {
    try {
      const port = Number(process.env.PORT) || 3001;
      await fastify.listen({ port, host: '0.0.0.0' });
      fastify.log.info(`Auth Service è in ascolto in maniera sicura su http://0.0.0.0:${port}`);
    } catch (err) {
      fastify.log.error(err);
      process.exit(1);
    }
  };

  start();
});

export { fastify, prisma };
