# What should Forma build next?

This is a proposed roadmap, not a list of shipped features. It follows the goal of a capable local Canva-style editor and is grounded in the current code.

| Priority | Capability                    | Current evidence                                                                          | Useful next version                                                                                  |
| -------- | ----------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1        | Video timeline and audio      | `Motion.tsx` and `export-motion.ts` provide page/device animation, GIF, and silent WebM.  | Trim clips, arrange scenes, add audio, synchronize duration, and export MP4 through a local encoder. |
| 2        | Background removal            | `MagicEraser.tsx` provides painted removal and AI Pencil edits; photo frames clip shapes. | Dedicated foreground masking, hair/edge refinement, restore brush, and transparent PNG.              |
| 3        | Smart format adaptation       | Editor resizing and template fitting change dimensions.                                   | Recompose one design into square, story, landscape, and print layouts with review.                   |
| 4        | Bulk creation                 | Templates are editable and charts import CSV.                                             | Map CSV columns to text/photo placeholders and generate a page for each row.                         |
| 5        | Team review and collaboration | Local documents and campaign folders are available without accounts.                  | Named collaborators, comments, revision history, then concurrent editing.                            |
| 6        | Connected/interactive charts  | Five static styles, editable data, and CSV round trips in `charts.ts`.                    | More types, spreadsheet connections, controlled refresh, tooltips, accessible data tables.           |
| 7        | Brand systems                 | Saved business purpose, mission, audience and voice guide AI requests; colors, exact logos and coordinated collections are available. | Multiple named kits, licensed font uploads, reusable components, approved templates. |
| 8        | Production print              | PDF/image exports exist.                                                                  | Bleed, trim/safe-area overlays, print validation, and a deliberate color-management workflow.        |

Selection refinement now supports editable additions and creative direction. AI Pencil supports contextual edits inside a marked image region. Further AI work should focus on visual quality against the brief: protected content, counts, placement, legibility, consistent style, and revision control.

Canva's [feature overview](https://www.canva.com/features/) documents a broader suite of video, collaboration, and image tools. Its [graphs documentation](https://www.canva.com/graphs/) covers chart/data workflows and connected data. Those sources inform the comparison; Forma's implementation and tests establish what this repository currently supports.

Recommended next build: **video timeline with audio**, followed by **dedicated background removal** and **smart format adaptation**.
