# Desktop updates without a Forma server

The desktop app uses `electron-updater` with the public `postgigg/forma-studio` GitHub Releases feed. GitHub hosts the installers and update metadata. Forma checks after launch, every six hours while open, and from Help → Check for updates. No customer GitHub account, embedded token, running Forma backend or push-notification service is required.

An available update opens a popup. The user downloads it, then chooses Save & restart. Downloads use the updater's release checksum validation. Automatic download and installation on ordinary app exit are disabled. Unsigned Windows releases remain unsigned; checksums do not provide an Authenticode publisher signature. Mac updates require a signed/notarized Mac release and are not available yet.

`stable.json` supplies a release-specific minimum version. Set `minimumSupportedVersion` to the oldest supported version to label older installations **Update required**, and explain the change in `message`. The app only accepts a policy matching the available release. Users can save and keep working before restarting; losing internet access never locks away their designs. An invalid or missing policy leaves the normal update prompt available.

## Publish an update

1. Increase `package.json` and the lockfile version with `npm version X.Y.Z --no-git-tag-version`.
2. Set `updates/stable.json` to the same version, choose the minimum supported version, and update `updates/release-notes.md`.
3. Test and push the source to GitHub.
4. On GitHub, open Actions → Release Windows → Run workflow. The GitHub-hosted Windows runner builds and publishes a complete release. It does not create a server you maintain.

The workflow uploads the installer, `.blockmap`, `latest.yml`, `update-policy.json`, and `SHA256SUMS.txt` to a draft before publishing it. It fails if that version already exists, rather than replacing a release clients may have downloaded.

For a local release, run `npm ci`, `npm run test:updates`, and `npm run desktop:package`, then upload those same five files to a draft GitHub release and publish it only after all uploads complete. Do not change the repository owner/name without first shipping a migration to installed clients.

Existing versions 1.1.x do not contain an updater: users install 1.2.0 once manually. Future releases can then appear inside Forma while the user is online.
