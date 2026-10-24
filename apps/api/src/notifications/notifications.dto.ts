import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() aiContext?: boolean;
  @ApiPropertyOptional({ type: Boolean })
  @IsOptional()
  @IsBoolean()
  allowLiveDuringQuietHours?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() goal?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() halftimeFulltime?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() kickoffReminder?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() lineup?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() newsBreaking?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() quietHoursEnabled?: boolean;

  @ApiPropertyOptional({ example: "07:30", type: String })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursEnd?: string;

  @ApiPropertyOptional({ example: "22:30", type: String })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  quietHoursStart?: string;

  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() redCard?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() substitution?: boolean;

  @ApiPropertyOptional({ example: "Asia/Bangkok", type: String })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() trendingNews?: boolean;
  @ApiPropertyOptional({ type: Boolean }) @IsOptional() @IsBoolean() yellowCard?: boolean;
}

export class RegisterPushDeviceDto {
  @ApiProperty({ example: "ExpoPushToken[example-token]", type: String })
  @Matches(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/)
  expoPushToken!: string;

  @ApiProperty({ enum: ["ios", "android"], type: String })
  @IsIn(["ios", "android"])
  platform!: "ios" | "android";

  @ApiProperty({ example: "Asia/Bangkok", type: String })
  @IsString()
  @MaxLength(64)
  timezone!: string;
}

export class NotificationHistoryQueryDto {
  @ApiPropertyOptional({ type: String }) @IsOptional() @IsString() cursor?: string;

  @ApiPropertyOptional({ default: 20, maximum: 50, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
