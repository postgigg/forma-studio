// Keep the same commission visible to direction, composition and critique.
// Only creative metadata belongs here; image bytes travel as attachments.
export function designContext(brief, availableAssets = []) {
  const context = Object.fromEntries([
    'prompt', 'width', 'height', 'pages', 'audience', 'style', 'brand',
    'palette', 'campaign', 'brandContext', 'designProfile', 'designIntent',
    'referenceMode',
  ].filter(key => brief[key] !== undefined).map(key => [key, brief[key]]));
  context.availableAssets = availableAssets.map(({ id, name, width, height, category }) => ({ id, name, width, height, category }));
  if (brief.previous) {
    context.revision = {
      instruction: 'Improve the approved proposal for the current request. Keep its established concept, structure, copy and assets unless that request explicitly changes them.',
      title: brief.previous.title,
      previousDirection: brief.previous.creativeDirection?.routes?.[brief.previous.creativeDirection.selectedRoute],
    };
  }
  return context;
}
