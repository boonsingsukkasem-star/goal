import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class NewsFeedQueryDto {
  @ApiPropertyOptional({
    description: "Opaque cursor returned by the previous page",
    example: "eyJkaXNjb3ZlcmVkQXQiOiIyMDI2LTA4LTE3VDAwOjAwOjAwLjAwMFoiLCJpZCI6Ii4uLiJ9",
    type: String,
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    enum: ["breaking", "injury", "lineup", "match", "transfer", "interview", "general"],
    type: String,
  })
  @IsOptional()
  @IsIn(["breaking", "injury", "lineup", "match", "transfer", "interview", "general"])
  category?: "breaking" | "injury" | "lineup" | "match" | "transfer" | "interview" | "general";

  @ApiPropertyOptional({ default: "th", enum: ["th", "en"], type: String })
  @IsOptional()
  @IsIn(["th", "en"])
  language?: "th" | "en";

  @ApiPropertyOptional({ default: 20, maximum: 50, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class NewsListQueryDto {
  @ApiPropertyOptional({ default: "th", enum: ["th", "en"], type: String })
  @IsOptional()
  @IsIn(["th", "en"])
  language?: "th" | "en";

  @ApiPropertyOptional({ default: 20, maximum: 50, minimum: 1, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
