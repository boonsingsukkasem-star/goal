import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const candidates = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const rules = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["GitHub token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
  [
    "committed environment secret",
    /^(?:SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|SPORTMONKS_API_TOKEN|APPLE_PRIVATE_KEY_BASE64|CRON_SECRET)=(?!\s*$|<|\$\{|replace-)[^\s#]{12,}$/gm,
  ],
];

const findings = [];
for (const file of candidates) {
  let metadata;
  try {
    metadata = statSync(file);
  } catch {
    continue;
  }
  if (!metadata.isFile() || metadata.size > 1_000_000) continue;
  const content = readFileSync(file, "utf8");
  if (content.includes("\0")) continue;
  for (const [name, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of content.matchAll(pattern)) {
      const line = content.slice(0, match.index).split("\n").length;
      findings.push(`${file}:${line} ${name}`);
    }
  }
}

if (findings.length > 0) {
  console.error(`Secret scan failed:\n${findings.join("\n")}`);
  process.exit(1);
}

console.log(`Secret scan passed (${candidates.length} repository files checked)`);
