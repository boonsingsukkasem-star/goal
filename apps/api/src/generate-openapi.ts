import "reflect-metadata";

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createApplication, createOpenApiDocument } from "./app-factory";

async function main() {
  const application = await createApplication();
  try {
    await application.init();
    const document = createOpenApiDocument(application, "0.1.0");
    const outputDirectory = resolve(__dirname, "../../../openapi");
    await mkdir(outputDirectory, { recursive: true });
    await writeFile(
      resolve(outputDirectory, "goal-api.json"),
      `${JSON.stringify(document, null, 2)}\n`,
      "utf8",
    );
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
