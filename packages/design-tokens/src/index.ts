import tokens from "./tokens.json";

export const colorTokens = tokens.palette;
export const semanticColors = tokens.semantic;
export const typographyTokens = tokens.typography;
export const radiusTokens = tokens.radius;
export const spacingTokens = tokens.spacing;

export type ThemeTokens = typeof tokens;
export default tokens;
