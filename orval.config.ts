import { defineConfig } from "orval";

export default defineConfig({
  goalApi: {
    input: { target: "./openapi/goal-api.json" },
    output: {
      clean: true,
      client: "fetch",
      mode: "single",
      override: {
        fetch: {
          includeHttpResponseReturnType: false,
          runtimeValidation: true,
        },
        mutator: {
          name: "goalFetch",
          path: "./packages/api-client/src/fetcher.ts",
        },
      },
      schemas: "./packages/api-client/src/generated/models",
      target: "./packages/api-client/src/generated/goal-api.ts",
    },
    hooks: {
      afterAllFilesWrite:
        "prettier --write openapi/goal-api.json packages/api-client/src/generated",
    },
  },
});
