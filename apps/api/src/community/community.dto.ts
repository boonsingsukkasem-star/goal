import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

export class FavoriteEntityParamsDto {
  @ApiProperty({ enum: ["team", "player", "league"], type: String })
  @IsIn(["team", "player", "league"])
  entityType!: "team" | "player" | "league";

  @ApiProperty({ minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  entityId!: number;
}

export class MatchFollowDto {
  @ApiPropertyOptional({ default: false, type: Boolean })
  @IsOptional()
  @IsBoolean()
  liveAlertsDuringQuietHours?: boolean;

  @ApiPropertyOptional({ default: true, type: Boolean })
  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;
}

export class CheerForFixtureDto {
  @ApiProperty({ minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamId!: number;
}

export class PersonalizedFeedQueryDto {
  @ApiPropertyOptional({ default: 20, maximum: 50, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
