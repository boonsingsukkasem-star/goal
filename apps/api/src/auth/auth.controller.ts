import type { DeleteAccountResponse, UserProfile } from "@goal-app/contracts";
import { Body, Controller, Delete, Get, Inject, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";

import type { AuthPrincipal } from "./auth-principal";
import { ApiAuthenticatedErrors } from "../common/openapi/api-error-responses";
import { openApiSchemaNames, openApiSchemaRef } from "../common/openapi/contract-schemas";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";
import { CurrentUser } from "./current-user.decorator";
import { DeleteAccountDto } from "./auth.dto";

@ApiTags("account")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller({ path: "me", version: "1" })
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Get()
  @ApiOperation({
    operationId: "getMyProfile",
    summary: "Return the current user's account profile",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.userProfile) })
  @ApiAuthenticatedErrors()
  getProfile(@CurrentUser() principal: AuthPrincipal): Promise<UserProfile> {
    return this.auth.getProfile(principal);
  }

  @Delete()
  @ApiOperation({
    operationId: "deleteMyAccount",
    summary: "Permanently delete the current account",
  })
  @ApiBody({ type: DeleteAccountDto })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.deleteAccountResponse) })
  @ApiAuthenticatedErrors()
  deleteAccount(
    @CurrentUser() principal: AuthPrincipal,
    @Body() input: DeleteAccountDto,
  ): Promise<DeleteAccountResponse> {
    return this.auth.deleteAccount(principal, input.appleAuthorizationCode);
  }
}
