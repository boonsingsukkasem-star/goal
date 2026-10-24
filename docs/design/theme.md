# Theme foundation

The UI is dark-first and uses color semantically:

- Gold is the primary action color and highlights live or important football moments.
- Cyan identifies AI, realtime intelligence, and analytical context.
- `#121212` is the main application background.
- Black and neutral ramps provide contrast and hierarchy.

All raw and semantic tokens live in `packages/design-tokens/src/tokens.json`. Web exposes the
semantic values as CSS variables; mobile maps the same JSON into NativeWind and runtime styles.

Typography:

- Archivo Narrow — headline and label
- Hanken Grotesk — body and data copy
- Noto Sans Thai — deterministic Thai glyph fallback for both families

The palette is designed for readable foreground/background combinations. Gold and cyan surfaces
use black text; dark surfaces use near-white or warm-neutral text.
