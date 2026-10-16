import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import path from 'node:path';
import { dribbbleShot, researchEvidence, validateDirection, createCreativeDirection, creativeDirectionPrompt } from '../server/creative-direction.mjs';
import { validateReview, reviewDesign } from '../server/design-review.mjs';
import { designPipeline } from '../server/designer-pipeline.mjs';
import { validateProposal } from '../server/contract.mjs';

const url = 'https://dribbble.com/shots/27416611-Phren-Craft-Celtic-Modular-Identity-System';
const source = { url, title: 'Phren Craft', creator: 'Ivana Mundja', basis: 'description', observation: 'Material-driven palette connects to craft.', transferablePrinciple: 'Derive visual devices from what the business makes.', doNotCopy: 'Do not copy the dragon, identity or layout.' };
const routes = ['Specimen', 'Market rhythm', 'Daily stem'].map(name => ({ name, concept: name + ' original metaphor', brandConnection: 'Local growing and everyday flowers', composition: 'Asymmetric subject-led grid', typography: 'Expressive serif and restrained sans', colorLogic: 'Use the supplied brand colors', originalTwist: name + ' subject-specific device' }));
const direction = { sources: [], routes, selectedRoute: 0, selectionReason: 'The specimen concept fits locally grown flowers.', researchStatus: 'unavailable', researchedAt: new Date().toISOString() };
const fixture = JSON.parse(readFileSync(new URL('./designer.fixture.json', import.meta.url)));

test('legacy image layouts remain valid and new crop positions must be finite and normalized', () => {
  assert.doesNotThrow(() => validateProposal(structuredClone(fixture)));
  for (const patch of [{ imageFit: 'stretch' }, { imagePositionX: 1.1 }, { imagePositionY: NaN }]) {
    const invalid = structuredClone(fixture); Object.assign(invalid.pages[0].elements[0], patch);
    assert.throws(() => validateProposal(invalid), /image fit|crop position/);
  }
});

test('reference evidence rejects search snippets, spoofed hosts and unobserved links', () => {
  for (const bad of ['http://dribbble.com/shots/123-hello', 'https://dribbble.com.evil.example/shots/123-hello', 'https://user@dribbble.com/shots/123-hello', 'https://dribbble.com/search/branding', 'javascript:alert(1)']) assert.equal(dribbbleShot(bad), null);
  const events = [{ type: 'item.completed', item: { type: 'web_search', action: { type: 'search' }, results: [{ url }] } }];
  assert.equal(researchEvidence(events).opened.size, 0);
  events.push({ type: 'item.completed', item: { type: 'web_search', action: { type: 'open_page', url }, results: [{ type: 'text_result', url }] } });
  const validated = validateDirection({ ...direction, sources: [source, { ...source, url: 'https://dribbble.com/shots/123-unopened' }] }, researchEvidence(events));
  assert.equal(validated.sources.length, 1);
  assert.equal(validated.sources[0].url, url);
  assert.equal(validated.researchStatus, 'unavailable');
  assert.equal(validated.sources[0].basis, 'description');
});

test('research failures fall back honestly, while cancellation propagates', async () => {
  const result = await createCreativeDirection({ codex: 'mock', workspace: mkdtempSync(path.resolve('.local/research-fallback-')), brief: {}, visualReferences: async () => [], run: async () => { throw new Error('Search offline'); } });
  assert.equal(result.researchStatus, 'unavailable');
  assert.match(creativeDirectionPrompt(result), /Do not claim you researched/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createCreativeDirection({ codex: 'mock', workspace: mkdtempSync(path.resolve('.local/research-cancel-')), brief: {}, visualReferences: async () => [], signal: controller.signal, run: async () => { throw new Error('Cancelled.'); } }), /Cancelled/);
});

test('reviews reject invalid pages and do not hide concrete issues behind a ready verdict', () => {
  const issue = { page: 1, element: 'Headline', problem: 'Headline is clipped', fix: 'Increase the text box height', priority: 'critical' };
  assert.equal(validateReview({ verdict: 'ready', summary: 'Needs a correction', strengths: ['Clear hierarchy'], issues: [issue] }, 1).verdict, 'revise');
  assert.throws(() => validateReview({ verdict: 'revise', summary: 'Wrong page', strengths: [], issues: [{ ...issue, page: 2 }] }, 1), /invalid page/);
});

test('visual review attaches previews but excludes embedded bitmap payloads from text metrics', async () => {
  const marker = 'data:image/png;base64,' + 'A'.repeat(100000);
  await reviewDesign({ codex: 'mock', workspace: '.', proposal: fixture, brief: { prompt: 'A florist launch' }, direction,
    render: async () => ({ images: [marker], layouts: [[{ type: 'image', left: 10, width: 500, src: marker }, { type: 'textbox', text: 'Flowers', fontSize: 80 }]] }),
    run: async options => { assert.equal(options.images[0], marker); assert.equal(options.prompt.includes(marker), false); assert.ok(options.prompt.length < 50000); return { verdict: 'ready', summary: 'Clear composition', strengths: ['Readable type'], issues: [] }; },
  });
});

test('direction and critique retain the same audience, palette, intent and saved preferences including approved assets', async () => {
  const workspace = mkdtempSync(path.resolve('.local/commission-proof-'));
  const approvedAsset = { id: 'campaign-image-1', name: 'Approved seasonal bouquet', width: 1080, height: 1350, category: 'Campaign image', src: 'data:image/png;base64,ASSET_BYTES' };
  const brief = {
    prompt: 'Parent campaign: local gifting. Folder intent: introduce the spring collection.', width: fixture.width, height: fixture.height, pages: 1,
    audience: 'Local first-time gift buyers', style: 'Warm editorial photography', brand: 'Neighborhood Petal', palette: ['#137654', '#edab79'], campaign: true,
    brandContext: { business: 'Seasonal florist', mission: 'Connect neighbors with thoughtful gifts' },
    designProfile: { enabled: true, styles: ['editorial'], density: 'airy', typography: 'mixed', colorMood: 'warm', details: 'Careful optical balance', avoid: 'Clutter', preferences: ['confident-type'], avoidances: ['filler-labels'] },
    designIntent: { outcome: 'Encourage a thoughtful first order', message: 'Seasonal flowers for a personal gift', preserve: 'Approved crop and exact headline', avoid: 'Discount badges' },
    previous: { ...fixture, extraAssets: [approvedAsset], creativeDirection: direction },
  };
  const checkContext = prompt => {
    for (const value of [brief.audience, brief.style, brief.brand, ...brief.palette, ...Object.values(brief.designIntent), brief.brandContext.mission, brief.designProfile.details, 'confident-type', 'filler-labels', approvedAsset.name])
      assert.ok(prompt.includes(value), `Missing commission field: ${value}`);
    assert.equal(prompt.includes(approvedAsset.src), false);
  };
  let calls = 0;
  const directed = await createCreativeDirection({ codex: 'mock', workspace, brief, visualReferences: async () => [], run: async options => {
    calls++;
    checkContext(options.prompt);
    if (calls === 1) return { sources: [] };
    assert.ok(options.images.includes(approvedAsset.src));
    assert.equal(options.prompt.includes('sourceImageAvailable'), false);
    assert.ok(options.prompt.includes('"availableFonts":["'));
    return { ...direction, visualStudies: {} };
  } });
  assert.equal(calls, 2);
  assert.equal(directed.routes.length, 3);
  const full = 'data:image/png;base64,FULL_RENDER', thumbnail = 'data:image/png;base64,SMALL_RENDER';
  let repairImages;
  await reviewDesign({ codex: 'mock', workspace, brief, proposal: fixture, direction: directed,
    render: async () => ({ images: [full], thumbnails: [thumbnail], layouts: [[]] }),
    onRendered: rendered => { repairImages = rendered.images; },
    run: async options => {
      checkContext(options.prompt);
      assert.deepEqual(options.images, [full, thumbnail]);
      assert.equal(options.prompt.includes(thumbnail), false);
      return { verdict: 'ready', summary: 'The message and hierarchy match the commission', strengths: ['Legible main message'], issues: [] };
    },
  });
  assert.deepEqual(repairImages, [full]);
});

test('pipeline reviews rendered output, repairs once and preserves exact dimensions', async () => {
  const runtime = mkdtempSync(path.resolve('.local/creative-pipeline-'));
  const job = { id: 'proof', controller: new AbortController() };
  let compositions = 0, reviews = 0;
  const result = await designPipeline({ job, codex: 'mock', runtime, brief: { prompt: 'A botanical launch', width: fixture.width, height: fixture.height, pages: fixture.pages.length }, direct: async () => direction,
    run: async options => { compositions++; assert.equal(options.webSearch, undefined); assert.deepEqual(options.images, compositions === 1 ? [] : ['data:image/png;base64,CURRENT_PAGE']); return structuredClone(fixture); },
    review: async options => { reviews++; options.onRendered?.({ images: ['data:image/png;base64,CURRENT_PAGE'] }); assert.equal(options.proposal.width, fixture.width); return { verdict: reviews === 1 ? 'revise' : 'ready', summary: reviews === 1 ? 'Improve type spacing' : 'Spacing corrected', strengths: ['A clear subject'], issues: reviews === 1 ? [{ page: 1, element: 'Headline', problem: 'Tight spacing', fix: 'Increase separation', priority: 'craft' }] : [] }; },
  });
  assert.equal(compositions, 2); assert.equal(reviews, 2);
  assert.equal(result.qualityReview.status, 'reviewed'); assert.equal(result.qualityReview.revisions, 1);
  assert.equal(JSON.parse(readFileSync(path.join(runtime, 'proof/proposal.json'))).qualityReview.status, 'reviewed');
});

test('unavailable rendered review keeps a validated editable result with a visible limitation', async () => {
  const result = await designPipeline({ job: { id: 'proof', controller: new AbortController() }, codex: 'mock', runtime: mkdtempSync(path.resolve('.local/creative-fallback-')), brief: { prompt: 'A botanical launch', width: fixture.width, height: fixture.height, pages: fixture.pages.length }, direct: async () => direction, run: async () => structuredClone(fixture), review: async () => { throw new Error('Browser unavailable'); } });
  assert.equal(result.qualityReview.status, 'unavailable'); assert.equal(result.width, fixture.width);
});
