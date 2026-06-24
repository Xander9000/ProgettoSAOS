import { fastify, prisma } from '../index';
import { describe, it, expect, vi, beforeEach, afterAll, beforeAll } from 'vitest';

type VerifySessionMock = { valid: boolean; role?: string; userId?: string };

let mockVerifySessionResponse: VerifySessionMock = { valid: true, role: 'TEACHER', userId: '2' };

const mockFetchResponse = (body: any, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body), headers: new Headers() } as Response);

global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const urlStr = typeof url === 'string' ? url : url.toString();
  if (urlStr.includes('/verify-session')) {
    return mockFetchResponse(mockVerifySessionResponse);
  }
  if (urlStr.includes('/check-teacher/')) {
    return mockFetchResponse({ isTeacher: true });
  }
  return mockFetchResponse({});
});

vi.mock('@prisma/client', () => {
  const mPrisma = {
    course: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    enrollment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
    $disconnect: vi.fn(),
  };
  return { PrismaClient: class { constructor() { return mPrisma; } } };
});

describe('Course Service APIs', () => {
  beforeAll(async () => {
    await fastify.ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await fastify.close();
  });

  it('should fetch public course catalog', async () => {
    (prisma.course.findMany as any).mockResolvedValue([
      { id: '1', title: 'Test Course 1', isPublished: true, teacherId: '2' }
    ]);

    const response = await fastify.inject({
      method: 'GET',
      url: '/catalog'
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe('Test Course 1');
  });

  it('should allow teacher to create a course', async () => {
    mockVerifySessionResponse = { valid: true, role: 'TEACHER', userId: '2' };
    const validTeacherToken = fastify.jwt.sign({ userId: '2', role: 'TEACHER' });
    
    (prisma.course.create as any).mockResolvedValue({
      id: '99',
      title: 'New Course',
      teacherId: '2',
      isPublished: false
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/create',
      payload: { title: 'New Course' },
      headers: {
        authorization: `Bearer ${validTeacherToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.course.title).toBe('New Course');
  });

  it('should allow student to enroll in a course', async () => {
    mockVerifySessionResponse = { valid: true, role: 'STUDENT', userId: '3' };
    const validStudentToken = fastify.jwt.sign({ userId: '3', role: 'STUDENT' });
    
    (prisma.course.findUnique as any).mockResolvedValue({ id: '101', enrollmentType: 'OPEN', teacherId: '2', title: 'Test' });
    (prisma.enrollment.findUnique as any).mockResolvedValue(null); // not already enrolled
    (prisma.enrollment.upsert as any).mockResolvedValue({
      courseId: '101',
      studentId: '3',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const response = await fastify.inject({
      method: 'POST',
      url: '/101/enroll',
      headers: {
        authorization: `Bearer ${validStudentToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
  });

  it('should verify student access to a course enrollment', async () => {
    mockVerifySessionResponse = { valid: true, role: 'ADMIN', userId: 'admin' };
    const validInternalToken = fastify.jwt.sign({ userId: 'admin', role: 'ADMIN' });
    
    (prisma.enrollment.findFirst as any).mockResolvedValue({
      courseId: '101',
      studentId: '3',
      status: 'ACTIVE'
    });

    const response = await fastify.inject({
      method: 'GET',
      url: '/101/check-access/3',
      headers: {
        authorization: `Bearer ${validInternalToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.hasAccess).toBe(true);
  });
});
