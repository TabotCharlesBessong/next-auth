// Global test setup for authentication services

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  // Uncomment to suppress console.log in tests
  // log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock crypto for Node.js environment
const crypto = require('crypto');

// Ensure crypto.webcrypto is available for tests
if (!global.crypto) {
  global.crypto = {
    getRandomValues: (arr) => crypto.randomFillSync(arr),
    randomUUID: () => crypto.randomUUID(),
    subtle: crypto.webcrypto?.subtle,
  };
}

// Mock fetch for OAuth tests
global.fetch = jest.fn();

// Mock nodemailer for email tests
jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({
      messageId: 'test-message-id',
      accepted: ['test@example.com'],
      rejected: [],
    }),
    verify: jest.fn().mockResolvedValue(true),
  })),
}));

// Basic environment variables for tests
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-for-testing-only';