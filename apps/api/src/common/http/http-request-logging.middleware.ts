import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import type { RequestWithContext } from "./request-context";
import { writeStructuredLog } from "./structured-log";

@Injectable()
export class HttpRequestLoggingMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();
    const requestWithContext = request as RequestWithContext;

    writeStructuredLog("info", "HTTP", {
      event: "request_started",
      method: request.method,
      path: request.path,
      requestId: requestWithContext.requestId,
    });

    response.once("finish", () => {
      const status = response.statusCode;
      const contentLength = response.getHeader("content-length");
      const details = {
        contentLength: contentLength === undefined ? undefined : Number(contentLength),
        contentType: response.getHeader("content-type"),
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        event: "request_completed",
        method: request.method,
        path: request.path,
        requestId: requestWithContext.requestId,
        route: request.route?.path,
        status,
      };

      if (status >= 500) {
        writeStructuredLog("error", "HTTP", details);
      } else if (status >= 400) {
        writeStructuredLog("warn", "HTTP", details);
      } else {
        writeStructuredLog("info", "HTTP", details);
      }
    });

    next();
  }
}
