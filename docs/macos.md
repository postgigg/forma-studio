# Forma Studio for Mac

The intent is to ship the existing Forma editor on Windows and macOS, with the Mac edition priced at **$49 as a one-time payment**. The Mac work uses the same React editor, global styles, purple palette, folded F, wordmark and artwork. The implementation stays on the existing `main` branch.

## Build and run

The app targets **macOS 12 Monterey and later**, on Intel (`x64`) and Apple Silicon (`arm64`). Mac builds and the local Mac launcher use the pinned `electron-mac` alias, **Electron 43.8.0**. Windows retains **Electron 44.7.2**. [Electron 44 dropped Monterey support](https://www.electronjs.org/docs/latest/breaking-changes/#removed-macos-12-support); using a compatible runtime is required in addition to setting the bundle's minimum OS. The verifier checks the actual framework version and Mach-O `minos` value, so an incompatible runtime cannot pass on a relabelled bundle.

Electron 43 is currently supported through January 2027. Track its patch releases and review the Mac baseline before that upstream support ends. See [Electron's support notice](https://www.electronjs.org/blog/electron-44-0).

Use Node 22.12 or later and Xcode Command Line Tools. Run each build with native Node on its target architecture; the package script checks for that architecture's bundled AI executable. This keeps Electron and the AI executable on the same architecture. There are two native packages, rather than a universal binary.

```sh
npm ci
mkdir -p .local
npm run test:desktop
npm run test:server
npm run desktop:package:mac
node scripts/verify-mac-package.mjs
```

The package script builds the production editor with the optional cloud configuration disabled and creates:

| Output | Intel | Apple Silicon |
| --- | --- | --- |
| App | `release/mac/Forma Studio.app` | `release/mac-arm64/Forma Studio.app` |
| Installer | `release/Forma-Studio-<version>-x64.dmg` | `release/Forma-Studio-<version>-arm64.dmg` |
| Update archive | `release/Forma-Studio-<version>-x64.zip` | `release/Forma-Studio-<version>-arm64.zip` |
| Checksums | `release/SHA256SUMS-mac-x64.txt` | `release/SHA256SUMS-mac-arm64.txt` |

Each build also produces `latest-mac.yml`, blockmaps and `update-policy.json`. The Windows package command is `npm run desktop:package:win`; `npm run desktop:package` continues to select the host platform. Packaging uses `--publish never`.

For a quicker app-only build and native smoke test:

```sh
npm run desktop:package:mac -- --dir
npm run desktop:smoke -- --packaged
```

The script selects the native architecture's app path. `--dir` creates only the app bundle; use the full package command to regenerate installers and update metadata. `npm run desktop` also selects the compatible Mac runtime when running from source.

The smoke test uses a separate profile and checks the shared Forma artwork, renderer isolation, platform shortcut labels, native Edit menu commands, Command/Control duplication, bundled AI-worker connection, website capture, bundled visual-review rendering, PNG/PDF/JSON saves, fonts, 3D and page ordering. On Mac it also closes the window, reopens it through the application activation event, and checks that the saved workspace returns. Screenshots and results go to `.local/desktop-smoke/`. Its AI check verifies worker startup and connection; it does not submit paid generation jobs.

## Native behavior and packaging

[The desktop lifecycle](../desktop/main.cjs) saves before closing. On Mac, closing the window keeps the app running, activation recreates the window, and Quit saves before shutting down the worker and local server. Windows closes the app through its existing exit path. [The platform menu](../desktop/platform.cjs) supplies the native application, File, Edit, View, Window and Help menus. Edit commands route to the canvas history or to the focused text field, depending on focus.

[The shortcut helper](../src/platform.ts) supplies Command-key labels on Mac and Control-key labels on Windows. The existing editor already accepts both modifier keys. The toolbar, context menu, help, selection hints and copy feedback now show the current platform's shortcuts, using the existing components and [global CSS](../src/styles.css). [The existing identity guide](../public/brand/README.md) defines the shared artwork and palette.

The bundled AI executable resolves from `app.asar.unpacked` for the current platform and architecture. The package includes its code-mode helper. Website capture and AI visual review use Electron's bundled browser. The visual-review page has an ephemeral partition, no workspace storage or preload, and denies external requests and permissions. The worker calls it through an authenticated loopback endpoint; the browser/Docker review path still uses Playwright.

## Signing and distribution

The default package is signed locally with an **ad-hoc development signature**. Its hardened runtime and notarization are disabled for that development build. Development packages enable the CLI inspector required by [Playwright's native Electron automation](https://playwright.dev/docs/api/class-electron#launch). Signed distribution builds retain the disabled inspector setting. The verifier checks this distinction. Automatic updates are disabled for the Mac development build.

For a distribution build, provide `CSC_LINK` (the Developer ID Application certificate), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID` in the build environment, then run:

```sh
npm run desktop:package:mac -- --signed
node scripts/verify-mac-package.mjs --signed
```

This path requires signing, enables the configured hardened runtime and entitlements, and invokes electron-builder's Apple notarization. The verification command checks the signature, stapled ticket and Gatekeeper assessment. The packaged metadata enables Mac updates only for this distribution path. Credentials belong in the build environment, not in the repository or app. See the [electron-builder 26 notarization instructions](https://www.electron.build/v26/docs/notarization/).

The [Build Mac workflow](../.github/workflows/build-mac.yml) runs native Intel and Apple Silicon jobs using `macos-15-intel` and `macos-15`. Both runner labels and architectures are documented in [GitHub's runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Each job builds and exercises a development app bundle, then builds and verifies the final installers and retains artifacts and evidence. It does not publish a release. A manual signed run uses the repository secrets `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`.

Before a public release, both architectures need passing functional checks and final signed-app runtime checks. Native automation uses the development bundle; it does not establish the signed app's runtime behavior. Combine the final `latest-mac.yml` file lists into one metadata file with both architectures' ZIP/DMG entries and their original checksums; uploading one architecture's metadata over the other would remove the other update path. Keep Windows `latest.yml` separate. The pinned updater selects ARM files when available on Apple Silicon and excludes them on Intel (`electron-updater/out/MacUpdater.js`, `filterFilesForArch`).

The website and README state the $49 one-time Mac price and retain the current availability status. Checkout, paid delivery and a public Mac release are outside this compatibility implementation.

## Verification evidence

Local verification on **2026-10-17**, with an Intel Mac running **macOS 12.7.5** and Node **22.23.3**:

| Check | Observed result |
| --- | --- |
| Production TypeScript/Vite build | Passed as part of Mac packaging |
| Monterey-compatible Intel DMG and ZIP | Regenerated with Electron 43.8.0; all artifact/metadata SHA-256 checks passed |
| `npm run test:desktop` | 14 passed, 0 failed, including separate Mac/Windows runtime selection |
| `npm run test:server` | 37 passed, 0 failed; test starts its own worker on an ephemeral port |
| `npm audit --omit=dev --audit-level=high` | 0 vulnerabilities |
| `node scripts/verify-marketing-site.mjs` | Passed; $49 text and existing Windows links/assets verified |
| Workflow YAML parsing | All three workflow files parsed successfully |
| Existing global CSS, brand files and desktop artwork | No diff from the cloned source |
| Intel app bundle verification | Passed: source/brand byte comparisons, app and AI executable architectures, icon, bundle metadata and strict ad-hoc signature check |
| Bundled Electron framework | Version 43.8.0; `vtool -show-build` reports `minos 12.0` |
| Native packaged-app smoke test | Passed on macOS 12.7.5: native menu/keyboard editing, bundled review/capture browser, 3D, fonts, PNG/PDF/JSON saves, style setup, page order and Mac save/reopen |

[The package verifier](../scripts/verify-mac-package.mjs) compares the packaged desktop/worker source and brand SVGs byte-for-byte with the checkout, checks the app and both AI executables' native architecture, validates the bundle identity, version, minimum OS and icon, and runs strict signature verification. It writes the observed result to `.local/mac-package-verification.json`. The package script writes artifact SHA-256 checksums beside the installers.

The native smoke result is recorded in `.local/desktop-smoke/result.json`, with actual editor screenshots in that directory. The compatible app is installed at `~/Applications/Forma Studio.app`; the complete native test also passed against this installed copy, with results and screenshots in `.local/installed-monterey-smoke/`. The installed app was opened normally and its editor and local worker both responded successfully. `.local/mac-installation.json` records the installed runtime, minimum OS and signature verification, and the previous macOS 13-only copy is retained under `.local/installed-backups/`.

**Apple Silicon execution, Developer ID signing/notarization and in-app Mac update installation have not been verified here.** The CI jobs are configured to collect native architecture evidence; they have not been run from this local checkout. The local evidence establishes the Intel development build's behavior on macOS 12.7.5.
