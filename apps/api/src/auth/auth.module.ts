import { Module } from "@nestjs/common";

import { AppleTokenRevocationService } from "./apple-token-revocation.service";
import { AuthRetentionController } from "./auth-retention.controller";
import { AuthRetentionService } from "./auth-retention.service";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { SupabaseAdminService } from "./supabase-admin.service";
import { SupabaseJwtService } from "./supabase-jwt.service";
import { SupabasePublicService } from "./supabase-public.service";
import { SupabaseUserService } from "./supabase-user.service";

@Module({
  controllers: [AuthController, AuthRetentionController],
  exports: [
    AuthGuard,
    SupabaseAdminService,
    SupabaseJwtService,
    SupabasePublicService,
    SupabaseUserService,
  ],
  providers: [
    AppleTokenRevocationService,
    AuthRetentionService,
    AuthGuard,
    AuthService,
    SupabaseAdminService,
    SupabaseJwtService,
    SupabasePublicService,
    SupabaseUserService,
  ],
})
export class AuthModule {}
