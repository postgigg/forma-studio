<p align="center"><strong>FORMA STUDIO</strong></p>
<h1 align="center">A little space to create.</h1>
<p align="center">A local visual design studio for invitations, brand stories, presentations, data, and ideas.</p>
<p align="center"><a href="#start-locally">Setup</a> · <a href="#take-a-tour">Walkthrough</a> · <a href="#try-an-example">Editable demos</a> · <a href="docs/ROADMAP.md">Roadmap</a></p>

![The actual Forma editor with an editable birthday invitation, template library, canvas, properties, and pages.](docs/media/studio-overview.png)

Build with draggable layers, original artwork, photo-filled letters, editable charts, and AI refinement. Save on your device, run the app with Docker, and export still images or motion. These screenshots show the actual editor in an isolated browser; the example projects are editable Forma files.

![Illustrated workflow: start, compose, refine, and share.](docs/media/workflow.svg)

## What you can make

| Design                                                                                                     | Compose                                                             | Refine                                                                 | Share                                                    |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| **112 templates**, including 100 distinct occasion compositions                                            | **304 transparent AI stickers**, **290 editable graphics**          | AI Designer, selection refinement, AI Pencil, and Magic Eraser         | PNG, JPG, SVG, PDF, editable JSON, GIF, WebM             |
| Birthdays, weddings, seasonal events, business, retail, hospitality, wellness, education, and celebrations | 250 graphics across 25 brand collections; four original Forma fonts | Groups, alignment, gradients, transparent stops, crop, corner rounding | Multiple pages, Present, motion previews, local accounts |

## Start locally

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

Change the document title in the header. Browser saving happens automatically. Use the page strip, **Add page**, and **Duplicate page** to build a larger document.

### 2. Select and compose

Click to move, resize, or rotate an object. Drag across empty canvas space to select several objects or groups. Selection can also begin in the surrounding workspace. **Select area** in the top toolbar lets a drag begin over existing artwork. Hold **Shift**, **Ctrl**, or **Cmd** to add to the selection; **Escape** leaves selection mode.

Right-click for selection actions. Use Layers to select/reorder objects, and purple guides for alignment and equal spacing. Zoom with the canvas wheel or footer.

For a rectangle, open **Properties → Appearance → Corner roundness**. Enter a pixel radius or choose **Square**, **Soft**, or **Pill**. Text supports individual word styling; text and vector graphics support gradients and transparent stops.

![Objects selected together in the editor.](docs/media/area-selection.png)

### 3. Add artwork

**Elements** contains stickers, shapes, and vectors. Filter graphics by brand collection or enable **Use my brand palette**. Upload your exact logo under **Brand** for AI-designed artwork. Uploaded photos remain in **Uploads**.

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

### 7. Make a targeted change with AI Pencil

Select a photo or background image, then choose **AI Pencil** in the toolbar, properties, or right-click menu. Mark the desired area with **Circle an area**, **Freehand outline**, or **Paint an area**. Describe the change, including direction, scale, or details that matter.

> Add a shark swimming left in this area. Match the ocean illustration's teal colors, flat shapes, gentle lighting, and scale. Keep the sailboat and everything outside the marked area.

The original image supplies context and style; your mask supplies location. Select **Generate targeted edit**, review the before/after result, then **Apply targeted edit**. Clear/undo marks to refine the target or try again. Masked compositing preserves pixels outside the marked area in the working image, and Undo restores the original layer. Mark enough room for the new subject and its local shadows or wake.

![AI Pencil's real marked-area and shark result comparison.](docs/media/ai-pencil-review.png)

**Magic Eraser** uses the same review-and-apply workflow to remove a painted object and reconstruct the background. AI Pencil and Magic Eraser currently operate on one selected raster image at a time.

### 8. Present a website inside a device

Choose **Frames**, then MacBook, Laptop, iPad, Tablet, or iPhone. Enter an HTTP(S) URL and select **Render website**, or upload a screenshot. Choose a finish, adjust horizontal/vertical perspective, and add Orbit, Rock, or Float movement. **Edit frame** refreshes or replaces the screen later.

<table><tr><td width="50%"><img src="docs/media/device-macbook.png" alt="A captured website in a perspective MacBook frame" /></td><td width="50%"><img src="docs/media/device-motion.gif" alt="Actual animated GIF export of a moving device frame" /></td></tr></table>

Frames save a website capture; they are not interactive browsers in the artwork. Reopening does not fetch the site again. Captures use a fresh session, so protected pages may show login; upload a screen image when needed. GIF/WebM include motion, while PNG/PDF/SVG retain the chosen static pose.

### 9. Save and export

Use **Animate** or **Present** to preview movement. Export PNG, JPG, SVG, PDF, JSON, GIF, or WebM. Motion renders an independent copy and keeps the source unchanged. SVG embeds bitmap and font assets; custom photo/device frames are rendered images within the SVG.

Browser designs, uploads, and brand settings live in IndexedDB for the current origin. **Export JSON for a portable editable backup.** Account saving uses this installation's Supabase. Clearing browser data removes device-local work that has not been backed up or saved to an account.

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
| `src/refinement.ts`, `server/refinements.mjs`        | Selected-layer AI edits and additions                  |
| `src/MagicEraser.tsx`, `server/pencil-direction.mjs` | Masked erasing and contextual AI Pencil edits          |
| `server/designer.mjs`                                | Loopback worker, authenticated jobs, origin checks     |
| `shared/`, `public/`                                 | Catalogs, contracts, original artwork, fonts, previews |
| `supabase/`, `tests/`                                | Database configuration and regression checks           |

The app uses React, TypeScript, Vite, Fabric, Node, Playwright, nginx/Docker, and Supabase. `netlify.toml` supplies static build configuration. Publishing this repository does not deploy the application or expose the local worker; hosted services need separate configuration.

## Validation and demo regeneration

Verified on Windows on **2026-10-13**: the production Docker build succeeded, **33 browser tests** and **13 server checks** passed, and the editor fit four desktop/mobile viewport sizes. The real AI Pencil ocean demo preserved every pixel outside its marked region and supported one-step Undo. A separate real refinement produced 45 editable stars distributed across a poster while preserving its text. The scripts and example screenshots below make these checks reproducible.

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
```

## Artwork and scope

Stickers are individual transparent PNGs generated with the built-in image tool. Prompts and provenance live in `shared/sticker-prompts*.json` and `shared/sticker-provenance*.json`. Branded graphics and occasion templates use native editable geometry. The four Forma fonts come from the original geometry in `scripts/build-fonts.py`.

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
