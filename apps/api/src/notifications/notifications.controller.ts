import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type {
  NotificationHistoryResponse,
  NotificationPreferences,
  PushDeviceRegistrationResponse,
} from "@goal-app/contracts";
import {
  ApiBearerAuth,
  ApiExcludeController,
  ApiExtraModels,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";

import type { AuthPrincipal } from "../auth/auth-principal";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ApiAuthenticatedErrors } from "../common/openapi/api-error-responses";
import { openApiSchemaNames, openApiSchemaRef } from "../common/openapi/contract-schemas";
import {
  NotificationHistoryQueryDto,
  RegisterPushDeviceDto,
  UpdateNotificationPreferencesDto,
} from "./notifications.dto";
import { NotificationsService } from "./notifications.service";

@ApiTags("notifications")
@ApiExtraModels(
  NotificationHistoryQueryDto,
  RegisterPushDeviceDto,
  UpdateNotificationPreferencesDto,
)
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller({ path: "notifications", version: "1" })
export class NotificationsController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get("preferences")
  @ApiOperation({
    operationId: "getNotificationPreferences",
    summary: "Get notification and quiet-hour preferences",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.notificationPreferences) })
  @ApiAuthenticatedErrors()
  getPreferences(@CurrentUser() principal: AuthPrincipal): Promise<NotificationPreferences> {
    return this.notifications.getPreferences(principal);
  }

  @Put("preferences")
  @ApiOperation({
    operationId: "updateNotificationPreferences",
    summary: "Update notification preferences",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.notificationPreferences) })
  @ApiAuthenticatedErrors()
  updatePreferences(
    @Body() input: UpdateNotificationPreferencesDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<NotificationPreferences> {
    return this.notifications.updatePreferences(input, principal);
  }

  @Post("devices")
  @ApiOperation({
    operationId: "registerPushDevice",
    summary: "Register or refresh an Expo push device",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.pushDeviceRegistrationResponse) })
  @ApiAuthenticatedErrors()
  registerDevice(
    @Body() input: RegisterPushDeviceDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<PushDeviceRegistrationResponse> {
    return this.notifications.registerDevice(input, principal);
  }

  @Delete("devices/:deviceId")
  @ApiOperation({ operationId: "removePushDevice", summary: "Disable one push device" })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.pushDeviceRemovalResponse) })
  @ApiAuthenticatedErrors({ notFound: true })
  removeDevice(
    @Param("deviceId", ParseUUIDPipe) deviceId: string,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.notifications.removeDevice(deviceId, principal);
  }

  @Get()
  @ApiOperation({
    operationId: "listMyNotifications",
    summary: "List the current user's notification history",
  })
  @ApiOkResponse({ schema: openApiSchemaRef(openApiSchemaNames.notificationHistoryResponse) })
  @ApiAuthenticatedErrors()
  listHistory(
    @Query() query: NotificationHistoryQueryDto,
    @CurrentUser() principal: AuthPrincipal,
  ): Promise<NotificationHistoryResponse> {
    return this.notifications.listHistory(query, principal);
  }
}

@ApiExcludeController()
@Controller({ path: "internal/cron/notifications", version: "1" })
export class NotificationsCronController {
  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

  @Get()
  run(@Headers("authorization") authorization?: string) {
    return this.notifications.runCron(authorization);
  }
}
