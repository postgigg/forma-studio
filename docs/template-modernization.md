# The modern template collection

Forma Studio 1.5.0 reworks the existing 262 templates. It keeps the same identities, categories and dimensions, every original example text, and the six four-page presentation decks. Saved designs are independent of the library and are not migrated or replaced.

The compositions combine editorial typography, subject-relevant photos, native vector illustrations, focal cropping, ellipse and arch masks, rounded photo corners, shadows and selected angled placements. Six birthdays use native rotatable 3D numerals, and six pitch slides include editable charts. Chart values and sample businesses are illustrative, not reported business results.

Menus keep their sections and prices. Estimates and invoices use ruled item rows. Résumés use clear contact and experience columns. Calendars, weekly schedules and reading challenges use editable grids. Templates insert actual Fabric text, image, vector, chart and 3D objects, so their structure survives editing, undo, saving and export.

Eight new source images were generated with the built-in OpenAI image tool. They contain no baked-in template typography or UI. [Asset manifest](../public/photos/modern/asset-manifest-v1.json) records the original raster paths, focal points and hashes; [the prompt set](../public/photos/modern/prompt-set-v1.md) records their briefs. These are generated editorial sources, not documentary photographs of the sample businesses.

## Verification

The complete library was rendered through the same native template factory used by the editor. The final automated audit found no text outside an artboard, overfull text boxes or text below 1.9% of the shorter artboard dimension. Contact sheets were inspected and revised for weak hierarchy, crowded copy and incorrect image masks. This establishes layout and editing behavior; it is not a guarantee of subjective taste or campaign performance.

The editor tests cover native dimensions, yard signs, all card/deck counts, multi-page insertion, undo/redo, saved documents, image sources and masks, photo filters, PNG export, native 3D rotation and editable chart data.

To reproduce from the repository:

```powershell
node scripts/register-modern-photos.mjs
node scripts/build-modern-templates.mjs
npm run dev -- --port 5193
# In a second terminal:
node scripts/render-modern-templates.mjs
$env:FORMA_TEST_URL='http://127.0.0.1:5193'
npx playwright test tests/studio-templates.spec.ts tests/modern-templates.spec.ts
```

The renderer produces all 262 previews under `public/templates/modern-*.webp`, full contact sheets and audit receipts in `.local/template-modernization`. [Source library](../shared/templates-modern.json) and [generator](../scripts/build-modern-templates.mjs) keep the layouts reproducible. The original studio, occasion and base recipes remain as source material.
