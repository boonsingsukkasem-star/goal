import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

import { SupabaseAdminService } from "./supabase-admin.service";
import { SupabaseJwtService } from "./supabase-jwt.service";
import type { AuthPrincipal } from "./auth-principal";

export interface AuthenticatedRequest extends Request {
  auth: AuthPrincipal;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SupabaseJwtService) private readonly jwt: SupabaseJwtService,
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.header("authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/);
    if (!match) throw new UnauthorizedException("Bearer access token is required");

    const accessToken = match[1]!;
    const principal = { ...(await this.jwt.verify(accessToken)), accessToken };
    const { data, error } = await this.supabase
      .getClient()
      .from("revoked_auth_sessions")
      .select("user_id")
      .eq("user_id", principal.userId)
      .maybeSingle();

    if (error) throw new UnauthorizedException("Unable to validate access token");
    if (data) throw new UnauthorizedException("Access token has been revoked");

    request.auth = principal;
    return true;
  }
}
