# Database Abstraction Layer Dependencies

Based on the analysis of the database abstraction layer implementation, here are all the required dependencies:

## Core Database Dependencies

### Sequelize (for PostgreSQL/MySQL)
- `sequelize` - ORM for SQL databases
- `pg` - PostgreSQL driver
- `pg-hstore` - PostgreSQL hstore support
- `mysql2` - MySQL driver
- `@types/pg` - TypeScript types for PostgreSQL

### Mongoose (for MongoDB)
- `mongoose` - MongoDB ODM
- `@types/mongoose` - TypeScript types for Mongoose

## Testing Dependencies
- `@jest/globals` - Jest testing framework globals
- `jest` - JavaScript testing framework
- `@types/jest` - TypeScript types for Jest
- `ts-jest` - TypeScript preprocessor for Jest

## Additional Dependencies
- `zod` - Already installed (schema validation)
- `@types/node` - Already installed (Node.js types)

## Installation Commands

### Production Dependencies
```bash
npm install sequelize mongoose pg pg-hstore mysql2
```

### Development Dependencies
```bash
npm install --save-dev @types/pg @types/mongoose @jest/globals jest @types/jest ts-jest
```

### All at once
```bash
npm install sequelize mongoose pg pg-hstore mysql2 && npm install --save-dev @types/pg @types/mongoose @jest/globals jest @types/jest ts-jest
```

## Jest Configuration

After installing Jest dependencies, you'll need to create a `jest.config.js` file:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/lib'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    'lib/**/*.ts',
    '!**/*.d.ts',
    '!**/node_modules/**'
  ],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js']
};
```

## Package.json Scripts Update

Add these scripts to your package.json:

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "db:migrate": "node -r ts-node/register lib/database/migrations/run.ts"
  }
}
```