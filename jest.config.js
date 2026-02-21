/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/services/shared'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    // Prevent ts-jest from trying to load the real OTel SDK during unit tests
    '^@opentelemetry/api$': '<rootDir>/__mocks__/@opentelemetry/api.ts',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      diagnostics: false, // skip type-checking in tests; tsc --build covers that
      tsconfig: {
        module: 'commonjs',
        esModuleInterop: true,
        strict: true,
        skipLibCheck: true,
      },
    }],
  },
  collectCoverageFrom: [
    'services/shared/**/*.ts',
    '!services/shared/**/__tests__/**',
  ],
};
