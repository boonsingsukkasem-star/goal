import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// No local Supabase/Docker. Every test and test-only extension installation rolls back.
const directory = "supabase/tests/database";
const temporary = await mkdtemp(join(tmpdir(), "goal-cloud-tests-"));
let failures = 0;
const filters = process.argv.slice(2);
function execute(file) {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "supabase", "db", "query", "--linked", "--file", file], {
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    const timeout = setTimeout(() => {
      if (process.platform === "win32") child.kill("SIGKILL");
      else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }
    }, 90_000);
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) return reject(new Error((stdout || stderr || "Cloud test timed out").trim()));
      try {
        resolve(JSON.parse(stdout.slice(stdout.indexOf("{"))));
      } catch {
        reject(new Error("Supabase CLI did not return structured query results"));
      }
    });
  });
}
try {
  const files = (await readdir(directory))
    .filter(
      (name) =>
        name.endsWith(".test.sql") &&
        (!filters.length || filters.some((filter) => name.includes(filter))),
    )
    .sort();
  if (!files.length) throw new Error("No Cloud database tests match the filter");
  for (const name of files) {
    try {
      let sql = await readFile(join(directory, name), "utf8");
      if (!/^begin;/m.test(sql) || !/rollback;\s*$/.test(sql) || /^\s*commit\s*;/im.test(sql))
        throw new Error("Cloud tests must be rollback-only transactions");
      const tap = /select plan\(/.test(sql);
      const expectedAssertions = Number(sql.match(/select plan\((\d+)\)/)?.[1]);
      if (tap) {
        sql = sql.replace(
          /^begin;/m,
          "begin;\ncreate extension if not exists pgtap with schema extensions;\nset local search_path=public,extensions;\ncreate temporary table goal_tap_results(value text);\ngrant all on goal_tap_results to anon,authenticated,service_role;",
        );
        sql = sql.replace(
          /^select (ok|is|isnt|like|unlike|cmp_ok|policies_are|throws_ok|lives_ok|has_[a-z_]+|hasnt_[a-z_]+|col_[a-z_]+|table_privs_are|function_privs_are)\(/gm,
          "insert into goal_tap_results select $1(",
        );
        sql = sql.replace(
          /select \* from finish\(\);/g,
          "insert into goal_tap_results select * from finish();",
        );
        sql = sql.replace(
          /rollback;\s*$/,
          "reset role;\nselect count(*) as assertions,coalesce(jsonb_agg(value) filter(where value like 'not ok%' or value like '# Looks%'),'[]') as failures from goal_tap_results;\nrollback;",
        );
      }
      const file = join(temporary, name);
      await writeFile(file, sql);
      const result = await execute(file);
      if (tap) {
        const summary = result.rows?.[0];
        if (!summary || !Array.isArray(summary.failures) || summary.failures.length)
          throw new Error(JSON.stringify(summary ?? result));
        if (Number(summary.assertions) !== expectedAssertions)
          throw new Error(
            `Captured ${summary.assertions} of ${expectedAssertions} planned assertions`,
          );
        console.log(`PASS ${name} (${summary.assertions} assertions)`);
      } else console.log(`PASS ${name} (transaction assertions)`);
    } catch (error) {
      failures++;
      console.error(`FAIL ${name}: ${error.message}`);
    }
  }
  if (failures) process.exitCode = 1;
} finally {
  await rm(temporary, { recursive: true, force: true });
}
