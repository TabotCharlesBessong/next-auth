# Authentication Services Test Suite

This directory contains comprehensive tests for the Next.js authentication services. The test suite covers all authentication functionality including user management, token handling, email services, OAuth integration, and security features.

## Test Structure

```
__tests__/
├── AuthService.test.ts      # Core authentication functionality
├── TokenService.test.ts     # JWT token management
├── EmailService.test.ts     # Email verification and password reset
├── HashService.test.ts      # Password hashing and validation
├── OAuthService.test.ts     # Social authentication providers
├── SecurityService.test.ts  # CSRF, rate limiting, input validation
├── index.test.ts           # Integration tests and service exports
├── jest.config.js          # Jest configuration
├── jest.setup.js           # Test environment setup
├── package.json            # Test dependencies and scripts
└── README.md               # This file
```

## Test Coverage

### AuthService Tests
- ✅ User registration with validation
- ✅ User login and authentication
- ✅ Password change functionality
- ✅ Password reset flow
- ✅ Email verification process
- ✅ Token refresh mechanism
- ✅ User logout and session management
- ✅ Profile updates
- ✅ Account deletion
- ✅ Error handling and edge cases

### TokenService Tests
- ✅ JWT access token generation and verification
- ✅ Refresh token management
- ✅ Token expiration handling
- ✅ Token revocation and blacklisting
- ✅ Token cleanup processes
- ✅ Security validations
- ✅ Performance optimizations

### EmailService Tests
- ✅ Email verification sending
- ✅ Password reset email delivery
- ✅ Token generation and validation
- ✅ Email template rendering
- ✅ Multiple provider support (SMTP, SendGrid, Mailgun)
- ✅ Rate limiting for email sending
- ✅ Cleanup of expired tokens
- ✅ Error handling and retries

### HashService Tests
- ✅ Password hashing with bcrypt
- ✅ Password comparison and verification
- ✅ Password strength validation
- ✅ Secure password generation
- ✅ Rehash detection for security updates
- ✅ Configuration flexibility
- ✅ Performance benchmarks

### OAuthService Tests
- ✅ Authorization URL generation (Google, Facebook, GitHub)
- ✅ OAuth callback handling
- ✅ Account linking and unlinking
- ✅ Token exchange and refresh
- ✅ User profile retrieval
- ✅ State management and CSRF protection
- ✅ Error handling for provider failures

### SecurityService Tests
- ✅ CSRF token generation and validation
- ✅ Rate limiting with multiple strategies
- ✅ Input validation and sanitization
- ✅ IP blocking and allowlisting
- ✅ Session security management
- ✅ Security headers and middleware
- ✅ Cleanup and maintenance tasks

### Integration Tests
- ✅ Service factory functions
- ✅ Environment configuration validation
- ✅ Cross-service functionality
- ✅ Complete authentication flows
- ✅ Error propagation and handling
- ✅ Performance under load
- ✅ Concurrent operation handling

## Running Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Or if using the parent project
cd ../../../
npm install
```

### Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run tests for CI/CD
npm run test:ci

# Run specific service tests
npm run test:auth      # AuthService tests
npm run test:token     # TokenService tests
npm run test:email     # EmailService tests
npm run test:hash      # HashService tests
npm run test:oauth     # OAuthService tests
npm run test:security  # SecurityService tests

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Debug tests
npm run test:debug
```

### Environment Variables

The tests use the following environment variables (automatically set in jest.setup.js):

```bash
NODE_ENV=test
JWT_SECRET=test-jwt-secret-key-for-testing-purposes-only
JWT_REFRESH_SECRET=test-refresh-secret-key-for-testing-purposes-only
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
EMAIL_FROM=test@example.com
EMAIL_PROVIDER=smtp
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=test
SMTP_PASS=test
NEXTAUTH_URL=http://localhost:3000
CSRF_SECRET=test-csrf-secret-key
```

## Test Utilities

### Global Test Utilities

The test suite provides several utility functions available globally:

```javascript
// Create mock user
const user = global.testUtils.createMockUser({
  email: 'custom@example.com',
  firstName: 'Custom'
});

// Create mock tokens
const tokens = global.testUtils.createMockTokens('user-id');

// Create mock OAuth account
const oauthAccount = global.testUtils.createMockOAuthAccount({
  provider: 'google',
  providerId: 'google-123'
});

// Wait for async operations
await global.testUtils.waitFor(100);

// Generate random data
const randomStr = global.testUtils.randomString(20);
const randomEmail = global.testUtils.randomEmail();
```

### Mock Database

Tests use an in-memory mock database that simulates real database operations:

```javascript
const mockDatabase = {
  users: new Map(),
  emailVerificationTokens: new Map(),
  passwordResetTokens: new Map(),
  oauthAccounts: new Map(),
  // ... other collections
  
  // Methods mirror real database interface
  async findUserByEmail(email) { /* ... */ },
  async createUser(userData) { /* ... */ },
  // ... other methods
};
```

## Mocking Strategy

### External Dependencies

- **bcrypt**: Mocked for consistent password hashing
- **jsonwebtoken**: Mocked for predictable token behavior
- **nodemailer**: Mocked to prevent actual email sending
- **axios**: Mocked for OAuth provider requests
- **crypto**: Enhanced for Node.js compatibility

### Service Dependencies

- **Database**: In-memory mock with full interface compatibility
- **Environment**: Controlled test environment variables
- **External APIs**: Mocked responses for OAuth providers

## Coverage Requirements

The test suite maintains high coverage standards:

- **Branches**: 80% minimum
- **Functions**: 80% minimum
- **Lines**: 80% minimum
- **Statements**: 80% minimum

### Coverage Reports

Coverage reports are generated in multiple formats:

- **Text**: Console output during test runs
- **LCOV**: For IDE integration and CI/CD
- **HTML**: Detailed browser-viewable reports in `coverage/` directory

## Performance Testing

### Benchmarks

Tests include performance benchmarks for critical operations:

- Password hashing performance
- Token generation speed
- Database query efficiency
- Email sending throughput

### Load Testing

Integration tests verify system behavior under concurrent load:

- Multiple simultaneous registrations
- Concurrent login attempts
- Parallel token operations
- Bulk email processing

## Security Testing

### Vulnerability Checks

Tests verify protection against common vulnerabilities:

- SQL injection attempts
- XSS attack vectors
- CSRF token validation
- Rate limiting effectiveness
- Input sanitization

### Authentication Security

- Password strength enforcement
- Token expiration handling
- Session security measures
- OAuth state validation

## Continuous Integration

### CI/CD Integration

The test suite is designed for CI/CD environments:

```bash
# CI-optimized test command
npm run test:ci
```

Features:
- Non-interactive execution
- JUnit XML output for reporting
- Coverage threshold enforcement
- Parallel test execution
- Deterministic test ordering

### GitHub Actions Example

```yaml
name: Test Authentication Services
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:ci
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Debugging Tests

### Debug Mode

```bash
# Run tests in debug mode
npm run test:debug

# Then in Chrome DevTools:
# 1. Open chrome://inspect
# 2. Click "Open dedicated DevTools for Node"
# 3. Set breakpoints and debug
```

### Verbose Output

```bash
# Run with detailed output
npm run test:all
```

### Individual Test Debugging

```bash
# Run specific test file
npx jest AuthService.test.ts

# Run specific test case
npx jest -t "should register user successfully"

# Run with verbose output
npx jest --verbose AuthService.test.ts
```

## Best Practices

### Writing New Tests

1. **Descriptive Names**: Use clear, descriptive test names
2. **Arrange-Act-Assert**: Follow the AAA pattern
3. **Isolation**: Each test should be independent
4. **Cleanup**: Clean up resources after tests
5. **Mocking**: Mock external dependencies appropriately

### Test Organization

1. **Grouping**: Use `describe` blocks for logical grouping
2. **Setup**: Use `beforeEach` for common setup
3. **Teardown**: Use `afterEach` for cleanup
4. **Async**: Properly handle async operations

### Error Testing

1. **Edge Cases**: Test boundary conditions
2. **Error Paths**: Verify error handling
3. **Invalid Input**: Test with malformed data
4. **Network Failures**: Simulate external service failures

## Troubleshooting

### Common Issues

1. **Timeout Errors**: Increase timeout in jest.config.js
2. **Mock Issues**: Check mock implementations in jest.setup.js
3. **Environment Variables**: Verify test environment setup
4. **Async Issues**: Ensure proper async/await usage

### Getting Help

1. Check test output for specific error messages
2. Review mock implementations for accuracy
3. Verify environment variable configuration
4. Consult Jest documentation for advanced features

## Contributing

When adding new features to the authentication services:

1. **Add Tests First**: Write tests before implementation (TDD)
2. **Update Coverage**: Maintain coverage thresholds
3. **Document Changes**: Update test documentation
4. **Integration Tests**: Add integration tests for new flows
5. **Performance Tests**: Include performance benchmarks if applicable

## License

This test suite is part of the Next.js authentication services and follows the same license terms.