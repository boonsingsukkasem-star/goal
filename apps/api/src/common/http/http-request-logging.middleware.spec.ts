import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpRequestLoggingMiddleware } from "./http-request-logging.middleware";

describe("HttpRequestLoggingMiddleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs start and completion details, including unmatched routes", () => {
    vi.stubEnv("LOG_LEVEL", "info");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const on = vi.fn((_event: string, callback: () => void) => callback);
    const getHeader = vi.fn((name: string) =>
      name === "content-length" ? "42" : "application/json; charset=utf-8",
    );
    const request = {
      method: "GET",
      path: "/",
      requestId: "request-123",
    } as unknown as Request;
    const response = {
      once: on,
      getHeader,
      statusCode: 404,
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    new HttpRequestLoggingMiddleware().use(request, response, next);

    expect(JSON.parse(String(log.mock.calls[0]?.[0]))).toMatchObject({
      context: "HTTP",
      level: "info",
      message: {
        event: "request_started",
        method: "GET",
        path: "/",
        requestId: "request-123",
      },
    });
    expect(next).toHaveBeenCalledOnce();

    const finish = on.mock.calls[0]?.[1];
    expect(finish).toBeTypeOf("function");
    finish?.();

    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({
      context: "HTTP",
      level: "warn",
      message: {
        contentLength: 42,
        contentType: "application/json; charset=utf-8",
        event: "request_completed",
        method: "GET",
        path: "/",
        requestId: "request-123",
        status: 404,
      },
    });
  });
});
