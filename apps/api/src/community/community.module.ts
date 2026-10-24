import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module";
import { FootballModule } from "../football/football.module";
import { CommunityController } from "./community.controller";
import { CommunityService } from "./community.service";

@Module({
  controllers: [CommunityController],
  imports: [AuthModule, FootballModule],
  providers: [CommunityService],
})
export class CommunityModule {}
