const tokens = require("@goal-app/design-tokens/tokens.json");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        accent: tokens.semantic.accent,
        background: tokens.semantic.background,
        border: tokens.semantic.border,
        foreground: tokens.semantic.foreground,
        muted: tokens.semantic.muted,
        primary: tokens.semantic.primary,
        surface: tokens.semantic.surface,
        "surface-elevated": tokens.semantic.surfaceElevated,
      },
      fontFamily: {
        body: ["HankenGrotesk_400Regular"],
        "body-thai": ["NotoSansThai_400Regular"],
        headline: ["ArchivoNarrow_700Bold"],
        "headline-thai": ["NotoSansThai_700Bold"],
        label: ["ArchivoNarrow_600SemiBold"],
      },
    },
  },
  plugins: [],
};
