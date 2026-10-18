import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderProposal as renderReview } from '../server/design-review.mjs';
import desktopRender from '../desktop/render.cjs';

const proposal = JSON.parse(readFileSync(new URL('./designer.fixture.json', import.meta.url)));
const previews = { images: ['data:image/png;base64,cHJldmlldw=='], thumbnails: [], layouts: [[]] };

test('packaged visual review uses the authenticated desktop browser without launching Playwright', async t => {
  const oldEndpoint = process.env.FORMA_RENDER_ENDPOINT, oldToken = process.env.FORMA_RENDER_TOKEN;
  process.env.FORMA_RENDER_ENDPOINT = 'http://127.0.0.1:51862/desktop/render';
  process.env.FORMA_RENDER_TOKEN = 'private-test-token';
  t.after(() => {
    if (oldEndpoint === undefined) delete process.env.FORMA_RENDER_ENDPOINT; else process.env.FORMA_RENDER_ENDPOINT = oldEndpoint;
    if (oldToken === undefined) delete process.env.FORMA_RENDER_TOKEN; else process.env.FORMA_RENDER_TOKEN = oldToken;
  });
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, process.env.FORMA_RENDER_ENDPOINT);
    assert.equal(options.headers['X-Forma-Render'], 'private-test-token');
    assert.equal(options.method, 'POST');
    assert.equal(options.signal, controller.signal);
    assert.deepEqual(JSON.parse(options.body), proposal);
    return Response.json(previews);
  });
  assert.deepEqual(await renderReview(proposal, { signal: controller.signal }), previews);
  globalThis.fetch = async () => Response.json({ error: 'Invalid design' }, { status: 400 });
  await assert.rejects(renderReview(proposal), /Invalid design/);
});

function browserFixture({ fail = false } = {}) {
  const record = {};
  const partition = {
    setPermissionRequestHandler(fn) { record.permission = fn; },
    setPermissionCheckHandler(fn) { record.checkPermission = fn; },
    on() {}, webRequest: { onBeforeRequest(fn) { record.request = fn; } },
    async clearStorageData() { record.cleared = true; },
  };
  return {
    record,
    session: { fromPartition(name) { assert.match(name, /^forma-review-/); return partition; } },
    BrowserWindow: class {
      constructor(options) {
        record.options = options;
        this.webContents = {
          setWindowOpenHandler(fn) { record.popup = fn; }, on() {},
          async executeJavaScript(script) { assert.match(script, /__formaRenderProposal/); if (fail) throw new Error('Render failed'); return previews; },
        };
      }
      async loadURL(url) { record.url = url; }
      isDestroyed() { return !!record.destroyed; }
      destroy() { record.destroyed = true; }
    },
  };
}

test('desktop review isolates the preview, blocks external requests and cleans up after success or failure', async () => {
  for (const fail of [false, true]) {
    const fixture = browserFixture({ fail });
    const promise = desktopRender.renderProposal({ ...fixture, origin: 'http://127.0.0.1:51862', proposal });
    if (fail) await assert.rejects(promise, /Render failed/); else assert.deepEqual(await promise, previews);
    const { record } = fixture;
    assert.equal(record.options.show, false);
    assert.equal(record.options.webPreferences.sandbox, true);
    assert.equal(record.options.webPreferences.contextIsolation, true);
    assert.equal(record.options.webPreferences.nodeIntegration, false);
    assert.equal(record.options.webPreferences.preload, undefined);
    assert.equal(record.url, 'http://127.0.0.1:51862/?forma-render=1');
    assert.equal(record.checkPermission(), false);
    record.permission(null, 'camera', allowed => assert.equal(allowed, false));
    assert.deepEqual(record.popup(), { action: 'deny' });
    for (const [url, cancel] of [['http://127.0.0.1:51862/fonts/test.ttf', false], ['https://example.com', true], ['file:///etc/passwd', true], ['http://127.0.0.1:51863/session', true]]) {
      record.request({ url }, result => assert.equal(result.cancel, cancel));
    }
    assert.equal(record.destroyed, true); assert.equal(record.cleared, true);
  }
});

test('invalid and cancelled proposals never create a desktop preview', async () => {
  const fixture = browserFixture();
  await assert.rejects(desktopRender.renderProposal({ ...fixture, origin: 'http://127.0.0.1:51862', proposal: {} }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(desktopRender.renderProposal({ ...fixture, origin: 'http://127.0.0.1:51862', proposal, signal: controller.signal }), /Cancelled/);
  assert.equal(fixture.record.options, undefined);
});
