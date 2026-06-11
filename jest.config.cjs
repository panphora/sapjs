module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["**/test/**/*.test.js"],
  transform: {
    "^.+\\.js$": "babel-jest",
  },
  setupFilesAfterEnv: ["<rootDir>/test/setup.js"],
  clearMocks: true,
};
