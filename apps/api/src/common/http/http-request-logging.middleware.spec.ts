import { Logger } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpRequestLoggingMiddleware } from "./http-request-logging.middleware";

describe("HttpRequestLoggingMiddleware", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs start and completion details, including unmatched routes", () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
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

    expect(log).toHaveBeenCalledWith({
      event: "request_started",
      method: "GET",
      path: "/",
      requestId: "request-123",
    });
    expect(next).toHaveBeenCalledOnce();

    const finish = on.mock.calls[0]?.[1];
    expect(finish).toBeTypeOf("function");
    finish?.();

    expect(warn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        contentLength: 42,
        contentType: "application/json; charset=utf-8",
        event: "request_completed",
        method: "GET",
        path: "/",
        requestId: "request-123",
        status: 404,
      }),
    );
  });
});
