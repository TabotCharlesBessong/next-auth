import { HashService, createHashService } from '../HashService';

describe('HashService', () => {
  let hashService: HashService;

  beforeEach(() => {
    hashService = createHashService();
  });

  describe('hashPassword', () => {
    it('should hash a password successfully', async () => {
      const password = 'testPassword123!';
      const hashedPassword = await hashService.hashPassword(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(50);
    });

    it('should generate different hashes for the same password', async () => {
      const password = 'testPassword123!';
      const hash1 = await hashService.hashPassword(password);
      const hash2 = await hashService.hashPassword(password);

      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty password', async () => {
      await expect(hashService.hashPassword('')).rejects.toThrow('Password cannot be empty');
    });

    it('should handle very long passwords', async () => {
      const longPassword = 'a'.repeat(1000);
      const hashedPassword = await hashService.hashPassword(longPassword);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(longPassword);
    });
  });

  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const password = 'testPassword123!';
      const hashedPassword = await hashService.hashPassword(password);
      const isValid = await hashService.comparePassword(password, hashedPassword);

      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'testPassword123!';
      const wrongPassword = 'wrongPassword123!';
      const hashedPassword = await hashService.hashPassword(password);
      const isValid = await hashService.comparePassword(wrongPassword, hashedPassword);

      expect(isValid).toBe(false);
    });

    it('should handle empty password comparison', async () => {
      const hashedPassword = await hashService.hashPassword('testPassword123!');
      const isValid = await hashService.comparePassword('', hashedPassword);

      expect(isValid).toBe(false);
    });

    it('should handle invalid hash format', async () => {
      const password = 'testPassword123!';
      const invalidHash = 'invalid-hash-format';
      
      await expect(hashService.comparePassword(password, invalidHash)).rejects.toThrow();
    });
  });

  describe('validatePasswordStrength', () => {
    it('should validate strong password', () => {
      const strongPassword = 'StrongP@ssw0rd123!';
      const result = hashService.validatePasswordStrength(strongPassword);

      expect(result.isValid).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(result.feedback).toHaveLength(0);
    });

    it('should reject weak password', () => {
      const weakPassword = '123';
      const result = hashService.validatePasswordStrength(weakPassword);

      expect(result.isValid).toBe(false);
      expect(result.score).toBeLessThan(3);
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    it('should provide feedback for medium strength password', () => {
      const mediumPassword = 'password123';
      const result = hashService.validatePasswordStrength(mediumPassword);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Add uppercase letters');
      expect(result.feedback).toContain('Add special characters');
    });

    it('should handle empty password', () => {
      const result = hashService.validatePasswordStrength('');

      expect(result.isValid).toBe(false);
      expect(result.score).toBe(0);
      expect(result.feedback).toContain('Password is required');
    });

    it('should check minimum length requirement', () => {
      const shortPassword = 'Ab1!';
      const result = hashService.validatePasswordStrength(shortPassword);

      expect(result.isValid).toBe(false);
      expect(result.feedback).toContain('Password must be at least 8 characters long');
    });
  });

  describe('generateSecurePassword', () => {
    it('should generate password with default length', () => {
      const password = hashService.generateSecurePassword();

      expect(password).toBeDefined();
      expect(password.length).toBe(16);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)).toBe(true);
    });

    it('should generate password with custom length', () => {
      const customLength = 24;
      const password = hashService.generateSecurePassword(customLength);

      expect(password.length).toBe(customLength);
    });

    it('should generate different passwords each time', () => {
      const password1 = hashService.generateSecurePassword();
      const password2 = hashService.generateSecurePassword();

      expect(password1).not.toBe(password2);
    });

    it('should handle minimum length constraint', () => {
      const password = hashService.generateSecurePassword(4);

      expect(password.length).toBe(8); // Should enforce minimum length
    });
  });

  describe('needsRehash', () => {
    it('should return false for recently hashed password', async () => {
      const password = 'testPassword123!';
      const hashedPassword = await hashService.hashPassword(password);
      const needsRehash = hashService.needsRehash(hashedPassword);

      expect(needsRehash).toBe(false);
    });

    it('should return true for hash with lower rounds', () => {
      // Simulate an old hash with lower rounds (this is a mock hash format)
      const oldHash = '$2b$08$someoldhashwithfewerrounds';
      const needsRehash = hashService.needsRehash(oldHash);

      expect(needsRehash).toBe(true);
    });

    it('should handle invalid hash format', () => {
      const invalidHash = 'invalid-hash-format';
      
      expect(() => hashService.needsRehash(invalidHash)).toThrow();
    });
  });

  describe('configuration', () => {
    it('should use custom salt rounds', async () => {
      const customHashService = createHashService({ saltRounds: 8 });
      const password = 'testPassword123!';
      const hashedPassword = await customHashService.hashPassword(password);

      expect(hashedPassword).toBeDefined();
      expect(hashedPassword.includes('$2b$08$')).toBe(true);
    });

    it('should enforce minimum salt rounds', () => {
      const customHashService = createHashService({ saltRounds: 2 });
      
      // Should use minimum of 10 rounds even if 2 is specified
      expect(customHashService['config'].saltRounds).toBe(10);
    });
  });

  describe('error handling', () => {
    it('should handle bcrypt errors gracefully', async () => {
      // Mock bcrypt to throw an error
      const bcrypt = await import('bcrypt');
      jest.doMock('bcrypt', () => ({
        ...bcrypt,
        hash: jest.fn().mockRejectedValue(new Error('Bcrypt error')),
      }));

      await expect(hashService.hashPassword('test')).rejects.toThrow();
    });

    it('should handle comparison errors gracefully', async () => {
      const password = 'testPassword123!';
      const hashedPassword = await hashService.hashPassword(password);
      
      // Mock bcrypt compare to throw an error
      const bcrypt = await import('bcrypt');
      jest.doMock('bcrypt', () => ({
        ...bcrypt,
        compare: jest.fn().mockRejectedValue(new Error('Bcrypt compare error')),
      }));

      await expect(hashService.comparePassword(password, hashedPassword)).rejects.toThrow();
    });
  });

  describe('performance', () => {
    it('should hash password within reasonable time', async () => {
      const password = 'testPassword123!';
      const startTime = Date.now();
      
      await hashService.hashPassword(password);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 5 seconds (generous for CI environments)
      expect(duration).toBeLessThan(5000);
    });

    it('should compare password within reasonable time', async () => {
      const password = 'testPassword123!';
      const hashedPassword = await hashService.hashPassword(password);
      
      const startTime = Date.now();
      await hashService.comparePassword(password, hashedPassword);
      const endTime = Date.now();
      
      const duration = endTime - startTime;
      
      // Should complete within 5 seconds
      expect(duration).toBeLessThan(5000);
    });
  });
});