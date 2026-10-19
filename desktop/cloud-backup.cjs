const { readFile, writeFile, rename, unlink, mkdir } = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { gzip, gunzip } = require('node:zlib');
const { promisify } = require('node:util');
const { S3Client, HeadBucketCommand, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const zip = promisify(gzip), unzip = promisify(gunzip);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const limit = 256 * 1024 * 1024;

function validateConnection(value) {
  if (!value || typeof value !== 'object') throw new Error('Enter your Wasabi connection details.');
  const region = String(value.region || '').trim();
  if (!/^[a-z]{2}-[a-z]+-\d$/.test(region)) throw new Error('Enter the storage region shown for your bucket.');
  const endpoint = new URL(value.endpoint || `https://s3.${region}.wasabisys.com`);
  if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/' ||
      ![`s3.${region}.wasabisys.com`, ...(region === 'us-east-1' ? ['s3.wasabisys.com'] : [])].includes(endpoint.hostname)) throw new Error('Use the official HTTPS Wasabi endpoint for this region.');
  const bucket = String(value.bucket || '').trim();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('..') || /^(?:\d+\.){3}\d+$/.test(bucket)) throw new Error('Enter a valid Wasabi bucket name.');
  const prefix = String(value.prefix || 'forma-studio').trim().replace(/^\/+|\/+$/g, '');
  if (!/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(prefix) || prefix.length > 100) throw new Error('Use letters, numbers, dashes or folders for the backup folder.');
  const accessKeyId = String(value.accessKeyId || '').trim(), secretAccessKey = String(value.secretAccessKey || '').trim();
  if (!/^[A-Za-z0-9]{16,128}$/.test(accessKeyId) || !/^[A-Za-z0-9/+_=.-]{20,200}$/.test(secretAccessKey)) throw new Error('Enter a valid access key and secret key.');
  return { region, endpoint: endpoint.origin, bucket, prefix, accessKeyId, secretAccessKey, automatic: value.automatic === true };
}

function createCloudBackup({ profile, safeStorage, clientFactory = config => new S3Client(config), now = () => new Date() }) {
  const file = path.join(profile, 'wasabi-connection.bin');
  let config, loaded = false, busy = false, lastError = '';
  const protection = () => {
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('Unlock your operating system keychain before connecting cloud storage.');
  };
  async function load() {
    if (loaded) return;
    protection();
    try {
      const bytes = await readFile(file);
      config = JSON.parse(safeStorage.decryptString(bytes));
      validateConnection(config);
      if (!/^[a-f0-9-]{36}$/.test(config.deviceId)) throw new Error('Invalid backup device.');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('The saved Wasabi connection could not be unlocked. Reconnect using your keys.');
    }
    loaded = true;
  }
  async function persist(next) {
    protection(); await mkdir(profile, { recursive: true });
    const temporary = file + '.' + randomUUID() + '.tmp';
    try { await writeFile(temporary, safeStorage.encryptString(JSON.stringify(next)), { mode: 0o600 }); await rename(temporary, file); }
    finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
    config = next;
  }
  const publicState = () => ({ connected: !!config, busy, bucket: config?.bucket || '', region: config?.region || '', endpoint: config?.endpoint || '', prefix: config?.prefix || 'forma-studio', automatic: config?.automatic || false, lastBackupAt: config?.lastBackupAt || null, lastError });
  const client = () => {
    if (!config) throw new Error('Connect your Wasabi account first.');
    return clientFactory({ region: config.region, endpoint: config.endpoint, forcePathStyle: true, followRegionRedirects: false,
      requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED', maxAttempts: 3,
      requestHandler: { connectionTimeout: 15000, requestTimeout: 180000 },
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } });
  };
  async function run(operation) {
    await load(); if (busy) throw new Error('Another cloud backup operation is still running.'); busy = true; lastError = '';
    try { return await operation(); }
    catch (error) {
      // Never pass provider XML, request URLs, authorization headers or keys to the renderer/log.
      const code = error?.name;
      lastError = ['AccessDenied', 'Forbidden', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'].includes(code) ? 'Wasabi denied access. Check your keys, bucket policy and region.' : code === 'NoSuchBucket' ? 'This Wasabi bucket does not exist in the selected region.' : ['TimeoutError', 'AbortError', 'NetworkingError'].includes(code) ? 'Wasabi could not be reached. Your local work is safe; try again when online.' : error.formaSafe ? error.message : 'The cloud operation did not complete. Check your connection, keys and bucket permissions.';
      throw new Error(lastError);
    } finally { busy = false; }
  }
  function safeError(message) { const error = new Error(message); error.formaSafe = true; return error; }
  const snapshotPrefix = () => config.prefix + '/backups/';
  function checkedKey(key) {
    if (typeof key !== 'string' || !key.startsWith(snapshotPrefix()) || !/^[A-Za-z0-9_/-]+\.forma-backup\.json\.gz$/.test(key) || key.includes('..') || key.length > 300) throw safeError('Choose a backup from this connection.');
    return key;
  }
  return {
    async status() { await load(); return publicState(); },
    connect: value => run(async () => {
      const next = validateConnection(value), previous = config;
      config = next; const s3 = client();
      try { await s3.send(new HeadBucketCommand({ Bucket: next.bucket })); }
      finally { config = previous; s3.destroy?.(); }
      await persist({ ...next, deviceId: previous?.deviceId || randomUUID(), lastBackupAt: null, lastHash: null });
      return publicState();
    }),
    async automatic(enabled) { return run(async () => { if (!config) throw safeError('Connect Wasabi first.'); await persist({ ...config, automatic: enabled === true }); return publicState(); }); },
    async disconnect() { return run(async () => { await unlink(file).catch(error => { if (error.code !== 'ENOENT') throw error; }); config = undefined; return publicState(); }); },
    backup: raw => run(async () => {
      if (typeof raw !== 'string' || Buffer.byteLength(raw) > limit) throw safeError('A workspace backup can hold up to 256 MB of saved data.');
      const { validateWorkspaceBackup, backupSummary } = await import('../shared/workspace-backup.mjs');
      let snapshot;
      try { snapshot = validateWorkspaceBackup(JSON.parse(raw)); } catch { throw safeError('This workspace could not be read as a valid backup.'); }
      const hash = digest(JSON.stringify(snapshot.stores));
      if (!config) throw safeError('Connect Wasabi first.');
      if (config.lastHash === hash) return { ...publicState(), unchanged: true };
      const body = await zip(Buffer.from(raw), { level: 6 });
      const date = now().toISOString(), key = `${snapshotPrefix()}${config.deviceId}/${date.replace(/[^0-9TZ]/g, '')}-${randomUUID()}.forma-backup.json.gz`;
      const s3 = client();
      try {
        await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentLength: body.length,
          ContentType: 'application/gzip', ContentMD5: createHash('md5').update(body).digest('base64'), ServerSideEncryption: 'AES256', Metadata: { 'forma-sha256': digest(body), 'forma-format': 'workspace-v1' } }));
      } finally { s3.destroy?.(); }
      await persist({ ...config, lastHash: hash, lastBackupAt: date });
      return { ...publicState(), bytes: body.length, summary: backupSummary(snapshot), unchanged: false };
    }),
    list: () => run(async () => {
      const s3 = client(); const objects = []; let token;
      try {
        // Bounded pagination; an older history remains in the customer's own console.
        for (let page = 0; page < 20; page++) {
          const result = await s3.send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: snapshotPrefix(), ContinuationToken: token, MaxKeys: 1000 }));
          for (const item of result.Contents || []) {
            try { checkedKey(item.Key); objects.push({ key: item.Key, bytes: item.Size || 0, createdAt: item.LastModified?.toISOString() || '' }); } catch { /* Ignore non-Forma objects. */ }
          }
          if (!result.IsTruncated || !result.NextContinuationToken) break;
          token = result.NextContinuationToken;
        }
      } finally { s3.destroy?.(); }
      return objects.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
    }),
    restore: key => run(async () => {
      if (!config) throw safeError('Connect Wasabi first.');
      checkedKey(key); const s3 = client();
      try {
        const result = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        if (result.ContentLength > limit || !result.Body) { result.Body?.destroy?.(); throw safeError('This backup is larger than the supported workspace size.'); }
        const chunks = []; let length = 0;
        for await (const part of result.Body) { length += part.length; if (length > limit) { result.Body.destroy?.(); throw safeError('This backup is too large.'); } chunks.push(Buffer.from(part)); }
        const bytes = Buffer.concat(chunks);
        if (!/^[a-f0-9]{64}$/.test(result.Metadata?.['forma-sha256'] || '') || digest(bytes) !== result.Metadata['forma-sha256']) throw safeError('This backup failed its integrity check. Your current work has not changed.');
        const raw = (await unzip(bytes, { maxOutputLength: limit })).toString('utf8');
        const { validateWorkspaceBackup, backupSummary } = await import('../shared/workspace-backup.mjs');
        let snapshot;
        try { snapshot = validateWorkspaceBackup(JSON.parse(raw)); } catch { throw safeError('This is not a valid Forma workspace backup.'); }
        return { raw, summary: backupSummary(snapshot) };
      } finally { s3.destroy?.(); }
    }),
  };
}
module.exports = { createCloudBackup, validateConnection };
