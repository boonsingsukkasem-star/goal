import { randomUUID } from "node:crypto";

import { Injectable, type NestMiddleware } from "@nestjs/common";
import { requestIdSchema } from "@goal-app/contracts";
import type { NextFunction, Request, Response } from "express";

import type { RequestWithContext } from "./request-context";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction): void {
    const suppliedRequestId = request.header("x-request-id");
    const requestId = requestIdSchema.safeParse(suppliedRequestId).success
      ? suppliedRequestId!
      : randomUUID();

    (request as RequestWithContext).requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  }
}
