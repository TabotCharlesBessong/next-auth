export default {
  // Test environment
  testEnvironment: 'node',
  
  // File patterns
  testMatch: ['**/*.test.ts'],
  
  // Transform TypeScript files
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  
  // Module name mapping for absolute imports
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../../../$1',
    '^@lib/(.*)$': '<rootDir>/../$1',
    '^@services/(.*)$': '<rootDir>/../$1',
  },
  
  // TypeScript configuration
  preset: 'ts-jest',
  
  // Coverage
  collectCoverage: false,
  
  // Verbose output
  verbose: true,
  
  // Clear mocks
  clearMocks: true,
  restoreMocks: true,
  
  // Timeout
  testTimeout: 10000,
};