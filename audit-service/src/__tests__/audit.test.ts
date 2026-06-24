import { fastify, prisma } from '../index';
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';

vi.mock('@prisma/client', () => {
  const mPrisma = {
    auditLog: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

describe('Audit Service APIs', () => {
  beforeAll(async () => {
    // Set NODE_ENV to test to prevent rabbitmq connection attempts during unit tests (handled in index.ts change)
    process.env.NODE_ENV = 'test';
    await fastify.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should accept webhook sync events and save to DB', async () => {
    (prisma.auditLog.create as any).mockResolvedValue({});

    const response = await fastify.inject({
      method: 'POST',
      url: '/webhook',
      payload: {
        type: 'UNAUTHORIZED_ACCESS_ATTEMPT',
        userId: '123_hacker',
        severity: 'HIGH',
        details: { ip: '192.168.1.1' }
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(prisma.auditLog.create).toHaveBeenCalledOnce();
    
    const callArg = (prisma.auditLog.create as any).mock.calls[0][0];
    expect(callArg.data.source).toBe('WEBHOOK');
    expect(callArg.data.eventType).toBe('UNAUTHORIZED_ACCESS_ATTEMPT');
  });

  it('should return paginated logs', async () => {
    (prisma.auditLog.count as any).mockResolvedValue(100);
    (prisma.auditLog.findMany as any).mockResolvedValue([
      { id: 1, eventType: 'LOGIN', severity: 'INFO' },
      { id: 2, eventType: 'FAILED_LOGIN', severity: 'WARNING' }
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/logs'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.total_events).toBe(100);
    expect(body.recent_logs).toHaveLength(2);
    expect(body.recent_logs[0].eventType).toBe('LOGIN');
  });
});
