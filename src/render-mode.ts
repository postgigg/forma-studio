import { proposalToDesign, type Proposal } from './ai';

declare global {
  interface Window {
    __formaRenderProposal?: (proposal: Proposal) => Promise<{ images: string[]; thumbnails: string[]; layouts: unknown[] }>;
  }
}

// An isolated, empty page for the local worker. It never opens the workspace DB.
window.__formaRenderProposal = async (proposal: Proposal) => {
  const design = await proposalToDesign(proposal);
  const images = design.pages.map(page => page.thumbnail);
  const thumbnails = await Promise.all(images.map(async src => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 320 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The thumbnail preview could not be rendered.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  }));
  return { images, thumbnails, layouts: design.pages.map(page => page.data.objects) };
};
