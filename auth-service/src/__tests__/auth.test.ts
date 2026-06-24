import { fastify, prisma } from '../index';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import bcrypt from 'bcryptjs';

// Mock the Prisma client
vi.mock('@prisma/client', () => {
  const mPrisma = {
    user: {
      findUnique: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

describe('Auth Service APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should login successfully with valid credentials', async () => {
    const passwordHash = bcrypt.hashSync('correctpassword', 10);
    const mockUser = {
      id: '123-uuid',
      email: 'test@elearning.local',
      role: 'STUDENT',
      passwordHash,
      isVerified: true
    };

    (prisma.user.findUnique as any).mockResolvedValue(mockUser);

    const response = await fastify.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email: 'test@elearning.local',
        password: 'correctpassword'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');
    expect(body.user.email).toBe('test@elearning.local');
    expect(body.message).toBe('Login effettuato con successo');
  });

  it('should fail login with invalid password', async () => {
    const passwordHash = bcrypt.hashSync('correctpassword', 10);
    const mockUser = {
      id: '123-uuid',
      email: 'test@elearning.local',
      role: 'STUDENT',
      passwordHash,
      isVerified: true
    };

    (prisma.user.findUnique as any).mockResolvedValue(mockUser);

    const response = await fastify.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email: 'test@elearning.local',
        password: 'wrongpassword'
      }
    });

    expect(response.statusCode).toBe(401);
    const body = JSON.parse(response.payload);
    expect(body.error).toBe('Credenziali non valide o utente inesistente');
  });

  it('should fail login for non-existent user', async () => {
    (prisma.user.findUnique as any).mockResolvedValue(null);

    const response = await fastify.inject({
      method: 'POST',
      url: '/login',
      payload: {
        email: 'ghost@elearning.local',
        password: 'password'
      }
    });

    expect(response.statusCode).toBe(401);
  });
});
