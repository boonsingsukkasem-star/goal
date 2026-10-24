import type { DeleteAccountResponse, UserProfile } from "@goal-app/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, IsIn, MaxLength } from "class-validator";

export class DeleteAccountDto {
  @ApiPropertyOptional({
    description: "Fresh native Apple authorization code used for revocation",
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  appleAuthorizationCode?: string;

  @ApiProperty({ enum: ["DELETE"], type: String })
  @IsIn(["DELETE"])
  confirmation!: "DELETE";
}

export class UserProfileDto implements UserProfile {
  avatarUrl!: string | null;
  createdAt!: string;
  displayName!: string | null;
  email!: string;
  id!: string;
  locale!: string;
  providers!: UserProfile["providers"];
  timezone!: string;
  updatedAt!: string;
}

export class DeleteAccountResponseDto implements DeleteAccountResponse {
  deleted!: true;
  providerRevocation!: DeleteAccountResponse["providerRevocation"];
}
