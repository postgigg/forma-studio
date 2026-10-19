const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  authInvocation,
  providerEnvironment,
} = require("../shared/provider-auth.cjs");
test("native sign-in uses fixed official CLI arguments for each supported account", () => {
  const cli = {
    command: "C:/trusted/provider.exe",
    prefix: ["trusted-entry.js"],
  };
  assert.deepEqual(authInvocation("codex", cli, {}).args, [
    "trusted-entry.js",
    "login",
  ]);
  assert.deepEqual(authInvocation("claude", cli, {}).args, [
    "trusted-entry.js",
    "auth",
    "login",
    "--claudeai",
  ]);
  assert.deepEqual(authInvocation("claude", cli, {}, "environment").args, [
    "trusted-entry.js",
    "auth",
    "login",
    "--console",
  ]);
  assert.deepEqual(authInvocation("kimi", cli, {}).args, [
    "trusted-entry.js",
    "login",
  ]);
  for (const provider of ["gemini", "unknown", "claude; malicious"])
    assert.throws(() => authInvocation(provider, cli, {}));
  assert.throws(() => authInvocation("claude", null, {}));
  assert.throws(() => authInvocation("claude", cli, {}, "invalid"));
});
test("Claude subscription mode cannot be overridden by inherited API credentials", () => {
  const input = {
    PATH: "keep",
    ANTHROPIC_API_KEY: "test-placeholder",
    ANTHROPIC_AUTH_TOKEN: "test-placeholder",
    ANTHROPIC_BASE_URL: "https://example.test",
    CLAUDE_CODE_OAUTH_TOKEN: "test-placeholder",
    CLAUDE_CODE_USE_BEDROCK: "1",
    CLAUDE_CODE_USE_VERTEX: "1",
    CLAUDE_CODE_USE_FOUNDRY: "1",
  };
  assert.deepEqual(providerEnvironment("claude", "cli", input), {
    PATH: "keep",
  });
  assert.ok(input.ANTHROPIC_API_KEY);
  assert.deepEqual(providerEnvironment("claude", "environment", input), input);
  assert.deepEqual(providerEnvironment("codex", "cli", input), input);
});
