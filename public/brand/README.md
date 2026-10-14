# Forma Studio identity

`forma-mark.svg` is the shared mark for the editor, desktop app, favicon and marketing page. It preserves the editor's original white, bold italic lowercase **f**, purple `#764bdd`, and rounded square. The outlined glyph matches the original Georgia bold italic letter; it does not require a font download.

The wordmark remains **forma.** with its purple final dot. The block capital F with a coral dot introduced during desktop packaging was inconsistent and has been removed.

Update this SVG rather than drawing platform-specific alternatives. Run `node scripts/render-desktop-icon.mjs` from the repository root to regenerate the desktop SVG/PNG/ICO and favicon. The marketing site uses a byte-for-byte copy as `dist/assets/mark.svg`.
