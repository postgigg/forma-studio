import { proposalToDesign, type Proposal } from './ai';

declare global {
  interface Window {
    __formaRenderProposal?: (proposal: Proposal) => Promise<{ images: string[]; layouts: unknown[] }>;
  }
}

// An isolated, empty page for the local worker. It never opens the workspace DB.
window.__formaRenderProposal = async (proposal: Proposal) => {
  const design = await proposalToDesign(proposal);
  return { images: design.pages.map(page => page.thumbnail), layouts: design.pages.map(page => page.data.objects) };
};
