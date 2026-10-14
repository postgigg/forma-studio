import * as THREE from "three";
import { Font, FontLoader } from "three/addons/loaders/FontLoader.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { SolidSettings } from "./solid-object";

const fonts = new Map<string, Promise<Font>>(), geometries = new Map<string, THREE.BufferGeometry>();
const readyFonts = new Map<string, Font>();
export async function prepareSolid(s: SolidSettings) {
  if (s.shape !== "text") return;
  if (!fonts.has(s.font)) fonts.set(s.font, new FontLoader().loadAsync(`/fonts/forma${s.font}.json`).then(font => {
    readyFonts.set(s.font, font); return font;
  }).catch(e => { fonts.delete(s.font); throw e; }));
  await fonts.get(s.font);
}
function geometry(s: SolidSettings) {
  const key = JSON.stringify([s.shape, s.text, s.font, s.depth, s.bevel]);
  if (geometries.has(key)) return geometries.get(key)!;
  let g: THREE.BufferGeometry;
  const extrude = { depth: s.depth, bevelEnabled: s.bevel > 0, bevelThickness: s.bevel, bevelSize: s.bevel, bevelSegments: 4, curveSegments: 24, steps: 1 };
  switch (s.shape) {
    case "text": g = new TextGeometry(s.text, { ...extrude, size: 120, font: readyFonts.get(s.font)! }); break;
    case "sphere": g = new THREE.SphereGeometry(120, 40, 28); break;
    case "cube": g = new RoundedBoxGeometry(180, 180, 180, 5, 16); break;
    case "ring": g = new THREE.TorusGeometry(100, 30, 20, 72); break;
    case "capsule": g = new THREE.CapsuleGeometry(60, 120, 10, 32); break;
    case "crystal": g = new THREE.OctahedronGeometry(140); break;
    default: {
      const shape = new THREE.Shape();
      if (s.shape === "star") {
        for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 55 : 125; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r); } shape.closePath();
      } else if (s.shape === "heart") {
        shape.moveTo(0, -110); shape.bezierCurveTo(-30, -80, -130, -10, -125, 60); shape.bezierCurveTo(-122, 135, -32, 150, 0, 82); shape.bezierCurveTo(32, 150, 122, 135, 125, 60); shape.bezierCurveTo(130, -10, 30, -80, 0, -110);
      } else {
        shape.moveTo(-120, -120); shape.lineTo(-120, 20); shape.absarc(0, 20, 120, Math.PI, 0, true); shape.lineTo(120, -120); shape.lineTo(60, -120); shape.lineTo(60, 20); shape.absarc(0, 20, 60, 0, Math.PI, false); shape.lineTo(-60, -120); shape.closePath();
      }
      g = new THREE.ExtrudeGeometry(shape, extrude);
    }
  }
  g.center(); g.computeBoundingSphere();
  const factor = 245 / Math.max(1, g.boundingSphere!.radius); g.scale(factor, factor, factor);
  geometries.set(key, g);
  if (geometries.size > 8) { const oldest = geometries.keys().next().value!; geometries.get(oldest)!.dispose(); geometries.delete(oldest); }
  return g;
}
let gpu: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; mesh: THREE.Mesh; material: THREE.MeshPhysicalMaterial } | null | undefined;
function getRenderer() {
  if (gpu !== undefined) return gpu;
  try {
    const output = document.createElement("canvas"), renderer = new THREE.WebGLRenderer({ canvas: output, alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setSize(1200, 960, false); renderer.setClearColor(0, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-400, 400, 320, -320, 1, 3000);
    camera.position.set(0, 70, 1400); camera.lookAt(0, 0, 0);
    const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(environment, 0.04).texture; environment.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xf7f3ff, 0x7d7189, 1.2));
    const light = new THREE.DirectionalLight(0xfff6e7, 4); light.position.set(-350, 500, 700); light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024); Object.assign(light.shadow.camera, { left: -600, right: 600, top: 600, bottom: -600, near: 1, far: 2000 }); light.shadow.bias = -0.001; light.shadow.radius = 4; scene.add(light);
    const fill = new THREE.DirectionalLight(0xe0eaff, 1.7); fill.position.set(450, 100, -200); scene.add(fill);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.ShadowMaterial({ opacity: 0.15 })); floor.rotation.x = -Math.PI / 2; floor.position.y = -255; floor.receiveShadow = true; scene.add(floor);
    const material = new THREE.MeshPhysicalMaterial(), mesh = new THREE.Mesh(new THREE.BufferGeometry(), material); mesh.castShadow = true; scene.add(mesh);
    gpu = { renderer, scene, camera, mesh, material };
  } catch { gpu = null; }
  return gpu;
}
function angles(s: SolidSettings, phase: number | null) {
  const t = phase == null ? 0 : phase * Math.PI * 2;
  return new THREE.Euler(THREE.MathUtils.degToRad(s.rotateX), THREE.MathUtils.degToRad(s.rotateY) + (s.motion === "spin" ? t : s.motion === "rock" ? Math.sin(t) * 0.45 : 0), THREE.MathUtils.degToRad(s.rotateZ), "XYZ");
}
function software(s: SolidSettings, g: THREE.BufferGeometry, canvas: HTMLCanvasElement, rotation: THREE.Euler) {
  // The same extruded geometry remains rotatable without WebGL; studio reflections need GPU support.
  const ctx = canvas.getContext("2d")!, positions = g.getAttribute("position"), indices = g.index;
  const matrix = new THREE.Matrix4().makeRotationFromEuler(rotation), lamp = new THREE.Vector3(-0.4, 0.65, 1).normalize();
  const vertices: THREE.Vector3[] = [];
  for (let i = 0; i < positions.count; i++) vertices.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(matrix));
  const faces: { p: THREE.Vector3[]; depth: number; light: number }[] = [];
  for (let i = 0; i < (indices?.count || positions.count); i += 3) {
    const p = [0, 1, 2].map(k => vertices[indices ? indices.getX(i + k) : i + k]);
    const normal = p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).normalize();
    if (normal.z < -0.05) continue;
    faces.push({ p, depth: p.reduce((sum, v) => sum + v.z, 0), light: 0.42 + Math.max(0, normal.dot(lamp)) * 0.65 });
  }
  faces.sort((a, b) => a.depth - b.depth);
  const c = new THREE.Color(s.color); ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.scale(canvas.width / 800, canvas.height / 640);
  const shadow = ctx.createRadialGradient(0, 255, 5, 0, 255, 190); shadow.addColorStop(0, "#33234325"); shadow.addColorStop(1, "#33234300"); ctx.save(); ctx.translate(0, 204); ctx.scale(1, 0.2); ctx.translate(0, -255); ctx.fillStyle = shadow; ctx.fillRect(-220, 25, 440, 460); ctx.restore();
  for (const face of faces) {
    const shade = c.clone().multiplyScalar(face.light).convertLinearToSRGB();
    ctx.fillStyle = `rgb(${Math.min(255, Math.round(shade.r * 255))},${Math.min(255, Math.round(shade.g * 255))},${Math.min(255, Math.round(shade.b * 255))})`; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 0.35;
    ctx.beginPath(); face.p.forEach((v, i) => i ? ctx.lineTo(v.x, -v.y) : ctx.moveTo(v.x, -v.y)); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
export function renderSolid(s: SolidSettings, canvas: HTMLCanvasElement, phase: number | null = null) {
  const g = geometry(s), r = angles(s, phase), state = getRenderer();
  if (!state || state.renderer.getContext().isContextLost()) { software(s, g, canvas, r); return; }
  const { mesh, material, renderer, scene, camera } = state;
  mesh.geometry = g; mesh.rotation.copy(r); material.color.set(s.color);
  material.metalness = s.material === "metal" ? 1 : 0;
  material.roughness = s.material === "matte" ? 0.8 : s.material === "metal" ? 0.25 : 0.28;
  material.clearcoat = s.material === "ceramic" ? 0.4 : 0;
  renderer.render(scene, camera);
  const ctx = canvas.getContext("2d")!; ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(renderer.domElement, 0, 0, canvas.width, canvas.height);
}
