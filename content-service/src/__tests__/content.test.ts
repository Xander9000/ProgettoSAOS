import { fastify, prisma } from '../index';
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';
import * as undici from 'undici';

vi.mock('@prisma/client', () => {
  const mPrisma = {
    content: {
      findUnique: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

vi.mock('undici', () => {
  return {
    request: vi.fn()
  };
});

describe('Content Service APIs', () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should allow teacher to access materials immediately', async () => {
    const validTeacherToken = fastify.jwt.sign({ userId: '2', role: 'TEACHER' });
    
    (prisma.content.findUnique as any).mockResolvedValue({
      id: 'vid_001', courseId: '101', type: 'VIDEO', title: 'Lezione 1'
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/101/materials/vid_001',
      headers: { authorization: `Bearer ${validTeacherToken}` }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.secureDownloadUrl).toContain('https://s3.elearning.cloud/secure-vault-bucket/vid_001');
    // Undici shouldn't be called for teachers
    expect(undici.request).not.toHaveBeenCalled();
  });

  it('should allow student access if course service verifies enrollment', async () => {
    const validStudentToken = fastify.jwt.sign({ userId: '3', role: 'STUDENT' });
    
    (prisma.content.findUnique as any).mockResolvedValue({
      id: 'vid_001', courseId: '101', type: 'VIDEO', title: 'Lezione 1'
    });

    // Mock the external http request to return { hasAccess: true }
    (undici.request as any).mockResolvedValue({
      statusCode: 200,
      body: {
        json: async () => ({ hasAccess: true })
      }
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/101/materials/vid_001',
      headers: { authorization: `Bearer ${validStudentToken}` }
    });

    expect(response.statusCode).toBe(200);
    expect(undici.request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
  });

  it('should deny student access if course service denies enrollment', async () => {
    const validStudentToken = fastify.jwt.sign({ userId: '3', role: 'STUDENT' });
    
    (prisma.content.findUnique as any).mockResolvedValue({
      id: 'vid_001', courseId: '101', type: 'VIDEO', title: 'Lezione 1'
    });

    // Mock the external http request to return { hasAccess: false }
    (undici.request as any).mockResolvedValue({
      statusCode: 200,
      body: {
        json: async () => ({ hasAccess: false })
      }
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/101/materials/vid_001',
      headers: { authorization: `Bearer ${validStudentToken}` }
    });

    expect(response.statusCode).toBe(403);
  });
});
