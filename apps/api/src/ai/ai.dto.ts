import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, Min } from "class-validator";

export class AiLanguageDto {
  @ApiPropertyOptional({ default: "th", enum: ["th", "en"], type: String })
  @IsOptional()
  @IsIn(["th", "en"])
  language?: "th" | "en";
}

export class AiComparisonRequestDto {
  @ApiProperty({ enum: ["team", "player"], type: String })
  @IsIn(["team", "player"])
  entityType!: "team" | "player";

  @ApiProperty({ minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leftId!: number;

  @ApiProperty({ default: "th", enum: ["th", "en"], type: String })
  @IsIn(["th", "en"])
  language!: "th" | "en";

  @ApiProperty({ minimum: 1, type: Number })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rightId!: number;
}
