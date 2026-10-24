import "reflect-metadata";

import { createApplication, createOpenApiDocument } from "./app-factory";

async function main() {
  process.env.APP_ENV = "nonprod";
  process.env.NODE_ENV = "test";
  process.env.SWAGGER_ENABLED = "false";

  const application = await createApplication();
  try {
    await application.init();
    const document = createOpenApiDocument(application, "development-smoke");
    const deleteAccount = document.components?.schemas?.DeleteAccountDto;
    if (!deleteAccount || "$ref" in deleteAccount) {
      throw new Error("DeleteAccountDto is missing from the development Swagger document");
    }
    const appleAuthorizationCode = deleteAccount.properties?.appleAuthorizationCode;
    if (
      !appleAuthorizationCode ||
      "$ref" in appleAuthorizationCode ||
      appleAuthorizationCode.type !== "string"
    ) {
      throw new Error("DeleteAccountDto.appleAuthorizationCode must be documented as a string");
    }
    process.stdout.write("Swagger development-transpiler smoke test passed\n");
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
