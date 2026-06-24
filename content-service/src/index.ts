import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { request as httpRequest } from 'undici';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const fastify = Fastify({ logger: true });

if (!process.env.JWT_PUBLIC_KEY_B64) {
  throw new Error('JWT_PUBLIC_KEY_B64 environment variable is required');
}
const JWT_PUBLIC_KEY = Buffer.from(process.env.JWT_PUBLIC_KEY_B64, 'base64').toString('utf-8');
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'video/mp4',
  'video/webm',
  'video/quicktime'
];

const COURSE_SERVICE_URL = process.env.COURSE_SERVICE_URL || 'http://localhost:3003';

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

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
fastify.register(multipart, {
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

interface AuthUser {
  userId: string;
  role: string;
  tokenVersion?: number;
}

async function verifySessionWithTokenVersion(request: any, reply: any): Promise<boolean> {
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
      request.user = { ...userPayload, role: data.role, tokenVersion: data.tokenVersion };
    } else {
      request.user = { ...userPayload, role: data.role };
    }
    return true;
  } catch (err) {
    reply.status(401).send({ error: 'Token non valido o sessione scaduta.' });
    return false;
  }
}

async function getCourseDetails(courseId: string, _authHeader: string, cookieHeader?: string): Promise<{ teacherId: string } | null> {
  if (!UUID_V4_REGEX.test(courseId)) return null;
  try {
    const response = await httpRequest(`${COURSE_SERVICE_URL}/${courseId}`, {
      method: 'GET',
      headers: cookieHeader ? { 'cookie': cookieHeader } : {}
    });
    
    if (response.statusCode === 200) {
      const data = await response.body.json() as any;
      return { teacherId: data.teacherId };
    }
    return null;
  } catch (err) {
    return null;
  }
}

fastify.decorate('authenticate', async function (request: any, reply: any) {
  const isValid = await verifySessionWithTokenVersion(request, reply);
  if (!isValid) {
    throw new Error('Unauthorized');
  }
});

/**
 * Access Point Privato a Tolleranza Zero.
 * Gli STUDENTI non avranno MAI file scaricati in modo statico per evitare leak e copie pirata. 
 * Se il file è isPublic, è possibile scaricarlo anche senza iscrizione.
 */
fastify.get('/:courseId/materials/:contentId', { preValidation: [(fastify as any).authenticate] }, async (request, reply) => {
  const user = request.user as any; 
  const { courseId, contentId } = request.params as any;

  if (!UUID_V4_REGEX.test(courseId) || !UUID_V4_REGEX.test(contentId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  const content = await prisma.content.findUnique({
    where: { id: contentId }
  });

  if (!content || content.courseId !== courseId) {
    return reply.status(404).send({ error: 'Materiale non esistente.' });
  }

  if (user.role === 'TEACHER' || user.role === 'ADMIN') {
    return streamFile(content, reply);
  }

  if (content.isPublic) {
    return streamFile(content, reply);
  }

  try {
    const cookieHeader = request.headers.cookie as string;
    
    const checkRes = await httpRequest(`${COURSE_SERVICE_URL}/${courseId}/check-access/${user.userId}`, {
      method: 'GET',
      headers: {
        'cookie': cookieHeader
      }
    });

    if (checkRes.statusCode !== 200) {
      throw new Error('Impossibile verificare l\'iscrizione al corso.');
    }

    const { hasAccess } = await checkRes.body.json() as any;

    if (!hasAccess) {
      fastify.log.warn(`[ANTI-PIRATERIA] Negato l'accesso. User ${user.userId} ha provato l'accesso al file ${contentId} del corso ${courseId} senza enrollment attivo.`);
      return reply.status(403).send({ error: 'Devi essere iscritto al corso per accedere a questi materiali.' });
    }

    return streamFile(content, reply);

  } catch (err: any) {
    return reply.status(500).send({ error: 'Errore interno nel recupero dati autorizzativi.' });
  }
});

// Helper per stream del file
function isPathSafe(baseDir: string, userPath: string): boolean {
  const absoluteBase = path.resolve(baseDir);
  const resolved = path.resolve(absoluteBase, userPath);
  return resolved.startsWith(absoluteBase);
}

function streamFile(content: any, reply: any) {
  if (!isPathSafe(UPLOAD_DIR, content.filePath)) {
    return reply.status(400).send({ error: 'Percorso file non valido' });
  }
  const filePath = path.join(UPLOAD_DIR, content.filePath);
  
  if (!fs.existsSync(filePath)) {
    return reply.status(404).send({ error: 'File non trovato sul server.' });
  }

  reply.header('Content-Type', content.mimeType || 'application/octet-stream');
  reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(content.title)}"`);
  return reply.send(fs.createReadStream(filePath));
}

function sanitizeFileName(filename: string): string {
  const sanitized = path.basename(filename);
  return sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function getContentTypeFromMime(mimeType: string): 'VIDEO' | 'DOCUMENT' {
  if (mimeType.startsWith('video/')) {
    return 'VIDEO';
  }
  return 'DOCUMENT';
}

const FILE_MAGIC_NUMBERS: Record<string, string[]> = {
  'application/pdf': ['25504446'],
  'application/msword': ['D0CF11E0'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['504B0304'],
  'application/vnd.ms-powerpoint': ['D0CF11E0'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['504B0304'],
  'text/plain': [],
  'video/mp4': ['66747970'],
  'video/webm': ['1A45DFA3'],
  'video/quicktime': ['66747970'],
};

function isValidTextContent(buffer: Buffer): boolean {
  try {
    const text = buffer.toString('utf-8');
    if (text.length === 0 || buffer.includes(0x00)) return false;

    const commonBinaryHeaders = ['89504E47', 'FFD8FFE0', 'FFD8FFE1', '47494638', '504B0304', 'D0CF11E0', '1A45DFA3', '25504446'];
    const hexPrefix = buffer.subarray(0, 4).toString('hex').toUpperCase();
    if (commonBinaryHeaders.some(h => h.startsWith(hexPrefix))) return false;

    const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
    let controlChars = 0;
    for (const byte of sample) {
      if ((byte < 0x09) || (byte > 0x0D && byte < 0x20) || byte === 0x7F) controlChars++;
    }
    return controlChars / Math.max(sample.length, 1) < 0.1;
  } catch {
    return false;
  }
}

function isValidFileType(buffer: Buffer, declaredMime: string): boolean {
  const allowedHexPrefixes = FILE_MAGIC_NUMBERS[declaredMime];
  if (!allowedHexPrefixes) return false;
  if (allowedHexPrefixes.length === 0) {
    return declaredMime !== 'text/plain' || isValidTextContent(buffer);
  }
  const hex = buffer.subarray(0, 8).toString('hex').toUpperCase();
  return allowedHexPrefixes.some(prefix => hex.startsWith(prefix));
}

fastify.post('/:courseId/materials', { preValidation: [(fastify as any).authenticate] }, async (request, reply) => {
  const user = request.user as any;
  const { courseId } = request.params as any;
  const authHeader = request.headers.authorization as string;

  if (!UUID_V4_REGEX.test(courseId)) {
    return reply.status(400).send({ error: 'ID corso non valido.' });
  }

  if (user.role !== 'TEACHER' && user.role !== 'ADMIN') {
    return reply.status(403).send({ error: 'Solo docenti e amministratori possono caricare materiali.' });
  }

  if (user.role === 'TEACHER') {
    const courseDetails = await getCourseDetails(courseId, authHeader, request.headers.cookie);
    if (!courseDetails || courseDetails.teacherId !== user.userId) {
      return reply.status(403).send({ error: 'Non sei il proprietario di questo corso.' });
    }
  }

  const data = await request.file();
  
  if (!data) {
    return reply.status(400).send({ error: 'Nessun file caricato.' });
  }

  const mimeType = data.mimetype;
  
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return reply.status(400).send({ 
      error: 'Tipo di file non consentito.',
      allowedTypes: ALLOWED_MIME_TYPES
    });
  }

  const title = data.filename;
  if (title.length > 255) {
    return reply.status(400).send({ error: 'Nome file troppo lungo (max 255 caratteri).' });
  }

  const originalName = sanitizeFileName(title);
  const fileExt = path.extname(originalName);
  const uniqueName = `${crypto.randomUUID()}${fileExt}`;
  const filePath = path.join(UPLOAD_DIR, uniqueName);

  try {
    const buffer = await data.toBuffer();

    if (buffer.length > 0 && !isValidFileType(buffer, mimeType)) {
      fastify.log.warn(`File rifiutato: MIME dichiarato ${mimeType} non corrisponde ai magic number del file.`);
      return reply.status(400).send({ error: 'Il tipo di file non corrisponde al contenuto.' });
    }
    
    await fsp.writeFile(filePath, buffer);

    const content = await prisma.content.create({
      data: {
        courseId,
        title,
        type: getContentTypeFromMime(mimeType),
        filePath: uniqueName,
        mimeType,
        size: buffer.length.toString(),
        isPublic: false
      }
    });

    fastify.log.info(`File caricato: ${title} (${content.id}) da utente ${user.userId}`);

    return reply.status(201).send({
      success: true,
      content: {
        id: content.id,
        title: content.title,
        type: content.type,
        size: content.size,
        mimeType: content.mimeType,
        isPublic: content.isPublic
      }
    });

  } catch (err: any) {
    fastify.log.error(err.message || err);
    try { await fsp.unlink(filePath); } catch {} // cleanup sul fallimento
    return reply.status(500).send({ error: 'Errore durante il caricamento del file.' });
  }
});

fastify.delete('/:courseId/materials/:contentId', { preValidation: [(fastify as any).authenticate] }, async (request, reply) => {
  const user = request.user as any;
  const { courseId, contentId } = request.params as any;
  const authHeader = request.headers.authorization;

  if (!UUID_V4_REGEX.test(courseId) || !UUID_V4_REGEX.test(contentId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  const content = await prisma.content.findUnique({
    where: { id: contentId }
  });

  if (!content || content.courseId !== courseId) {
    return reply.status(404).send({ error: 'Materiale non esistente.' });
  }

  const courseDetails = await getCourseDetails(courseId, authHeader as string, request.headers.cookie);
  const isTeacher = user.role === 'TEACHER' && courseDetails?.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a eliminare questo materiale.' });
  }

  try {
    if (content.filePath) {
      if (!isPathSafe(UPLOAD_DIR, content.filePath)) {
        return reply.status(400).send({ error: 'Percorso file non valido' });
      }
      const fullPath = path.join(UPLOAD_DIR, content.filePath);
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
    }

    await prisma.content.delete({
      where: { id: contentId }
    });

    fastify.log.info(`File eliminato: ${content.title} (${contentId}) da utente ${user.userId}`);

    return reply.status(200).send({ success: true, message: 'Materiale eliminato con successo.' });

  } catch (err: any) {
    fastify.log.error(err.message || err);
    return reply.status(500).send({ error: 'Errore durante l\'eliminazione del file.' });
  }
});

fastify.addHook('onClose', async () => {
  await prisma.$disconnect();
});

fastify.get('/course/:courseId', { preValidation: [(fastify as any).authenticate] }, async (request, reply) => {
  const user = request.user as any;
  const { courseId } = request.params as any;

  if (!UUID_V4_REGEX.test(courseId)) {
    return reply.status(400).send({ error: 'ID corso non valido.' });
  }
  
  let showAllContents = false;

  try {
    if (user.role === 'TEACHER' || user.role === 'ADMIN') {
      showAllContents = true;
    } else {
      const cookieHeader = request.headers.cookie as string;

      const checkRes = await httpRequest(
        `${COURSE_SERVICE_URL}/${courseId}/check-access/${user.userId}`, 
        {
          method: 'GET',
          headers: {
            'cookie': cookieHeader
          }
        }
      );

      if (checkRes.statusCode === 200) {
        const body = await checkRes.body.json() as any;
        
        if (body.hasAccess) {
          showAllContents = true;
        }
      }
    }
  } catch (err: any) {
  }

  const whereClause: any = { courseId };
  
  // Se l'utente non è iscritto, mostra solo i contenuti pubblici
  if (!showAllContents) {
    whereClause.isPublic = true;
  }

  const contents = await prisma.content.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      type: true,
      size: true,
      isPublic: true
    }
  });
  
  return {
    contents,
    hasFullAccess: showAllContents
  };
});

// Endpoint per aggiornare isPublic di un singolo file
fastify.put('/:courseId/materials/:contentId', { preValidation: [(fastify as any).authenticate] }, async (request, reply) => {
  const user = request.user as any;
  const { courseId, contentId } = request.params as any;
  const { isPublic } = request.body as any;
  const authHeader = request.headers.authorization;

  if (!UUID_V4_REGEX.test(courseId) || !UUID_V4_REGEX.test(contentId)) {
    return reply.status(400).send({ error: 'ID non valido.' });
  }

  const content = await prisma.content.findUnique({
    where: { id: contentId }
  });

  if (!content || content.courseId !== courseId) {
    return reply.status(404).send({ error: 'Materiale non esistente.' });
  }

  const courseDetails = await getCourseDetails(courseId, authHeader as string, request.headers.cookie);

  const isTeacher = user.role === 'TEACHER' && courseDetails?.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a modificare questo materiale.' });
  }

  const updated = await prisma.content.update({
    where: { id: contentId },
    data: { isPublic: !!isPublic }
  });

  fastify.log.info(`Materiale ${contentId} aggiornato: isPublic=${updated.isPublic} da utente ${user.userId}`);

  return { success: true, content: { id: updated.id, isPublic: updated.isPublic } };
});

// Endpoint per aggiornare isPublic di più file (batch)
fastify.put('/:courseId/materials/batch', { preValidation: [(fastify as any).authenticate] }, async (request, reply) => {
  const user = request.user as any;
  const { courseId } = request.params as any;
  const { contentIds, isPublic } = request.body as any;
  const authHeader = request.headers.authorization;

  if (!UUID_V4_REGEX.test(courseId)) {
    return reply.status(400).send({ error: 'ID corso non valido.' });
  }

  if (!Array.isArray(contentIds) || contentIds.length === 0) {
    return reply.status(400).send({ error: 'Devi specificare almeno un ID di contenuto.' });
  }

  const courseDetails = await getCourseDetails(courseId, authHeader as string, request.headers.cookie);
  if (!courseDetails) {
    return reply.status(404).send({ error: 'Corso non trovato.' });
  }

  const isTeacher = user.role === 'TEACHER' && courseDetails.teacherId === user.userId;
  const isAdmin = user.role === 'ADMIN';

  if (!isTeacher && !isAdmin) {
    return reply.status(403).send({ error: 'Non autorizzato a modificare i materiali di questo corso.' });
  }

  const updatedContents = await prisma.content.updateMany({
    where: {
      id: { in: contentIds },
      courseId
    },
    data: { isPublic: !!isPublic }
  });

  fastify.log.info(`Batch update: ${updatedContents.count} materiali aggiornati a isPublic=${!!isPublic} nel corso ${courseId} da utente ${user.userId}`);

  return { 
    success: true, 
    updatedCount: updatedContents.count 
  };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3004;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`Content Service e Zero Trust Policy avviati limitando erogazioni su http://0.0.0.0:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

if (require.main === module) {
  start();
}

export { fastify, prisma };
