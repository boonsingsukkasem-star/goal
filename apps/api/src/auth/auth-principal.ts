import type { AuthProvider } from "@goal-app/contracts";

export interface AuthPrincipal {
  accessToken: string;
  email: string;
  expiresAt: number;
  providers: AuthProvider[];
  userId: string;
}
