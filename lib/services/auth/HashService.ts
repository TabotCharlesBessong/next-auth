import * as bcrypt from 'bcryptjs';
import { IHashService } from './types';

export class HashService implements IHashService {
  private readonly defaultSaltRounds: number;

  constructor(saltRounds: number = 12) {
    this.defaultSaltRounds = saltRounds;
  }

  /**
   * Hash a password using bcrypt
   * @param password - Plain text password to hash
   * @param rounds - Number of salt rounds (optional, defaults to configured value)
   * @returns Promise<string> - Hashed password
   */
  async hashPassword(password: string, rounds?: number): Promise<string> {
    try {
      const saltRounds = rounds || this.defaultSaltRounds;
      const salt = await this.generateSalt(saltRounds);
      const hashedPassword = await bcrypt.hash(password, salt);
      return hashedPassword;
    } catch (error) {
      throw new Error(`Failed to hash password: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Compare a plain text password with a hashed password
   * @param password - Plain text password
   * @param hash - Hashed password to compare against
   * @returns Promise<boolean> - True if passwords match, false otherwise
   */
  async comparePassword(password: string, hash: string): Promise<boolean> {
    try {
      const isMatch = await bcrypt.compare(password, hash);
      return isMatch;
    } catch (error) {
      throw new Error(`Failed to compare password: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a salt for password hashing
   * @param rounds - Number of salt rounds (optional, defaults to configured value)
   * @returns Promise<string> - Generated salt
   */
  async generateSalt(rounds?: number): Promise<string> {
    try {
      const saltRounds = rounds || this.defaultSaltRounds;
      const salt = await bcrypt.genSalt(saltRounds);
      return salt;
    } catch (error) {
      throw new Error(`Failed to generate salt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate password strength
   * @param password - Password to validate
   * @returns object with validation result and errors
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    errors: string[];
    score: number;
  } {
    const errors: string[] = [];
    let score = 0;

    // Length check
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    } else if (password.length >= 12) {
      score += 2;
    } else {
      score += 1;
    }

    // Uppercase check
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    } else {
      score += 1;
    }

    // Lowercase check
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    } else {
      score += 1;
    }

    // Number check
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    } else {
      score += 1;
    }

    // Special character check
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    } else {
      score += 1;
    }

    // Common password patterns check
    const commonPatterns = [
      /123456/,
      /password/i,
      /qwerty/i,
      /admin/i,
      /letmein/i,
    ];

    for (const pattern of commonPatterns) {
      if (pattern.test(password)) {
        errors.push('Password contains common patterns and is not secure');
        score -= 1;
        break;
      }
    }

    // Sequential characters check
    if (/(.)\1{2,}/.test(password)) {
      errors.push('Password should not contain repeated characters');
      score -= 1;
    }

    return {
      isValid: errors.length === 0,
      errors,
      score: Math.max(0, score),
    };
  }

  /**
   * Check if a password needs to be rehashed (e.g., if salt rounds have changed)
   * @param hash - Current password hash
   * @param rounds - Desired salt rounds
   * @returns boolean - True if rehashing is needed
   */
  needsRehash(hash: string, rounds?: number): boolean {
    try {
      const saltRounds = rounds || this.defaultSaltRounds;
      const currentRounds = bcrypt.getRounds(hash);
      return currentRounds < saltRounds;
    } catch (_error) {
      // If we can't determine the rounds, assume rehashing is needed
      return true;
    }
  }

  /**
   * Get the number of rounds used in a hash
   * @param hash - Password hash
   * @returns number - Number of rounds used
   */
  getRounds(hash: string): number {
    try {
      return bcrypt.getRounds(hash);
    } catch (error) {
      throw new Error(`Failed to get rounds from hash: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a secure random password
   * @param length - Length of the password (default: 16)
   * @param includeSymbols - Whether to include symbols (default: true)
   * @returns string - Generated password
   */
  generateSecurePassword(length: number = 16, includeSymbols: boolean = true): string {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let charset = lowercase + uppercase + numbers;
    if (includeSymbols) {
      charset += symbols;
    }

    let password = '';
    
    // Ensure at least one character from each required set
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    
    if (includeSymbols) {
      password += symbols[Math.floor(Math.random() * symbols.length)];
    }

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }

    // Shuffle the password to avoid predictable patterns
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }
}

// Export a default instance
export const hashService = new HashService();

// Export factory function for custom configuration
export const createHashService = (saltRounds: number = 12): HashService => {
  return new HashService(saltRounds);
};