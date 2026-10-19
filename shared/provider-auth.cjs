const allowed = Object.freeze(["codex", "claude", "kimi"]);
function providerEnvironment(provider, mode, input = process.env) {
  const env = { ...input };
  if (provider === "claude" && mode === "cli") {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "ANTHROPIC_CUSTOM_HEADERS",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "CLAUDE_CODE_USE_BEDROCK",
      "CLAUDE_CODE_USE_VERTEX",
      "CLAUDE_CODE_USE_FOUNDRY",
    ])
      delete env[key];
  }
  return env;
}
function authInvocation(provider, cli, input = process.env, mode = "cli") {
  if (!allowed.includes(provider))
    throw new Error(
      "Choose Codex, Claude or Kimi for browser sign-in. Sign in to Gemini through its own CLI.",
    );
  if (!cli?.command)
    throw new Error(
      "Install this provider's official CLI, then reopen Help and settings.",
    );
  if (!["cli", "environment"].includes(mode))
    throw new Error("Choose a supported account type.");
  return {
    command: cli.command,
    args: [
      ...(cli.prefix || []),
      ...(provider === "claude"
        ? ["auth", "login", mode === "cli" ? "--claudeai" : "--console"]
        : ["login"]),
    ],
    env: providerEnvironment(provider, mode, input),
  };
}
module.exports = { authInvocation, providerEnvironment };
