import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const generatedRoot = resolve(root, "packages/api-client/src/generated");
const spec = resolve(root, "openapi/goal-api.json");

function snapshot() {
  const paths = [spec];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else paths.push(path);
    }
  };
  visit(generatedRoot);
  return new Map(paths.sort().map((path) => [path, readFileSync(path, "utf8")]));
}

const before = snapshot();
const result = spawnSync("pnpm", ["orval:generate"], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
});
process.stdout.write(result.stdout ?? "");
process.stderr.write(result.stderr ?? "");
if (result.status !== 0) process.exit(result.status ?? 1);

const after = snapshot();
const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
  (path) => before.get(path) !== after.get(path),
);
if (changed.length > 0) {
  process.stderr.write(
    `Generated OpenAPI client was stale. Commit the output of pnpm orval:generate:\n${changed
      .map((path) => `- ${path.slice(root.length + 1)}`)
      .join("\n")}\n`,
  );
  process.exit(1);
}
