export default {
  testEnvironment: "node",
  collectCoverage: true,
  verbose: true,
  passWithNoTests: true,
  testMatch: ["**/*.(test|steps).+(ts|tsx|js)"],
  setupFiles: ["dotenv/config"],
  coveragePathIgnorePatterns: ["/node_modules/", "/test/", "/dist/"],
  modulePathIgnorePatterns: ["<rootDir>/dist/"],
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        diagnostics: false,
        testEnvironment: "node",
        collectCoverage: true,
      },
    ],
  },
};
