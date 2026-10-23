import { maybeRunSandboxInstallCommand } from "@paperclipai/adapter-utils/execution-target";
import { shellQuote } from "@paperclipai/adapter-utils/ssh";
import path from "node:path";
import { claudeCliVersionAtLeast, readClaudeCommandVersion } from "./cli-capabilities.js";

export async function prepareCompatibleClaudeCommand(
  input: Parameters<typeof readClaudeCommandVersion>[0] & { minimumVersion: string },
): Promise<{ command: string; version: string | null }> {
  const detected = await readClaudeCommandVersion(input);
  const original = { command: input.command, version: detected };
  if (
    !detected || claudeCliVersionAtLeast(detected, input.minimumVersion) ||
    input.target?.kind !== "remote" || input.target.transport !== "sandbox" ||
    input.command !== "claude" || !/^\d+\.\d+\.\d+$/.test(input.minimumVersion)
  ) return original;

  const prefix = path.posix.join(input.target.remoteCwd, ".paperclip-runtime", "claude-cli", input.minimumVersion);
  const command = path.posix.join(prefix, "bin", "claude");
  const existing = await readClaudeCommandVersion({ ...input, command });
  if (existing && claudeCliVersionAtLeast(existing, input.minimumVersion)) return { command, version: existing };

  const installation = await maybeRunSandboxInstallCommand({
    runId: input.runId,
    target: input.target,
    adapterKey: "claude",
    installCommand: `npm install --global --prefix ${shellQuote(prefix)} @anthropic-ai/claude-code@${input.minimumVersion}`,
    env: Object.fromEntries(Object.entries(input.env).filter(([key]) => [
      "PATH", "HOME", "TMPDIR", "TEMP", "TMP", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR",
      "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
      "NPM_CONFIG_REGISTRY", "npm_config_registry",
    ].includes(key))),
    timeoutSec: 120,
  });
  if (installation?.level !== "info") return original;
  const version = await readClaudeCommandVersion({ ...input, command });
  return version && claudeCliVersionAtLeast(version, input.minimumVersion) ? { command, version } : original;
}
