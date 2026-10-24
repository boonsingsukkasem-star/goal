import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "jose";

import type { Environment } from "../config/environment";

type RevocationResult = "succeeded" | "unavailable" | "failed";
const appleJwks = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

@Injectable()
export class AppleTokenRevocationService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService<Environment, true>) {}

  async revoke(
    authorizationCode?: string,
    expectedAppleSubject?: string,
  ): Promise<RevocationResult> {
    if (!authorizationCode || !expectedAppleSubject) return "unavailable";

    const clientId = this.config.get("APPLE_CLIENT_ID", { infer: true });
    const teamId = this.config.get("APPLE_TEAM_ID", { infer: true });
    const keyId = this.config.get("APPLE_KEY_ID", { infer: true });
    const encodedKey = this.config.get("APPLE_PRIVATE_KEY_BASE64", { infer: true });
    if (!clientId || !teamId || !keyId || !encodedKey) return "unavailable";

    try {
      const privateKey = await importPKCS8(
        Buffer.from(encodedKey, "base64").toString("utf8"),
        "ES256",
      );
      const clientSecret = await new SignJWT({})
        .setProtectedHeader({ alg: "ES256", kid: keyId })
        .setIssuer(teamId)
        .setSubject(clientId)
        .setAudience("https://appleid.apple.com")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);

      const exchange = await fetch("https://appleid.apple.com/auth/token", {
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: authorizationCode,
          grant_type: "authorization_code",
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      });
      if (!exchange.ok) return "failed";
      const token = (await exchange.json()) as { id_token?: string; refresh_token?: string };
      if (!token.refresh_token || !token.id_token) return "failed";
      const { payload } = await jwtVerify(token.id_token, appleJwks, {
        audience: clientId,
        issuer: "https://appleid.apple.com",
      });
      if (payload.sub !== expectedAppleSubject) return "failed";

      const revoke = await fetch("https://appleid.apple.com/auth/revoke", {
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          token: token.refresh_token,
          token_type_hint: "refresh_token",
        }),
        headers: { "content-type": "application/x-www-form-urlencoded" },
        method: "POST",
      });
      return revoke.ok ? "succeeded" : "failed";
    } catch {
      return "failed";
    }
  }
}
