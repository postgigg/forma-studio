import { Ellipse, FabricImage, Path, Rect, Shadow, filters, util } from 'fabric';

const sources = new Map<string, ReturnType<typeof util.loadImage>>();
export async function templatePhoto(layer: Record<string, any>) {
  let source = sources.get(layer.src);
  if (!source) {
    source = util.loadImage(layer.src);
    sources.set(layer.src, source);
    source.catch(() => sources.delete(layer.src));
  }
  const image = new FabricImage(await source);
  const fit = layer.fit === 'contain'
    ? Math.min(layer.width / image.width, layer.height / image.height)
    : Math.max(layer.width / image.width, layer.height / image.height);
  const width = Math.min(image.width, layer.width / fit);
  const height = Math.min(image.height, layer.height / fit);
  const positionX = Math.max(0, Math.min(1, layer.positionX ?? .5));
  const positionY = Math.max(0, Math.min(1, layer.positionY ?? .5));
  image.set({ left: layer.left, top: layer.top, width, height,
    cropX: (image.width - width) * positionX, cropY: (image.height - height) * positionY,
    scaleX: fit, scaleY: fit, angle: layer.angle || 0, opacity: layer.opacity ?? 1,
    strokeWidth: layer.strokeWidth || 0, stroke: layer.stroke || null,
    ...(layer.shadow ? {shadow: new Shadow(layer.shadow)} : {}),
  });
  if (layer.mask === 'ellipse') image.clipPath = new Ellipse({ rx: width / 2, ry: height / 2, originX: 'center', originY: 'center' });
  else if (layer.mask === 'arch') {
    const radius = Math.min(width / 2, height / 2);
    image.clipPath = new Path(`M0 ${height} V${radius} Q0 0 ${radius} 0 H${width-radius} Q${width} 0 ${width} ${radius} V${height} Z`, { left: 0, top: 0, originX: 'center', originY: 'center' });
  } else if (layer.radius) image.clipPath = new Rect({ width, height, rx: layer.radius / fit, ry: layer.radius / fit, originX: 'center', originY: 'center' });
  if (layer.monochrome) image.filters.push(new filters.Grayscale());
  if (layer.tint) image.filters.push(new filters.BlendColor({ color: layer.tint, mode: 'tint', alpha: layer.tintOpacity ?? .3 }));
  if (image.filters.length) image.applyFilters();
  return image;
}
