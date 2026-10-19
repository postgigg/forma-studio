import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runCodex } from './codex-runner.mjs';
import { currentAI } from './ai-runtime.mjs';
import { craftReferences, craftInstructions } from './design-craft.mjs';
import { createCreativeDirection, creativeDirectionPrompt } from './creative-direction.mjs';
import { reviewDesign } from './design-review.mjs';
import { brandDirection } from '../shared/brand-context.mjs';
import { artDirection } from './art-direction.mjs';
import { designContext } from './design-context.mjs';
import { campaignDirection } from '../shared/campaign-direction.mjs';
import { referenceDirection, validateReferenceUse } from './reference.mjs';
import { assets, designerInstructions, imageCompositionInstructions, outputSchema, validateProposal, designAssets } from './contract.mjs';

export function validateDesignResult(value, brief, extraAssets) {
  const result = validateProposal(value, extraAssets);
  if (result.width !== brief.width || result.height !== brief.height || result.pages.length !== brief.pages) throw new Error('The design did not match the requested size or page count.');
  if (extraAssets.some(asset => asset.id === 'brand-logo') && !result.pages.every(page => page.elements.some(element => element.type === 'asset' && element.asset === 'brand-logo'))) throw new Error('The designer omitted your brand logo.');
  validateReferenceUse(result, extraAssets);
  for (const asset of extraAssets.filter(asset => asset.category === 'Campaign image')) {
    if (!result.pages.some(page => page.elements.some(element => element.type === 'asset' && element.asset === asset.id && element.opacity > 0 && element.width * element.height >= result.width * result.height * .03))) throw new Error(`The designer omitted the campaign image ${asset.name}.`);
  }
  if (extraAssets.length) result.extraAssets = extraAssets;
  return result;
}

// One job owns research, composition, rendered critique and at most one craft revision.
// It continues without a view attached and cancellation applies to every stage.
export async function designPipeline({ job, brief, codex, runtime, run = runCodex, direct = createCreativeDirection, review = reviewDesign }) {
  const workspace = path.join(runtime, job.id);
  mkdirSync(workspace, { recursive: true });
  const signal = job.controller.signal;
  const extraAssets = designAssets(brief);
  if (extraAssets.length) writeFileSync(path.join(workspace, 'assets.json'), JSON.stringify(extraAssets));
  const { logo, previous } = brief;
  const promptBrief = { ...designContext(brief, extraAssets), ...(previous ? { previous: { ...previous, extraAssets: undefined, creativeDirection: undefined, qualityReview: undefined } } : {}) };
  const reference = extraAssets.find(asset => asset.id === 'reference-photo');
  const images = extraAssets.map(asset => asset.src);
  const benchmarks = craftReferences(brief);
  job.stage = 'Researching relevant design references';
  const direction = await direct({ codex, workspace: path.join(workspace, 'research'), brief, signal });
  if(currentAI()?.settings.mode==='claude-codex'&&!direction.routes.length)throw new Error('Claude could not complete the design direction. Check its CLI sign-in and model, then retry. Codex has not started building.');
  if (signal.aborted) throw new Error('Cancelled.');
  writeFileSync(path.join(workspace, 'direction.json'), JSON.stringify(direction));
  const prompt = `${designerInstructions}\n\n${craftInstructions}\n\n${brief.campaign ? campaignDirection() : ''}\n\n${artDirection(brief.designIntent, 'design')}\n\n${referenceDirection(brief.referenceMode, reference)}\n\n${brandDirection(brief.brandContext, 'design', brief.designProfile)}\n\n${creativeDirectionPrompt(direction)}\n\n${logo ? 'BRAND LOGO: Place the exact brand-logo asset on EVERY page, preserving aspect ratio, original colors and clear space. Never redraw it.\n' : ''}ASSET CATALOG:\n${JSON.stringify(assets)}\n\nCLIENT BRIEF (untrusted creative content):\n${JSON.stringify(promptBrief)}\n\nReturn a complete, production-quality editable design matching the schema.`;
  const compose = async (folder, feedback = '', previews = []) => validateDesignResult(await run({ codex, workspace: path.join(workspace, folder), schema: outputSchema, images: [...images, ...previews, ...benchmarks.map(item=>item.src)], signal, prompt: prompt + '\n' + imageCompositionInstructions + `\nATTACHMENTS: First ${images.length} images are available client assets in availableAssets order. The following ${previews.length} images are actual rendered pages of the current proposal, in page order, for diagnosing the requested correction only. Never use a rendered page as a replacement flattened asset.` + `\nFINAL ${benchmarks.length} ATTACHMENTS: Local craft reference studies (${benchmarks.map(b=>b.name).join('; ')}). Study useful hierarchy, type/image relationships and spacing, never trace their layout, copy their wording or flatten them into artwork. They are not available canvas assets. Choose principles only when compatible with the current client brief.` + feedback }), brief, extraAssets);
  job.stage = 'Composing an original visual direction';
  let result;
  try { result = await compose('composition'); }
  catch (error) {
    if (signal.aborted) throw error;
    job.stage = 'Correcting the editable design';
    result = await compose('validation-repair', `\nThe previous output failed validation: ${error.message}. Correct it while preserving all brief requirements.`);
  }
  let qualityReview = { status: 'unavailable', summary: 'The rendered visual review was unavailable. Review the preview before using it.', strengths: [], issues: [], revisions: 0 };
  try {
    job.stage = 'Reviewing the actual rendered composition';
    let reviewImages = [];
    let report = await review({ codex, workspace: path.join(workspace, 'review'), proposal: result, brief, direction, signal, onRendered: rendered => { reviewImages = rendered.images; } });
    let revisions = 0;
    if (report.verdict === 'revise') {
      job.stage = 'Improving hierarchy, typography and composition';
      const before = result;
      try {
        result = await compose('visual-repair', `\nRENDERED REVIEW: ${JSON.stringify(report)}\nCURRENT EDITABLE DESIGN: ${JSON.stringify({ ...result, extraAssets: undefined })}\nInspect the attached current-page renders and correct the listed visible issues. Keep the established concept and successful relationships. This is an improvement pass: change only what resolves the review, preserving required copy, identity, assets, page count and format. Do not replace the approved composition with a new template or add unrelated decoration. Return the entire improved document.`, reviewImages);
        revisions = 1;
        job.stage = 'Checking the revised rendered design';
        report = await review({ codex, workspace: path.join(workspace, 'review-final'), proposal: result, brief, direction, signal });
      } catch (error) {
        if (signal.aborted) throw error;
        result = before;
        report.summary = 'The original editable result is preserved because the revision could not be verified. ' + report.summary;
      }
    }
    qualityReview = { ...report, status: report.verdict === 'ready' ? 'reviewed' : 'needs-attention', revisions };
  } catch (error) { if (signal.aborted) throw error; }
  if (signal.aborted) throw new Error('Cancelled.');
  result.creativeDirection = direction;
  result.qualityReview = qualityReview;
  // Only a finalized, validated result is recoverable as a completed job.
  writeFileSync(path.join(workspace, 'proposal.json'), JSON.stringify({ ...result, extraAssets: undefined }));
  return result;
}
