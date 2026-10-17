# Asset downloads and public links — October 17, 2026

The intent is to reduce download/storage overhead without changing the stickers, and to stop promoting the source repository to customers. Existing local editing, design files and in-app updates must keep working.

## Measured sticker ZIP

`scripts/package-sticker-pack.ps1` packages the existing 304 PNG files and instructions. It reads every image back from the ZIP and compares its SHA-256 with the source, without extracting a duplicate collection.

| Measurement | Result |
| --- | ---: |
| Original PNGs | 446,869,493 bytes |
| ZIP including extraction instructions | 431,499,261 bytes |
| Saved | 15,370,232 bytes / 3.440% |
| Matching archived image hashes | 304 of 304 |

The verified archive is `release/Forma-Studio-Stickers-1.6.1.zip`; its SHA-256 is `3c558b3c78acb5da99fcd87890c0a9704f1d444d042b5f63c7e2dedb4eb44f0e`. The adjacent `.proof.json` records the measurement. The images are unchanged in 1.6.2.

The desktop installer already uses the compressed NSIS application archive and extracts it automatically. A second ZIP is useful for moving a standalone collection, but this measurement is not a reduction in the desktop installer. Extracted PNGs still occupy their original space, and keeping both the ZIP and the extracted collection consumes more space. An optional asset pack can reduce a base installer only by moving those assets out of that installer; it does not reduce the bytes needed for the complete collection.

## Public distribution

The existing marketing pages use branded download URLs and a Forma-hosted walkthrough. The desktop Help menu opens that walkthrough. Showcase copy no longer advertises the repository. The marketing verifier rejects source-host mentions in the homepage and guide and checks their download and asset paths.

Branded URLs redirect to the existing public release host. This preserves old update clients and avoids relaying every large download through metered site bandwidth. The hosting service is visible in the redirect and download details; the repository remains public. Removing promotion does not create source-code privacy. Operator release instructions and required third-party notices retain their technical and attribution information.

The private vulnerability-reporting channel also remains reachable through a branded redirect. [Netlify counts file downloads toward web bandwidth](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), which informed the decision to keep bulk file delivery on the existing release host.

The ZIP remains a separate local artifact; the current app still includes its sticker library. No manual extraction step has been added to normal installation.
