import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import type { Observable } from "rxjs";
import { finalize } from "rxjs/operators";

import type { RequestWithContext } from "./request-context";

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const startedAt = performance.now();
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      finalize(() => {
        this.logger.log({
          durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
          method: request.method,
          path: request.path,
          requestId: request.requestId,
          status: response.statusCode,
        });
      }),
    );
  }
}
