import { fastify } from '../index';
import { PrismaClient } from '@prisma/client';
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';

const prisma = new PrismaClient();

vi.mock('@prisma/client', () => {
  const mPrisma = {
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

describe('User Service APIs', () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should fetch user profile', async () => {
    const mockUser = {
      id: '123',
      role: 'STUDENT',
      firstName: 'Test',
      lastName: 'User',
      preferences: { receiveEmails: true }
    };
    (prisma.user.findUnique as any).mockResolvedValue(mockUser);

    const validToken = fastify.jwt.sign({ userId: '123', role: 'STUDENT' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/profile',
      headers: {
        authorization: `Bearer ${validToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.firstName).toBe('Test');
    expect(body.preferences.receiveEmails).toBe(true);
  });

  it('should deny /admin/list to non-admin users', async () => {
    const validStudentToken = fastify.jwt.sign({ userId: '123', role: 'STUDENT' });

    const response = await fastify.inject({
      method: 'GET',
      url: '/admin/list',
      headers: {
        authorization: `Bearer ${validStudentToken}`
      }
    });

    expect(response.statusCode).toBe(403);
  });

  it('should allow /admin/list for admin users', async () => {
    const validAdminToken = fastify.jwt.sign({ userId: '999', role: 'ADMIN' });
    
    (prisma.user.findMany as any).mockResolvedValue([
      { id: '1', role: 'ADMIN', email: 'admin@local' },
      { id: '2', role: 'TEACHER', email: 'teacher@local' }
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/admin/list',
      headers: {
        authorization: `Bearer ${validAdminToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.users).toHaveLength(2);
    expect(body.users[0].active).toBe(true);
  });
});
