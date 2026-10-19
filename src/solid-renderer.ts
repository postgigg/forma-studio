import * as THREE from "three";
import { Font, FontLoader } from "three/addons/loaders/FontLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import type { SolidSettings } from "./solid-object";

const fonts = new Map<string, Promise<Font>>(),
  geometries = new Map<string, THREE.BufferGeometry>();
const readyFonts = new Map<string, Font>();
export async function prepareSolid(s: SolidSettings) {
  if (s.shape !== "text") return;
  if (!fonts.has(s.font))
    fonts.set(
      s.font,
      new FontLoader()
        .loadAsync(`/fonts/forma${s.font}.json`)
        .then((font) => {
          readyFonts.set(s.font, font);
          return font;
        })
        .catch((e) => {
          fonts.delete(s.font);
          throw e;
        }),
    );
  await fonts.get(s.font);
}
function cleanContour(input: THREE.Vector2[]) {
  const points = input.filter(
    (p, i) => !i || p.distanceTo(input[i - 1]) > 0.0001,
  );
  if (points[0]?.distanceTo(points.at(-1)!) < 0.0001) points.pop();
  if (points.length < 4) return points;
  // The original font outlines include repeated one-unit stair steps. Those
  // near-zero edges create huge bevel miters. Remove only sub-pixel noise in
  // the 120-unit letter, preserving its counters and intentional corners.
  const reduce = (p: THREE.Vector2[]): THREE.Vector2[] => {
    if (p.length < 3) return p;
    const first = p[0],
      last = p.at(-1)!,
      delta = last.clone().sub(first),
      length = delta.lengthSq();
    let max = 0.35 * 0.35,
      index = 0;
    for (let i = 1; i < p.length - 1; i++) {
      const t = length
          ? THREE.MathUtils.clamp(
              p[i].clone().sub(first).dot(delta) / length,
              0,
              1,
            )
          : 0,
        distance = p[i].distanceToSquared(
          first.clone().addScaledVector(delta, t),
        );
      if (distance > max) {
        max = distance;
        index = i;
      }
    }
    return index
      ? [
          ...reduce(p.slice(0, index + 1)).slice(0, -1),
          ...reduce(p.slice(index)),
        ]
      : [first, last];
  };
  let split = 1;
  for (let i = 2; i < points.length; i++)
    if (
      points[i].distanceToSquared(points[0]) >
      points[split].distanceToSquared(points[0])
    )
      split = i;
  return [
    ...reduce(points.slice(0, split + 1)).slice(0, -1),
    ...reduce([...points.slice(split), points[0]]).slice(0, -1),
  ];
}
function textShapes(s: SolidSettings) {
  return readyFonts
    .get(s.font)!
    .generateShapes(s.text, 120)
    .map((source) => {
      const contour = source.extractPoints(48),
        shape = new THREE.Shape(cleanContour(contour.shape));
      shape.closePath();
      shape.holes = contour.holes.map((points) => {
        const path = new THREE.Path(cleanContour(points));
        path.closePath();
        return path;
      });
      return shape;
    });
}
function geometry(s: SolidSettings) {
  const key = JSON.stringify([s.shape, s.text, s.font, s.depth, s.bevel]);
  if (geometries.has(key)) return geometries.get(key)!;
  let g: THREE.BufferGeometry;
  // Respect the narrowest strokes in each bundled face so a large bevel cannot
  // overlap itself at a counter or junction. Saved slider values stay intact.
  const bevel =
    s.shape === "text"
      ? s.bevel * { frame: 0.375, soft: 0.5, deco: 0.25 }[s.font]
      : s.bevel;
  const extrude = {
    depth: s.depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 12,
    curveSegments: 48,
    steps: 1,
  };
  switch (s.shape) {
    case "text":
      g = new THREE.ExtrudeGeometry(textShapes(s), extrude);
      break;
    case "sphere":
      g = new THREE.SphereGeometry(120, 40, 28);
      break;
    case "cube":
      g = new RoundedBoxGeometry(180, 180, 180, 5, 16);
      break;
    case "ring":
      g = new THREE.TorusGeometry(100, 30, 20, 72);
      break;
    case "capsule":
      g = new THREE.CapsuleGeometry(60, 120, 10, 32);
      break;
    case "crystal":
      g = new THREE.OctahedronGeometry(140);
      break;
    default: {
      const shape = new THREE.Shape();
      if (s.shape === "star") {
        for (let i = 0; i < 10; i++) {
          const a = Math.PI / 2 + (i * Math.PI) / 5,
            r = i % 2 ? 55 : 125;
          i
            ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)
            : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        shape.closePath();
      } else if (s.shape === "heart") {
        shape.moveTo(0, -110);
        shape.bezierCurveTo(-30, -80, -130, -10, -125, 60);
        shape.bezierCurveTo(-122, 135, -32, 150, 0, 82);
        shape.bezierCurveTo(32, 150, 122, 135, 125, 60);
        shape.bezierCurveTo(130, -10, 30, -80, 0, -110);
      } else {
        shape.moveTo(-120, -120);
        shape.lineTo(-120, 20);
        shape.absarc(0, 20, 120, Math.PI, 0, true);
        shape.lineTo(120, -120);
        shape.lineTo(60, -120);
        shape.lineTo(60, 20);
        shape.absarc(0, 20, 60, 0, Math.PI, false);
        shape.lineTo(-60, -120);
        shape.closePath();
      }
      g = new THREE.ExtrudeGeometry(shape, extrude);
    }
  }
  // ExtrudeGeometry supplies face normals. Join the gently changing normals on
  // curves and bevels, while retaining corners over 60 degrees and crisp faces.
  if (["text", "star", "heart", "arch"].includes(s.shape))
    g = toCreasedNormals(g, Math.PI / 3);
  g.center();
  g.computeBoundingSphere();
  const factor = 245 / Math.max(1, g.boundingSphere!.radius);
  g.scale(factor, factor, factor);
  geometries.set(key, g);
  if (geometries.size > 8) {
    const oldest = geometries.keys().next().value!;
    geometries.get(oldest)!.dispose();
    geometries.delete(oldest);
  }
  return g;
}
let gpu:
  | {
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.OrthographicCamera;
      mesh: THREE.Mesh;
      material: THREE.MeshPhysicalMaterial;
    }
  | null
  | undefined;
function getRenderer() {
  if (gpu !== undefined) return gpu;
  try {
    const output = document.createElement("canvas"),
      renderer = new THREE.WebGLRenderer({
        canvas: output,
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
    renderer.setSize(1200, 960, false);
    renderer.setClearColor(0, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene(),
      camera = new THREE.OrthographicCamera(-400, 400, 320, -320, 1, 3000);
    camera.position.set(0, 70, 1400);
    camera.lookAt(0, 0, 0);
    const environment = new RoomEnvironment(),
      pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(environment, 0.04).texture;
    environment.dispose();
    pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xf7f3ff, 0x7d7189, 1.2));
    const light = new THREE.DirectionalLight(0xfff6e7, 4);
    light.position.set(-350, 500, 700);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, {
      left: -600,
      right: 600,
      top: 600,
      bottom: -600,
      near: 1,
      far: 2000,
    });
    light.shadow.bias = -0.001;
    light.shadow.radius = 4;
    scene.add(light);
    const fill = new THREE.DirectionalLight(0xe0eaff, 1.7);
    fill.position.set(450, 100, -200);
    scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.ShadowMaterial({ opacity: 0.15 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -255;
    floor.receiveShadow = true;
    scene.add(floor);
    const material = new THREE.MeshPhysicalMaterial(),
      mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
    mesh.castShadow = true;
    scene.add(mesh);
    gpu = { renderer, scene, camera, mesh, material };
  } catch {
    gpu = null;
  }
  return gpu;
}
function angles(s: SolidSettings, phase: number | null) {
  const t = phase == null ? 0 : phase * Math.PI * 2;
  return new THREE.Euler(
    THREE.MathUtils.degToRad(s.rotateX),
    THREE.MathUtils.degToRad(s.rotateY) +
      (s.motion === "spin" ? t : s.motion === "rock" ? Math.sin(t) * 0.45 : 0),
    THREE.MathUtils.degToRad(s.rotateZ),
    "XYZ",
  );
}
function software(
  s: SolidSettings,
  g: THREE.BufferGeometry,
  canvas: HTMLCanvasElement,
  rotation: THREE.Euler,
) {
  // The same extruded geometry remains rotatable without WebGL; studio reflections need GPU support.
  const ctx = canvas.getContext("2d")!,
    positions = g.getAttribute("position"),
    normals = g.getAttribute("normal"),
    indices = g.index;
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation),
    lamp = new THREE.Vector3(-0.4, 0.65, 1).normalize();
  const vertices: THREE.Vector3[] = [],
    lights: number[] = [];
  for (let i = 0; i < positions.count; i++) {
    vertices.push(
      new THREE.Vector3()
        .fromBufferAttribute(positions, i)
        .applyMatrix4(matrix),
    );
    const normal = new THREE.Vector3()
      .fromBufferAttribute(normals, i)
      .transformDirection(matrix);
    lights.push(0.42 + Math.max(0, normal.dot(lamp)) * 0.65);
  }
  const faces: { p: THREE.Vector3[]; depth: number; light: number[] }[] = [];
  for (let i = 0; i < (indices?.count || positions.count); i += 3) {
    const ids = [0, 1, 2].map((k) => (indices ? indices.getX(i + k) : i + k)),
      p = ids.map((id) => vertices[id]);
    const normal = p[1]
      .clone()
      .sub(p[0])
      .cross(p[2].clone().sub(p[0]))
      .normalize();
    if (normal.z < -0.05) continue;
    faces.push({
      p,
      depth: p.reduce((sum, v) => sum + v.z, 0),
      light: ids.map((id) => lights[id]),
    });
  }
  faces.sort((a, b) => a.depth - b.depth);
  const c = new THREE.Color(s.color);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const shade = (light: number) => {
    const value = c.clone().multiplyScalar(light).convertLinearToSRGB();
    return `rgb(${Math.min(255, Math.round(value.r * 255))},${Math.min(255, Math.round(value.g * 255))},${Math.min(255, Math.round(value.b * 255))})`;
  };
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(canvas.width / 800, canvas.height / 640);
  const shadow = ctx.createRadialGradient(0, 255, 5, 0, 255, 190);
  shadow.addColorStop(0, "#33234325");
  shadow.addColorStop(1, "#33234300");
  ctx.save();
  ctx.translate(0, 204);
  ctx.scale(1, 0.2);
  ctx.translate(0, -255);
  ctx.fillStyle = shadow;
  ctx.fillRect(-220, 25, 440, 460);
  ctx.restore();
  for (const face of faces) {
    // Interpolate vertex lighting across the triangle. The CPU fallback should
    // retain smooth bevels too, rather than bringing back flat triangle bands.
    const p = face.p.map((v) => ({ x: v.x, y: -v.y })),
      l = face.light,
      dx1 = p[1].x - p[0].x,
      dy1 = p[1].y - p[0].y,
      dx2 = p[2].x - p[0].x,
      dy2 = p[2].y - p[0].y,
      det = dx1 * dy2 - dx2 * dy1;
    ctx.fillStyle = shade(l[0]);
    if (Math.abs(det) > 0.0001) {
      const a = ((l[1] - l[0]) * dy2 - (l[2] - l[0]) * dy1) / det,
        b = (dx1 * (l[2] - l[0]) - dx2 * (l[1] - l[0])) / det,
        m = a * a + b * b;
      if (m > 1e-12) {
        const projections = p.map((v) => a * v.x + b * v.y),
          lo = Math.min(...projections),
          hi = Math.max(...projections),
          origin = projections[0],
          gradient = ctx.createLinearGradient(
            p[0].x + (a * (lo - origin)) / m,
            p[0].y + (b * (lo - origin)) / m,
            p[0].x + (a * (hi - origin)) / m,
            p[0].y + (b * (hi - origin)) / m,
          );
        gradient.addColorStop(0, shade(l[0] + lo - origin));
        gradient.addColorStop(1, shade(l[0] + hi - origin));
        ctx.fillStyle = gradient;
      }
    }
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.35;
    ctx.beginPath();
    face.p.forEach((v, i) =>
      i ? ctx.lineTo(v.x, -v.y) : ctx.moveTo(v.x, -v.y),
    );
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
export function renderSolid(
  s: SolidSettings,
  canvas: HTMLCanvasElement,
  phase: number | null = null,
) {
  const g = geometry(s),
    r = angles(s, phase),
    state = getRenderer();
  if (!state || state.renderer.getContext().isContextLost()) {
    software(s, g, canvas, r);
    return;
  }
  const { mesh, material, renderer, scene, camera } = state;
  mesh.geometry = g;
  mesh.rotation.copy(r);
  material.color.set(s.color);
  material.metalness = s.material === "metal" ? 1 : 0;
  material.roughness =
    s.material === "matte" ? 0.8 : s.material === "metal" ? 0.25 : 0.28;
  material.clearcoat = s.material === "ceramic" ? 0.4 : 0;
  renderer.render(scene, camera);
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
}
