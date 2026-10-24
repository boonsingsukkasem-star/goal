import { Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ArgumentsHost } from "@nestjs/common";
import type { ApiErrorCode, ApiErrorResponse } from "@goal-app/contracts";
import type { Response } from "express";

import type { RequestWithContext } from "./request-context";

const statusToCode: Partial<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: "BAD_REQUEST",
  [HttpStatus.UNAUTHORIZED]: "UNAUTHORIZED",
  [HttpStatus.FORBIDDEN]: "FORBIDDEN",
  [HttpStatus.NOT_FOUND]: "NOT_FOUND",
  [HttpStatus.CONFLICT]: "CONFLICT",
  [HttpStatus.TOO_MANY_REQUESTS]: "RATE_LIMITED",
  [HttpStatus.SERVICE_UNAVAILABLE]: "SERVICE_UNAVAILABLE",
};

function extractExceptionMessage(exception: HttpException): {
  details?: string[];
  message: string;
} {
  const response = exception.getResponse();
  if (typeof response === "string") return { message: response };

  const rawMessage = "message" in response ? response.message : undefined;
  if (Array.isArray(rawMessage)) {
    return { details: rawMessage.map(String), message: "Request validation failed" };
  }

  return {
    message: typeof rawMessage === "string" ? rawMessage : exception.message,
  };
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithContext>();
    const response = context.getResponse<Response>();
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = statusToCode[status] ?? "INTERNAL_ERROR";
    const publicMessage = isHttpException
      ? extractExceptionMessage(exception)
      : { message: "An unexpected error occurred" };

    if (!isHttpException || status >= 500) {
      this.logger.error({
        error: exception instanceof Error ? exception.message : String(exception),
        method: request.method,
        path: request.path,
        requestId: request.requestId,
        stack: exception instanceof Error ? exception.stack : undefined,
        status,
      });
    }

    const body: ApiErrorResponse = {
      error: {
        code,
        ...publicMessage,
        requestId: request.requestId,
      },
    };
    response.status(status).json(body);
  }
}
