import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { z } from "zod";

import type { Environment } from "../config/environment";
import type { AuthPrincipal } from "./auth-principal";

const claimsSchema = z.object({
  app_metadata: z
    .object({ providers: z.array(z.enum(["email", "facebook", "google", "apple"])).optional() })
    .optional(),
  email: z.email(),
  exp: z.number().int().positive(),
  role: z.literal("authenticated"),
  sub: z.uuid(),
});

@Injectable()
export class SupabaseJwtService {
  private readonly issuer: string | null;
  private readonly jwks: JWTVerifyGetKey | null;

  constructor(@Inject(ConfigService) config: ConfigService<Environment, true>) {
    const url = config.get("SUPABASE_URL", { infer: true });
    this.issuer = url ? `${url.replace(/\/$/, "")}/auth/v1` : null;
    this.jwks = this.issuer
      ? createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`))
      : null;
  }

  async verify(token: string): Promise<AuthPrincipal> {
    if (!this.issuer || !this.jwks) {
      throw new UnauthorizedException("Authentication is not configured");
    }

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        audience: "authenticated",
        issuer: this.issuer,
      });
      const claims = claimsSchema.parse(payload);
      return {
        accessToken: token,
        email: claims.email,
        expiresAt: claims.exp,
        providers: claims.app_metadata?.providers ?? ["email"],
        userId: claims.sub,
      };
    } catch {
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}
