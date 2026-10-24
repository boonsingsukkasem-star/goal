import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { PlatformModule } from "../platform/platform.module";
import { NotificationsController, NotificationsCronController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [NotificationsController, NotificationsCronController],
  exports: [NotificationsService],
  imports: [AuthModule, PlatformModule],
  providers: [NotificationsService],
})
export class NotificationsModule {}
