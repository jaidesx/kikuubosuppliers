/** @type {import('jest').Config} */
module.exports = {
  // Use Node environment — cart.test.js and script.test.js create their own
  // jsdom instances directly via require('jsdom'), so no global jsdom env is needed.
  testEnvironment: "node",
  setupFiles: ["./tests/setup.js"],
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: ["cart.js", "script.js", "products_array.js"],
  coverageReporters: ["text", "lcov"],
};
