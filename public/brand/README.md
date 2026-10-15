# Forma Studio identity

The October 2026 identity combines a rising **F** with a returning ribbon and custom-drawn lowercase lettering. A short middle arm, stepped lower opening and unequal curves give the symbol an asymmetric silhouette. The diagonal cuts carry through the terminals of **f** and **a** in the wordmark. Purple `#764bdd`, ink `#171719` and paper `#f5f3ed` connect it to the studio interface.

The geometry is authored in `scripts/build-identity.mjs`; the SVGs use paths, without a font dependency, stock artwork or a generated raster logo. `forma-mark.svg` is the app tile; `forma-symbol.svg` is the freestanding symbol; `forma-wordmark.svg` is the lettering; `forma-logo.svg` is the horizontal lockup. Light variants support dark surfaces. Use these files, rather than recreating the lettering in a font.

Run `node scripts/build-identity.mjs`, then `node scripts/render-desktop-icon.mjs`. The second command generates the identical desktop SVG and favicon, a 1024px PNG, a seven-size Windows ICO (16–256px), and matching installer/uninstaller artwork. The public landing page uses byte-for-byte copies of the SVG masters.

Keep at least one stroke-width of space around the freestanding mark. Use the app tile at 16px and above; use the full lockup at 140px and above. Do not stretch, outline, add shadows, or rearrange the two parts. Motion may open the parts along their shared diagonal, returning to the master geometry. Respect reduced-motion preferences.

## Availability is unverified

This artwork was drawn for this project, but originality is not trademark clearance. A preliminary web/image search on 2026-10-14 found existing businesses using the Forma Studio name, including https://frmastudio.com/home and https://www.formastudio.no/. An earlier split-ring concept was discarded after the search found a close existing visual direction. The final mark adds a letter-based internal arm and a stepped returning fold, rather than a simple split ring. We do not claim the name or device mark is exclusive, registered, or legally available. A proper review must consider similar designs and relevant goods/services: https://www.uspto.gov/trademarks/search/comprehensive-clearance-search-similar-trademarks.
