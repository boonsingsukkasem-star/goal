import { Injectable, Logger, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

import type { RequestWithContext } from "./request-context";

@Injectable()
export class HttpRequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger("HTTP");

  use(request: Request, response: Response, next: NextFunction): void {
    const startedAt = performance.now();
    const requestWithContext = request as RequestWithContext;

    this.logger.log({
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
        this.logger.error(details);
      } else if (status >= 400) {
        this.logger.warn(details);
      } else {
        this.logger.log(details);
      }
    });

    next();
  }
}
