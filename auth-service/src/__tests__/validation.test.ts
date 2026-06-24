import { describe, it, expect } from 'vitest';
import { z } from 'zod';

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

const Enable2FASchema = z.object({
  token: z.string().length(6, 'Codice 2FA deve essere di 6 cifre')
});

const Disable2FASchema = z.object({
  currentPassword: z.string().min(1, 'Password richiesta'),
  token: z.string().length(6, 'Codice 2FA deve essere di 6 cifre')
});

describe('Zod Validation Schemas', () => {
  describe('LoginSchema', () => {
    it('should validate correct login data', () => {
      const valid = { email: 'test@example.com', password: 'password123' };
      const result = LoginSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalid = { email: 'not-an-email', password: 'password123' };
      const result = LoginSchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Email non valida');
    });

    it('should reject missing password', () => {
      const invalid = { email: 'test@example.com', password: '' };
      const result = LoginSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Verify2FASchema', () => {
    it('should validate correct 2FA data', () => {
      const valid = { pendingLoginId: '123e4567-e89b-12d3-a456-426614174000', token: '123456' };
      const result = Verify2FASchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      const invalid = { pendingLoginId: 'not-a-uuid', token: '123456' };
      const result = Verify2FASchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject wrong token length', () => {
      const invalid = { pendingLoginId: '123e4567-e89b-12d3-a456-426614174000', token: '123' };
      const result = Verify2FASchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Disable2FASchema', () => {
    it('should validate correct disable data', () => {
      const valid = { currentPassword: 'mypassword', token: '123456' };
      const result = Disable2FASchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject missing password', () => {
      const invalid = { currentPassword: '', token: '123456' };
      const result = Disable2FASchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });

    it('should reject wrong token length', () => {
      const invalid = { currentPassword: 'mypassword', token: '12345' };
      const result = Disable2FASchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('RegisterSchema', () => {
    it('should validate correct registration data', () => {
      const valid = { 
        email: 'test@example.com', 
        password: 'password123', 
        firstName: 'John',
        lastName: 'Doe'
      };
      const result = RegisterSchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject short password', () => {
      const invalid = { 
        email: 'test@example.com', 
        password: 'short', 
        firstName: 'John',
        lastName: 'Doe'
      };
      const result = RegisterSchema.safeParse(invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('Enable2FASchema', () => {
    it('should validate correct token', () => {
      const valid = { token: '123456' };
      const result = Enable2FASchema.safeParse(valid);
      expect(result.success).toBe(true);
    });

    it('should reject wrong token length', () => {
      const invalid = { token: '12345' };
      const result = Enable2FASchema.safeParse(invalid);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('Codice 2FA deve essere di 6 cifre');
    });
  });
});