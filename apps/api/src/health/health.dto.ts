import { ApiProperty } from "@nestjs/swagger";

export class HealthResponseDto {
  @ApiProperty({ example: "goal-api", type: String })
  service!: string;

  @ApiProperty({ example: "ok", type: String })
  status!: "ok";

  @ApiProperty({ example: "2026-08-16T04:00:00.000Z", type: String })
  timestamp!: string;

  @ApiProperty({ example: "0.1.0", type: String })
  version!: string;
}

export class ReadinessResponseDto {
  @ApiProperty({ example: "goal-api", type: String })
  service!: string;

  @ApiProperty({ example: "ready", type: String })
  status!: "ready";

  @ApiProperty({ example: "2026-08-16T04:00:00.000Z", type: String })
  timestamp!: string;

  @ApiProperty({ example: "0.1.0", type: String })
  version!: string;
}
