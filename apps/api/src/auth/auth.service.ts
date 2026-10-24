import { createHash } from "node:crypto";

import type { DeleteAccountResponse, UserProfile } from "@goal-app/contracts";
import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";

import type { AuthPrincipal } from "./auth-principal";
import { AppleTokenRevocationService } from "./apple-token-revocation.service";
import { SupabaseAdminService } from "./supabase-admin.service";
import { SupabaseUserService } from "./supabase-user.service";

interface ProfileRow {
  avatar_url: string | null;
  created_at: string;
  display_name: string | null;
  locale: string;
  timezone: string;
  updated_at: string;
  user_id: string;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(SupabaseAdminService) private readonly supabase: SupabaseAdminService,
    @Inject(SupabaseUserService) private readonly userData: SupabaseUserService,
    @Inject(AppleTokenRevocationService) private readonly apple: AppleTokenRevocationService,
  ) {}

  async getProfile(principal: AuthPrincipal): Promise<UserProfile> {
    const { data, error } = await this.userData
      .getClient(principal)
      .from("profiles")
      .select("user_id,display_name,avatar_url,locale,timezone,created_at,updated_at")
      .eq("user_id", principal.userId)
      .maybeSingle<ProfileRow>();
    if (error) throw new ServiceUnavailableException("Unable to load account profile");
    if (!data) throw new NotFoundException("Account profile was not found");

    return {
      avatarUrl: data.avatar_url,
      createdAt: data.created_at,
      displayName: data.display_name,
      email: principal.email,
      id: data.user_id,
      locale: data.locale,
      providers: principal.providers,
      timezone: data.timezone,
      updatedAt: data.updated_at,
    };
  }

  async deleteAccount(
    principal: AuthPrincipal,
    appleAuthorizationCode?: string,
  ): Promise<DeleteAccountResponse> {
    const client = this.supabase.getClient();
    let providerRevocation: DeleteAccountResponse["providerRevocation"] = "not_applicable";
    if (principal.providers.includes("apple")) {
      const { data } = await client.auth.admin.getUserById(principal.userId);
      const appleSubject = data.user?.identities?.find(
        (identity) => identity.provider === "apple",
      )?.identity_id;
      providerRevocation = await this.apple.revoke(appleAuthorizationCode, appleSubject);
    }
    const userReference = createHash("sha256").update(principal.userId).digest("hex");

    const { error } = await client.rpc("delete_authenticated_user", {
      hashed_user_reference: userReference,
      revocation_result: providerRevocation,
      target_user_id: principal.userId,
      token_expires_at: new Date(principal.expiresAt * 1000).toISOString(),
    });
    if (error) throw new ServiceUnavailableException("Unable to delete account");

    return { deleted: true, providerRevocation };
  }
}
