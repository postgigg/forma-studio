# Back up Forma to your Wasabi account

Open **My designs → Cloud storage** in the desktop app. This is optional: designs still save on the device without a cloud connection. Forma sends backups directly to your Wasabi account; no Forma storage server receives the keys or workspace.

1. Create a [Wasabi account](https://wasabi.com/) and a **private bucket** in your preferred region. Keep public access disabled.
2. Create a dedicated programmatic user and attach a policy for that bucket and the backup folder. Create an access key for that user. Prefer this over root account keys.
3. Enter the bucket, region, [matching HTTPS service endpoint](https://docs.wasabi.com/docs/what-are-the-service-urls-for-wasabi-s-different-storage-regions), folder, access key and secret in Forma. The default folder is `forma-studio`.
4. Choose **Connect & back up**. Forma verifies bucket access, encrypts the connection with the operating system's key storage and uploads the first snapshot. The secret is cleared from the setup form. An upload failure does not claim a completed backup.
5. Use **Back up now** whenever you need a current snapshot, or enable automatic backups of changed saved work, up to every 15 minutes while Forma is open. Unchanged content is skipped. Offline failures keep local work intact and retry later.
6. **Browse backups → Review restore** downloads and verifies a snapshot. Restore adds new copies of designs and campaigns, deduplicates uploads and text kits, and retains the campaign-to-design links. Select **Use the backup’s brand, palette, logo and personal style** only when you want those shared settings applied. Existing projects stay intact. Reopen the studio after restoration to load the recovered libraries.

Snapshots include saved designs and pages, campaigns and folders, uploaded images, brand purpose and mission, personal style, palette, logo, uploaded fonts, text kits and the saved campaign draft. Existing drafts are kept when restoring. Unfinished restored AI batches stay paused, and job identifiers are cleared; restoration never silently starts paid AI work. Finish or pause running campaigns before restoring.

The desktop uses AWS Signature Version 4 over HTTPS, Wasabi server-side AES256 encryption and a compressed JSON snapshot with an integrity digest. Each snapshot can contain up to **256 MB of uncompressed saved workspace data**. Built-in stickers and template assets remain supplied by the matching Forma app instead of being uploaded again. AI credentials, cloud keys, Mac activation credentials and operating system preferences are excluded.

Connection secrets are encrypted with Electron safeStorage (Windows DPAPI or the Mac keychain). Forma refuses plaintext fallback. The setup requires an unlocked supported operating system key store. The browser editor cannot connect cloud credentials; use the desktop app. Backups are private objects, not published designs or public image URLs. Their encryption is provider-side; this is not a separate end-to-end backup password.

Disconnecting erases the saved local Wasabi connection. It keeps your local projects and the existing objects in your Wasabi account. Manage retention in your Wasabi console. Forma does not automatically delete old snapshots, require delete permission or make a bucket public. Wasabi's own [storage minimums](https://docs.wasabi.com/docs/how-does-wasabis-monthly-minimum-storage-charge-work) and [minimum storage duration policy](https://docs.wasabi.com/docs/how-does-wasabis-minimum-storage-duration-policy-work) apply, and the provider bills the customer directly.

## Scoped policy example

Replace `YOUR_BUCKET` below. If you change the backup folder in Forma, change both `forma-studio/backups` paths in this policy. Forma needs bucket listing/HeadBucket plus read and write access to its backup objects; no public-read, bucket-creation, delete, account-administration or list-all-buckets permission is required.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::YOUR_BUCKET"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::YOUR_BUCKET/forma-studio/backups/*"
    }
  ]
}
```

Validation covers the actual S3 SDK request/response protocol against an isolated local S3 server, compressed upload/download integrity, duplicate suppression, encrypted restart recovery, failed uploads, denied keys and endpoint restrictions. A real Wasabi account roundtrip requires the customer's configured account; the local tests do not claim to have performed that external transaction.
