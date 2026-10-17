# Security

Report a suspected vulnerability through the [private vulnerability-reporting channel](https://tryformastudio.netlify.app/security/report). Do not include credentials or customer projects in public issues. Private reporting, Dependabot security updates, secret scanning and push protection are enabled for this repository.

## Boundaries

- The public site is a static marketing and download page. The desktop editor and AI service run on the customer's device. Forma operates no customer application or AI server.
- The AI HTTP service binds to loopback, checks its Host and Origin headers, and requires a random session token for protected operations. The token is returned only to permitted local origins. Request bodies and document imports have size and structure limits.
- The Electron renderer has context isolation and process sandboxing enabled, Node integration disabled, denied permission requests, a restricted preload bridge, and sender/frame/origin checks for desktop IPC. Remote navigation cannot replace the editor.
- Desktop content policy permits requests to its own origin and its local AI service. Remote websites for device screenshots use an isolated session without access to the editor's cookies, files or preload bridge.
- Website-to-brand drafting uses public HTTP(S) HTML only. DNS answers and every redirect are checked against private, loopback, link-local, reserved and multicast addresses; the connection is pinned to the validated public address. No website scripts, cookies, credentials or subresources are used. Pages, redirects, response bytes and network time are bounded. AI execution has no overall six-minute cutoff and can be explicitly cancelled.
- Website text is untrusted reference material. The AI receives a constrained schema with other tools disabled. Source excerpts must match pages actually read. Suggestions are labelled, existing fields are preserved by default, and a customer must choose fields and save the reviewed profile. Source matching does not prove that an AI paraphrase is correct; review is required.
- Imported design images and pattern sources must be embedded raster data or registered Forma assets. Remote resources, prototype keys, nonfinite numbers and excessive nesting/data are rejected before Fabric loads the document.
- Release builds disable Electron's RunAsNode, NODE_OPTIONS and Node CLI inspection fuses, enable cookie encryption and ASAR integrity checking, and require app.asar loading. These protect specific execution paths; they do not make a compromised operating system safe.
- Updates come from GitHub Releases over HTTPS, with SHA-512 integrity checks supplied by electron-updater. Download and restart require user actions. Downgrades, prereleases and web installers are disabled. SHA256SUMS.txt is published with each Windows release.

## Verification and limits

The production npm audit on 2026-10-17 reported zero known advisories. Repeat `npm audit --omit=dev`; this result does not cover unknown vulnerabilities, every native binary, or constitute an independent penetration test. CI checks production advisories, server contracts, update rules, the marketing entrypoint and the application build. Dependabot proposes updates for review; it does not merge them automatically.

**Open development advisory:** GHSA-hp3w-g68c-fv3c affects `sprintf-js` 1.1.3 through electron-builder's development-only download/logging dependencies. The upstream advisory lists no patched version. The full npm audit reports eight moderate affected dependency entries from this one underlying advisory; the production-only audit reports zero. Packaged ASAR inspection found none of the eight affected build-tool packages in the shipped app, including unpacked entries. The GitHub alert remains open for an upstream fix or a separately tested build-tool migration. Build only trusted sources with the pinned lockfile; exclusion from the app does not fix the development dependency itself. The [release evidence](docs/product-review-evidence.json) records the package inspection.

The current Windows installer is **unsigned**. A public CA-issued Windows signing identity and signed releases remain necessary for publisher verification. No certificate has been purchased or claimed. A checksum is an integrity check, not a substitute for publisher authentication. Mac signing and payment delivery are not yet available.

Projects are stored locally, without a Forma account or application-level encryption. Protect the device and use OS disk encryption and backups where appropriate. AI features send the requested brief and relevant content to the user's provider account. Local malware running as the same user, stolen GitHub publishing credentials, provider security and OS/browser vulnerabilities remain outside the protections described above.

Upstream guidance: [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security/), [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses), and [Netlify CSP](https://docs.netlify.com/manage/security/content-security-policy/).
