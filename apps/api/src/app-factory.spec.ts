import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApplication, createApplicationLogger } from "./app-factory";

describe("API production foundation", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.APP_ENV = "nonprod";
    process.env.NODE_ENV = "test";
    process.env.SWAGGER_ENABLED = "false";
    app = await createApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sets security and request correlation headers", async () => {
    const response = await request(app.getHttpServer()).get("/v1/health").expect(200);

    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns the standard error envelope", async () => {
    const response = await request(app.getHttpServer()).get("/v1/not-found").expect(404);

    expect(response.body).toMatchObject({
      error: {
        code: "NOT_FOUND",
        message: "Cannot GET /v1/not-found",
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("writes structured Nest logs through console for Vercel capture", () => {
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

    createApplicationLogger("info", false).log({ event: "vercel_console_capture" }, "LoggingProbe");

    expect(consoleLog).toHaveBeenCalledOnce();
    expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toMatchObject({
      context: "LoggingProbe",
      level: "log",
      message: { event: "vercel_console_capture" },
    });

    consoleLog.mockRestore();
  });
});
