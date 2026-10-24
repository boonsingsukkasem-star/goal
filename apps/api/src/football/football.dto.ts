import { Transform, Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class FixtureListQueryDto {
  @ApiPropertyOptional({
    description: "Opaque cursor returned by the previous page",
    example: "eyJpZCI6MTIzLCJzdGFydHNBdCI6IjIwMjYtMDgtMTZUMTI6MDA6MDAuMDAwWiIsIm9yZGVyIjoiYXNjIn0",
    type: String,
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: "Inclusive UTC start of the fixture window; defaults to 12 hours ago",
    example: "2026-08-16T00:00:00.000Z",
    format: "date-time",
    type: String,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    default: false,
    description: "Return only fixtures currently marked live",
    type: Boolean,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return value;
  })
  @IsBoolean()
  liveOnly?: boolean;

  @ApiPropertyOptional({
    description: "GOAL league identifier",
    example: 8,
    minimum: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leagueId?: number;

  @ApiPropertyOptional({
    default: 20,
    description: "Page size",
    maximum: 50,
    minimum: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    default: "asc",
    description: "Chronological order; use desc for recent results",
    enum: ["asc", "desc"],
    type: String,
  })
  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: "asc" | "desc";

  @ApiPropertyOptional({
    description: "Filter by provider match state, independently of whether scores are populated",
    enum: ["upcoming", "finished"],
    type: String,
  })
  @IsOptional()
  @IsIn(["upcoming", "finished"])
  status?: "upcoming" | "finished";

  @ApiPropertyOptional({
    description: "GOAL team identifier",
    example: 9,
    minimum: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  teamId?: number;

  @ApiPropertyOptional({
    description: "Inclusive UTC end of the fixture window; defaults to seven days ahead",
    example: "2026-08-23T23:59:59.999Z",
    format: "date-time",
    type: String,
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}

export class FootballExploreQueryDto {
  @ApiPropertyOptional({
    description: "Case-insensitive catalog search. Omit to browse ranked entities.",
    example: "Liverpool",
    maxLength: 80,
    minLength: 2,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({
    default: 30,
    description: "Maximum number of catalog entries",
    maximum: 50,
    minimum: 1,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @ApiPropertyOptional({
    default: "league,team,player",
    description: "Comma-separated catalog entity types",
    example: "team,player",
    pattern: "^(league|team|player)(,(league|team|player))*$",
    type: String,
  })
  @IsOptional()
  @IsString()
  @Matches(/^(league|team|player)(,(league|team|player))*$/)
  types?: string;
}

export class FootballComparisonOptionsQueryDto {
  @ApiPropertyOptional({
    default: "player",
    description: "Football entity catalog to browse",
    enum: ["player", "team"],
    type: String,
  })
  @IsOptional()
  @IsIn(["player", "team"])
  entityType?: "player" | "team";

  @ApiPropertyOptional({
    description: "Football name search. Omit to browse all accessible entities.",
    example: "Mohamed Salah",
    maxLength: 80,
    minLength: 2,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  q?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 50, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  perPage?: number;
}
