<p align="center"><strong>FORMA STUDIO</strong></p>
<h1 align="center">A little space to create.</h1>
<p align="center">A local visual design studio for invitations, brand stories, presentations, data, and ideas.</p>
<p align="center"><a href="#download-the-desktop-app">Download & setup</a> · <a href="#take-a-tour">Walkthrough</a> · <a href="#try-an-example">Editable demos</a> · <a href="docs/ROADMAP.md">Roadmap</a></p>

![The actual Forma editor with an editable birthday invitation, template library, canvas, properties, and pages.](docs/media/studio-overview.png)

Build with draggable layers, original artwork, photo-filled letters, editable charts, and AI refinement. Save on your device, run the app with Docker, and export still images or motion. These screenshots show the actual editor in an isolated browser; the example projects are editable Forma files.

![Illustrated workflow: start, compose, refine, and share.](docs/media/workflow.svg)

## What you can make

| Design                                                                                                     | Compose                                                             | Refine                                                                 | Share                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| **262 editable templates**, including 150 new compositions                                            | **304 transparent AI stickers**, **290 editable graphics**          | AI Designer, selection refinement, AI Pencil, and Magic Eraser         | PNG, JPG, SVG, PDF, editable JSON, GIF, WebM             |
| Birthdays, weddings, seasonal events, business, retail, hospitality, wellness, education, and celebrations | 250 graphics across 25 brand collections; four original Forma fonts | Groups, alignment, gradients, transparent stops, crop, corner rounding | Multiple pages, Present, motion previews, local accounts |

## Download the desktop app

**Windows is free.** Download [Forma Studio 1.1.0 for Windows](https://github.com/postgigg/forma-studio/releases/download/v1.1.0/Forma-Studio-Setup-1.1.0.exe), run the installer, and open **Forma Studio** from your desktop or Start menu. Windows 10/11, 64-bit. The current installer is unsigned, so Windows may display an unknown-publisher warning.

The desktop app bundles the editor, its local worker and Codex CLI. No terminal, Node.js or Docker is required for everyday use. Projects save locally; **Export → Forma JSON** creates an editable backup. To move a browser project into the desktop app, export it from the browser and import the JSON file in Forma. Their storage is separate.

For AI, open **AI Designer → AI account & connection → Sign in to Codex**. Complete the sign-in in your browser and return to Forma. Your existing Codex login is also recognized. AI needs a supported account, internet access and available provider usage; those costs are separate from the app. Manual editing and exports work without AI. Website frames use the bundled desktop browser to capture pages in an isolated session.

The Mac app is planned at **$19 once**. Payment delivery and Apple signing/notarization are not configured yet; there is no Mac checkout or verified Mac download in this release.

For developers, `npm run desktop` opens the built desktop app and `npm run desktop:package` builds an installer. `npm run desktop:smoke` checks the app using a separate test profile. Desktop services bind to `127.0.0.1:51860` and `127.0.0.1:51861`; app data and AI job history live in the user's Forma app-data directory.

## Start locally from source

The complete installation has been exercised on **Windows with Docker Desktop and Microsoft Edge**. Install **Node.js 22.12 or newer in the 22.x line**, npm, and Git. Docker Desktop must be running for the complete stack.

### 1. Get the project

```powershell
git clone https://github.com/postgigg/forma-studio.git
cd forma-studio
npm ci
```

### 2. Start Forma

```powershell
npm run local
```

The first start downloads Docker images. The script creates the isolated `forma-local` network, starts Supabase, writes public browser settings to `.env.local`, builds the editor container, and starts the local worker in the background. Open **[localhost:5186](http://localhost:5186)**.

| Service         | Address                | Purpose                          |
| --------------- | ---------------------- | -------------------------------- |
| Editor          | http://localhost:5186  | Design in the browser            |
| Local worker    | http://127.0.0.1:5188  | AI jobs and website captures     |
| Supabase API    | http://127.0.0.1:57621 | Local accounts and saved designs |
| Supabase Studio | http://127.0.0.1:57623 | Inspect the database             |

Use the same browser address consistently: `localhost` and `127.0.0.1` have separate browser storage. The editor binds to this computer's loopback interface.

### 3. Enable AI and captures

Install the [Codex CLI](https://developers.openai.com/codex/cli/), sign in, then start the worker:

```powershell
npm install -g @openai/codex
codex login
npm run ai:start
```

The current capture worker uses Playwright's Microsoft Edge channel. Install Edge if it is unavailable. On Windows, a custom Codex installation can be selected by setting `FORMA_CODEX_BIN` to its `codex.exe` path before starting the worker.

**AI needs internet access and a signed-in provider account.** Localhost keeps the application, documents, and worker on your computer; model inference uses the provider. Briefs and selected images are sent for the requested AI operation. Manual editing and browser saving work without AI.

### Frontend-only development

For editing without Docker/account storage:

```powershell
npm ci
npm run dev
```

Port 5186 must be free. If the Docker editor is running, stop that service first with `docker compose stop studio`. `.env.example` lists the optional public account-storage settings. Never place a service-role key in frontend configuration.

An isolated preview can run alongside the Docker app with `npm run dev -- --port 5190`. The production worker accepts configured local origins on ports 5186 and 5187; other preview origins need deliberate worker configuration. UI tests can use isolated fixture endpoints.

### Update and stop

```powershell
# Rebuild after source changes
docker compose --env-file .env.local up -d --build

# Stop without deleting saved database volumes
docker compose stop
npm run db:stop

# Stop the worker after active jobs finish
npm run ai:stop
```

Run `npm run local` to start again. Logs and job files are under `.local/designer.log` and `.local/designer`.

## Take a tour

### 1. Start with a purpose

Open **Design**, choose an occasion, and click a template. Titles, shapes, graphics, and photos remain editable layers. Or choose **New design** for social, presentation, print, or custom dimensions.

The new collection includes **24 yard signs, 24 business cards, 24 birthday posters, 24 flyers, 24 business-pitch slides**, and **30 menus, invitations, social campaigns, business documents, community and life-event layouts**. These are distinct compositions with their own hierarchy, geometry and palette. Choose **Use template dimensions** to apply the original format to a single-page design; otherwise the template fits your canvas. Six pitch covers offer **Use 4-page deck**. A deck inserts its other pages after the current page, and one Undo restores the previous document. The color picker includes 32 starting swatches plus custom colors.

![A selection of the new business card and birthday layouts, rendered from editable template objects.](docs/media/studio-template-selection.png)

Change the document title in the header. Browser saving happens automatically. Use the page strip, **Add page**, and **Duplicate page** to build a larger document.

### 2. Select and compose

Click to move, resize, or rotate an object. Drag across empty canvas space to select several objects or groups. Selection can also begin in the surrounding workspace. **Select area** in the top toolbar lets a drag begin over existing artwork. Hold **Shift**, **Ctrl**, or **Cmd** to add to the selection; **Escape** leaves selection mode.

Right-click for selection actions. Use Layers to select/reorder objects, and purple guides for alignment and equal spacing. Zoom with the canvas wheel or footer.

For a rectangle, open **Properties → Appearance → Corner roundness**. Enter a pixel radius or choose **Square**, **Soft**, or **Pill**. Text supports individual word styling; text and vector graphics support gradients and transparent stops.

![Objects selected together in the editor.](docs/media/area-selection.png)

### 3. Add artwork

**Elements** contains stickers, shapes, and vectors. Filter graphics by brand collection or enable **Use my brand palette**. Upload your exact logo under **Brand** for AI-designed artwork. Uploaded photos remain in **Uploads**.

Under **Brand → Your business & mission**, save your company name, business purpose, mission statement, audience and visual voice. AI Designer, refinement, AI Pencil, Magic Eraser and photo creation receive this profile when **Use brand context** is checked. Your explicit request takes priority. Erasing still removes the marked object and restores its surroundings; it does not add brand decorations. Elements can **Prioritize artwork for my business**, bringing relevant graphics and stickers forward while keeping the full library available.

![Graphic collections beside an editable quarterly report.](docs/media/elements-library.png)

### 4. Fill a letter or shape with a photo

1. Open **Elements → Photo frames**.
2. Choose a shape, alphabet letter, or number. Letter frames offer different fonts and italics.
3. Drag a photo from Photos, Uploads, or your computer onto the frame. Selecting a frame and clicking a library photo also fills it. Existing canvas photos can be dragged into a frame.
4. Double-click the frame or choose **Crop photo frame**.
5. Drag to reposition, adjust crop zoom, change the shape/font, or type a short word, then save.

The image and crop settings remain editable after saving. Remove or replace the photo while keeping the frame. Undo restores the previous crop.

![A photograph clipped to an italic Georgia A, with crop and font controls.](docs/media/photo-frame-crop.png)

### 5. Tell a story with data

Open **Charts** and choose **Bar**, **Line**, **Area**, **Pie**, or **Donut**. Enter values, paste CSV, or import a `.csv` file. Add up to **20 categories and four series**, then edit titles, colors, background, and value labels.

Select the chart and choose **Edit data** to revise it later. Switching styles preserves the dataset. Pie/donut display the first series and require non-negative values with a positive total. Bar, line, and area support negative values. **CSV** downloads the data again.

```csv
Category,2026,2025
Social,42,32
Search,68,48
Direct,56,46
Referral,92,65
```

Charts render as native canvas groups. Keep the group intact for the data editor; ungrouping exposes the individual artwork.

![Chart data editor with numeric values and a live preview.](docs/media/chart-editor.png)

### 6. Refine selected content with AI

Select objects/groups and choose **Improve with AI**. Give a concrete brief and choose **Precise**, **Art directed**, or **Bold redesign**. Compare the selection with the proposed result before applying.

> Add 45 stars throughout this cinema poster. Vary their size and spacing across the top, sides, and bottom. Keep every word and the film frame. Leave the title and small print clear.

Refinement can add separate editable stars, sparkles, shapes, paths, or text. It validates element geometry and explicit numeric star requests. Existing groups and unselected artwork are preserved; one Undo restores the original. Short design notes explain the visible decisions. Review the AI's work before applying.

![A real AI refinement comparison, generated from the 45-star brief.](docs/media/ai-refinement.png)

Use **AI Designer** for a new editable composition and **Photos → Create with AI** for a new image.

Open **Design intent & quality** to specify the desired outcome, main message, what must remain unchanged and what to avoid. These instructions reach AI Designer, photo creation, selected-layer refinement and AI Pencil. The server also provides guidance on hierarchy, typography, grouping, legibility, palette, exact copy and format-specific design choices. Magic Eraser stays focused on restoring the marked area. The brief and selected region take priority over inferred style.

The local worker explicitly uses **GPT-6 Astra with maximum reasoning** through Codex CLI. Image creation and editing use **Codex native image generation**; the CLI does not expose a separate image-model identifier here. The model name shown in the UI comes from the running worker. Guidance improves the brief, but every AI result still needs review.

To design around an existing photo, select it and choose **Design with this image** in Properties or the right-click menu. **Keep image quality** is the default: the actual original is embedded as a photo layer, with new text, logos and layout elements on separate layers. This avoids rebuilding photographic subjects out of primitive shapes. Use AI Pencil for targeted changes within the photo. **Rebuild simple artwork** remains an explicit option for flat posters and simple graphics; it is a stylized approximation and cannot recover hidden original layers. Completed jobs retain the embedded photo and exact logo when reopened or refined.

### 7. Make a targeted change with AI Pencil

Select a photo or background image, then choose **AI Pencil** in the toolbar, properties, or right-click menu. Mark the desired area with **Circle an area**, **Freehand outline**, or **Paint an area**. Describe the change, including direction, scale, or details that matter.

> Add a shark swimming left in this area. Match the ocean illustration's teal colors, flat shapes, gentle lighting, and scale. Keep the sailboat and everything outside the marked area.

The original image supplies context and style; your mask supplies location. Select **Generate targeted edit**, review the before/after result, then **Apply targeted edit**. Clear/undo marks to refine the target or try again. Masked compositing preserves pixels outside the marked area in the working image, and Undo restores the original layer. Mark enough room for the new subject and its local shadows or wake.

![AI Pencil's real marked-area and shark result comparison.](docs/media/ai-pencil-review.png)

**Magic Eraser** uses the same review-and-apply workflow to remove a painted object and reconstruct the background. AI Pencil and Magic Eraser currently operate on one selected raster image at a time.

### 8. Present a website inside a device

Choose **Frames**, then MacBook, Laptop, iPad, Tablet, or iPhone. Enter an HTTP(S) URL and select **Render website**, or upload a screenshot. Choose a finish, adjust horizontal/vertical perspective, and add Orbit, Rock, or Float movement. **Edit frame** refreshes or replaces the screen later.

Laptop frames use a hinged screen and a solid keyboard base with keys, trackpad, ports and depth. Drag the preview to rotate, choose a view preset, or adjust **Laptop screen opening**. A software renderer retains the same geometry when WebGL is unavailable. The dialog keeps its save controls accessible on smaller screens.

<table><tr><td width="50%"><img src="docs/media/device-macbook.png" alt="A captured website in a perspective MacBook frame" /></td><td width="50%"><img src="docs/media/device-motion.gif" alt="Actual animated GIF export of a moving device frame" /></td></tr></table>

Frames save a website capture; they are not interactive browsers in the artwork. Reopening does not fetch the site again. Captures use a fresh session, so protected pages may show login; upload a screen image when needed. GIF/WebM include motion, while PNG/PDF/SVG retain the chosen static pose.

### 9. Add real 3D lettering and objects

Open **3D objects** for 26 letters, 10 numbers and eight shapes. Choose a starting point, type up to 16 characters, select an original Forma letterform, and adjust depth, bevel, color and material. Drag the preview to rotate, use its arrow keys, or enter X/Y/Z degrees. **Front** and **Three-quarter** provide useful starting views.

Add the object, then double-click it or choose **Edit 3D object** to change it later. Geometry settings remain editable in saved projects and Forma JSON; Undo restores earlier settings. Choose **Full turn** or **Gentle rotation** for Present and GIF/WebM exports. PNG, PDF and SVG use the current static pose; SVG embeds a rendered image of the 3D object. All geometry and font outlines are bundled for offline use. A software fallback preserves the shape when WebGL is unavailable, with simpler lighting.

The regular canvas rotation handle also shows live degrees while you drag it.

![The packaged desktop app editing extruded Forma lettering, with material, color, depth, bevel and rotation controls.](docs/media/3d-editor.png)

### 10. Save and export

Use **Animate** or **Present** to preview movement. Export PNG, JPG, SVG, PDF, JSON, GIF, or WebM. Motion renders an independent copy and keeps the source unchanged. SVG embeds bitmap and font assets; custom photo/device frames are rendered images within the SVG.

Browser designs, uploads, and brand settings live in IndexedDB for the current origin. **Export JSON for a portable editable backup.** Desktop exports use the native Save dialog; the app saves pending changes before closing. Optional account saving is available in the source installation through Supabase. Clearing browser or app data removes local work that has not been backed up.

## Try an example

Download a JSON file using GitHub's **Download raw file** button, then drag it onto Forma. All three are original editable samples.

| Birthday invitation                                     | Quarterly report                                     | Photo-filled letter                                        |
| ------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| ![Birthday example](docs/media/birthday-invitation.png) | ![Chart example](docs/media/quarterly-report.png)    | ![Photo-letter example](docs/media/alpine-photo-frame.png) |
| [Download JSON](docs/examples/birthday-invitation.json) | [Download JSON](docs/examples/quarterly-report.json) | [Download JSON](docs/examples/alpine-photo-frame.json)     |
| Edit the name, date, colors, and illustration.          | Select the chart and edit its data.                  | Change the A's photo, crop, font, or letters.              |

## Project map

| Location                                             | Responsibility                                         |
| ---------------------------------------------------- | ------------------------------------------------------ |
| `src/editor.ts`                                      | Canvas operations, history, selection, save/export     |
| `src/charts.ts`, `src/ChartDesigner.tsx`             | Charts, CSV, and data editor                           |
| `src/photo-frame.ts`, `src/PhotoFrames.tsx`          | Shape/letter masks and cropping                        |
| `src/device-frame.ts`, `src/Frames.tsx`              | Device mockups and perspective                         |
| `src/solid-object.ts`, `src/solid-renderer.ts`, `src/Solids.tsx` | Editable 3D geometry, rendering and controls |
| `server/art-direction.mjs`, `src/DesignIntent.tsx` | Outcome-driven AI guidance and user constraints |
| `desktop/`, `scripts/package-desktop.mjs` | Desktop startup, native export, capture and packaging |
| `src/refinement.ts`, `server/refinements.mjs`        | Selected-layer AI edits and additions                  |
| `src/MagicEraser.tsx`, `server/pencil-direction.mjs` | Masked erasing and contextual AI Pencil edits          |
| `server/designer.mjs`                                | Loopback worker, authenticated jobs, origin checks     |
| `shared/`, `public/`                                 | Catalogs, contracts, original artwork, fonts, previews |
| `supabase/`, `tests/`                                | Database configuration and regression checks           |

The app uses React, TypeScript, Vite, Fabric, Node, Playwright, nginx/Docker, and Supabase. `netlify.toml` supplies static build configuration. Publishing this repository does not deploy the application or expose the local worker; hosted services need separate configuration.

## Validation and demo regeneration

Verified on Windows on **2026-10-14**: the production build succeeded, **41 browser tests** and **17 server checks** passed. The optional live import test was skipped in the final regression run. Two separate live GPT-6 Astra design jobs produced an editable florist yard sign and birthday poster with the supplied copy intact. The 3D checks cover editing, persistence, Undo, nonblank renders, motion frames and GIF export; the rotation readout is checked at two zoom levels.

Earlier checks rendered all 150 new template previews without text overflow, retained a supplied photograph and logo byte-for-byte as editable layers, and exercised laptop rotation with WebGL disabled. Real AI Pencil and refinement checks preserved pixels outside the marked region and supported Undo. The scripts and example screenshots below make these checks reproducible.

The **packaged Windows executable** also passed an isolated-profile check: renderer isolation, the bundled Codex worker reporting GPT-6 Astra, website capture, editable 3D, and native PNG/PDF/JSON saves. The landing page was checked at desktop and mobile widths, including filters, image previews and FAQ controls. The Windows installer is unsigned; Mac packaging and payment delivery remain unverified.

With the local editor and worker running:

```powershell
npm run build
npm run test:server
npm test
```

Tests use isolated headless Edge sessions. Coverage includes selection, corners, chart data/CSV, photo frames, masked compositing, AI addition application, assets, rapid zoom, device capture, motion, export, and Undo. Routine AI interaction tests use controlled responses. A completed AI Designer job can be checked by setting `FORMA_AI_TEST_JOB`; otherwise that integration test is skipped.

To regenerate documentation screens, start the Vite preview on 5190:

```powershell
$env:FORMA_TEST_URL = 'http://127.0.0.1:5190'
$env:FORMA_DOCS = '1'
npx playwright test tests/data-design.spec.ts tests/frames.spec.ts
node scripts/build-docs.mjs
```

The following optional checks make real provider requests through isolated test services and retain evidence under `.local`:

```powershell
node scripts/test-creative-refinement-live.mjs
node scripts/test-ai-pencil-live.mjs
node scripts/check-design-quality.mjs
```

## Artwork and scope

Stickers are individual transparent PNGs generated with the built-in image tool. Prompts and provenance live in `shared/sticker-prompts*.json` and `shared/sticker-provenance*.json`. Branded graphics and occasion templates use native editable geometry. The four Forma fonts come from the original geometry in `scripts/build-fonts.py`. Regeneration requires Python with `fonttools` and `skia-pathops`; the script emits both TTF files and bundled Three.js outlines, so 3D text does not need a remote font parser.

Sample photographs in the photo library come from Unsplash. You can replace them with your own photographs through Uploads.

The [roadmap](docs/ROADMAP.md) separates working tools from proposed next features: timeline video/audio, background removal, smart format adaptation, bulk creation, collaboration, and connected data.

## Troubleshooting

| Symptom                        | Check                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Port 5186 occupied             | Stop the Docker editor before `npm run dev`, or use preview port 5190.                                                               |
| Docker/Supabase will not start | Start Docker Desktop and retry. Set `FORMA_DOCKER_SUBNET` to a free subnet before initial network creation if the default conflicts. |
| AI unavailable                 | Run `codex login`, start the worker, and inspect `.local/designer.log`. Restart after sign-in once active jobs finish.               |
| Capture fails                  | Confirm Edge is installed and the HTTP(S) page is reachable. Upload a screenshot for protected pages.                                |
| Designs appear missing         | Use the same profile and exact origin. Check account storage or import a JSON backup.                                                |
| Source changed but app did not | Rebuild the Docker editor, then refresh the browser.                                                                                 |
