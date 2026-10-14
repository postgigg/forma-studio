// A laptop is two solid bodies joined at a hinge. The screen and keyboard
// keep separate texture coordinates, so turning the device reveals real depth.
type Point3 = [number, number, number];
type Face = {
  points: Point3[];
  texture: HTMLCanvasElement;
  shade?: number;
  shadow?: boolean;
};
export interface LaptopModel {
  lid: HTMLCanvasElement;
  back: HTMLCanvasElement;
  deck: HTMLCanvasElement;
  metal: HTMLCanvasElement;
  dark: HTMLCanvasElement;
  shadow: HTMLCanvasElement;
  width: number;
  height: number;
  depth: number;
  thickness: number;
  lidThickness: number;
}
function canvas(width: number, height: number) {
  const result = document.createElement("canvas");
  result.width = Math.ceil(width);
  result.height = Math.ceil(height);
  return result;
}
function rounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string | CanvasGradient,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
export function createLaptopModel(
  source: HTMLCanvasElement,
  screen: number[],
  finish: string,
  chunky: boolean,
): LaptopModel {
  const [sx, sy, sw, sh] = screen;
  const lid = canvas(sw + 48, sh + sy + 27);
  lid
    .getContext("2d")!
    .drawImage(
      source,
      sx - 24,
      6,
      lid.width,
      lid.height,
      0,
      0,
      lid.width,
      lid.height,
    );
  const width = lid.width * 1.035,
    depth = width * 0.65;
  const colors =
    finish === "graphite"
      ? ["#777e88", "#343a44", "#5f6670"]
      : finish === "gold"
        ? ["#efe0c4", "#b6a082", "#deccab"]
        : ["#edf0f4", "#a9b0bb", "#d5dbe2"];
  const paintMetal = (target: HTMLCanvasElement, radius: number) => {
    const c = target.getContext("2d")!,
      g = c.createLinearGradient(0, 0, target.width, target.height);
    colors.forEach((color, i) => g.addColorStop(i / 2, color));
    rounded(c, 0, 0, target.width, target.height, radius, g);
    c.strokeStyle = "#ffffff55";
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(2, 2, target.width - 4, target.height - 4, radius);
    c.stroke();
  };
  const deck = canvas(width, depth),
    back = canvas(lid.width, lid.height),
    metal = canvas(64, 64),
    dark = canvas(2, 2);
  paintMetal(deck, 26);
  paintMetal(back, 28);
  paintMetal(metal, 0);
  dark.getContext("2d")!.fillStyle = "#151920";
  dark.getContext("2d")!.fillRect(0, 0, 2, 2);
  const c = deck.getContext("2d")!,
    keyX = width * 0.12,
    keyY = depth * 0.12,
    keyW = width * 0.76,
    keyH = depth * 0.46;
  rounded(c, keyX - 9, keyY - 9, keyW + 18, keyH + 18, 16, "#656c7780");
  const rows = [
    [
      "esc",
      "F1",
      "F2",
      "F3",
      "F4",
      "F5",
      "F6",
      "F7",
      "F8",
      "F9",
      "F10",
      "F11",
      "F12",
      "●",
    ],
    ["`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "−", "+", "delete"],
    ["tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
    ["caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "return"],
    ["shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "shift"],
    [
      "fn",
      "control",
      "option",
      "command",
      "",
      "command",
      "option",
      "◀",
      "▲",
      "▶",
    ],
  ];
  const rowHeight = keyH / 6,
    gap = 7;
  rows.forEach((row, ri) => {
    const weights = row.map((_, i) =>
      ri === 5 && i === 4
        ? 5
        : ri === 4 && (i === 0 || i === row.length - 1)
          ? 1.8
          : 1,
    );
    const unit =
      (keyW - gap * (row.length - 1)) / weights.reduce((a, b) => a + b, 0);
    let x = keyX;
    row.forEach((key, i) => {
      const w = unit * weights[i],
        y = keyY + ri * rowHeight,
        h = rowHeight - gap;
      rounded(c, x, y, w, h, 6, "#10141a");
      const g = c.createLinearGradient(x, y, x, y + h);
      g.addColorStop(0, "#3d424c");
      g.addColorStop(1, "#22262d");
      rounded(c, x + 2, y + 2, w - 4, h - 5, 5, g);
      c.fillStyle = "#e0e4eb";
      c.font = `${key.length > 2 ? 9 : 13}px Arial`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(key, x + w / 2, y + h / 2);
      x += w + gap;
    });
  });
  c.fillStyle = finish === "graphite" ? "#1b2029" : "#777f8c";
  for (const x of [width * 0.045, width * 0.92])
    for (let col = 0; col < 5; col++)
      for (let row = 0; row < 43; row++) {
        c.beginPath();
        c.arc(x + col * 7, keyY + row * 8, 1.5, 0, Math.PI * 2);
        c.fill();
      }
  const tx = width * 0.285,
    ty = depth * 0.67,
    tw = width * 0.43,
    th = depth * 0.265;
  rounded(c, tx, ty, tw, th, 14, finish === "graphite" ? "#808793" : "#8d97a5");
  rounded(
    c,
    tx + 2,
    ty + 2,
    tw - 4,
    th - 4,
    12,
    finish === "graphite"
      ? "#515965"
      : finish === "gold"
        ? "#decaa9"
        : "#d4dbe3",
  );
  c.strokeStyle = "#ffffff70";
  c.beginPath();
  c.moveTo(tx + 14, ty + th - 2);
  c.lineTo(tx + tw - 14, ty + th - 2);
  c.stroke();
  const shadow = canvas(256, 256),
    s = shadow.getContext("2d")!,
    g = s.createRadialGradient(128, 128, 24, 128, 128, 128);
  g.addColorStop(0, "#17203338");
  g.addColorStop(0.65, "#1720331b");
  g.addColorStop(1, "#17203300");
  s.fillStyle = g;
  s.fillRect(0, 0, 256, 256);
  return {
    lid,
    back,
    deck,
    metal,
    dark,
    shadow,
    width,
    height: lid.height,
    depth,
    thickness: chunky ? 38 : 24,
    lidThickness: chunky ? 22 : 13,
  };
}
function outline(w: number, h: number, radius: number) {
  const result: [number, number][] = [];
  for (const [cx, cy, start] of [
    [w - radius, radius, -90],
    [w - radius, h - radius, 0],
    [radius, h - radius, 90],
    [radius, radius, 180],
  ])
    for (let step = 0; step <= 5; step++) {
      const a = ((start + step * 18) * Math.PI) / 180;
      result.push([
        (cx + Math.cos(a) * radius) / w,
        (cy + Math.sin(a) * radius) / h,
      ]);
    }
  return result;
}
function surfaces(m: LaptopModel, opening: number) {
  const faces: Face[] = [],
    a = (opening * Math.PI) / 180,
    rear = m.depth / 2 - 18;
  const lid = (u: number, v: number, z = 0): Point3 => [
    (u - 0.5) * m.lid.width,
    m.thickness + (1 - v) * m.height * Math.sin(a) + z * Math.cos(a),
    rear - (1 - v) * m.height * Math.cos(a) + z * Math.sin(a),
  ];
  const deck = (u: number, v: number, y: number): Point3 => [
    (u - 0.5) * m.width,
    y,
    (0.5 - v) * m.depth,
  ];
  const uv = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const add = (
    points: Point3[],
    texture: HTMLCanvasElement,
    shade = 1,
    shadow = false,
  ) => faces.push({ points, texture, shade, shadow });
  add(
    [
      [-m.width * 0.65, -10, m.depth * 0.8],
      [m.width * 0.65, -10, m.depth * 0.8],
      [m.width * 0.65, -10, -m.depth * 0.8],
      [-m.width * 0.65, -10, -m.depth * 0.8],
    ],
    m.shadow,
    1,
    true,
  );
  add(
    uv.map(([u, v]) => deck(u, v, 0)),
    m.deck,
    0.55,
  );
  add(
    uv.map(([u, v]) => deck(u, v, m.thickness)),
    m.deck,
  );
  const baseEdge = outline(m.width, m.depth, 26);
  baseEdge.forEach(([u, v], i) => {
    const [nu, nv] = baseEdge[(i + 1) % baseEdge.length];
    add(
      [
        deck(u, v, m.thickness),
        deck(nu, nv, m.thickness),
        deck(nu, nv, 0),
        deck(u, v, 0),
      ],
      m.metal,
      0.73 + (v + nv) * 0.08,
    );
  });
  // Recess at the front lip, and ports embedded in the side of the chassis.
  add(
    [
      [-82, m.thickness - 2, -m.depth / 2 - 0.2],
      [82, m.thickness - 2, -m.depth / 2 - 0.2],
      [70, m.thickness * 0.58, -m.depth / 2 - 0.2],
      [-70, m.thickness * 0.58, -m.depth / 2 - 0.2],
    ],
    m.dark,
    0.9,
  );
  for (const side of [-1, 1])
    for (const z of [m.depth * 0.1, m.depth * 0.24, m.depth * 0.33])
      add(
        [
          [side * (m.width / 2 + 0.3), m.thickness * 0.76, z],
          [side * (m.width / 2 + 0.3), m.thickness * 0.76, z + 32],
          [side * (m.width / 2 + 0.3), m.thickness * 0.27, z + 32],
          [side * (m.width / 2 + 0.3), m.thickness * 0.27, z],
        ],
        m.dark,
      );
  const radius = 13;
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8,
      next = ((i + 1) * Math.PI) / 8;
    const p = (x: number, t: number): Point3 => [
      x,
      m.thickness + 4 + Math.sin(t) * radius,
      rear + Math.cos(t) * radius,
    ];
    add(
      [
        p(-m.width * 0.4, angle),
        p(m.width * 0.4, angle),
        p(m.width * 0.4, next),
        p(-m.width * 0.4, next),
      ],
      m.dark,
      0.7 + Math.max(0, Math.sin(angle)) * 0.3,
    );
  }
  add(
    uv.map(([u, v]) => lid(u, v, m.lidThickness)),
    m.back,
    0.93,
  );
  add(
    uv.map(([u, v]) => lid(u, v)),
    m.lid,
  );
  const lidEdge = outline(m.lid.width, m.height, 28);
  lidEdge.forEach(([u, v], i) => {
    const [nu, nv] = lidEdge[(i + 1) % lidEdge.length];
    add(
      [
        lid(u, v),
        lid(nu, nv),
        lid(nu, nv, m.lidThickness),
        lid(u, v, m.lidThickness),
      ],
      m.metal,
      0.76,
    );
  });
  return faces;
}
let gpu: ReturnType<typeof createRenderer> | null | undefined;
function createRenderer() {
  const output = canvas(1, 1),
    gl = output.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: true,
    });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error("Laptop shader could not compile.");
    return s;
  };
  const vs = shader(
    gl.VERTEX_SHADER,
    "attribute vec4 position; attribute vec2 texcoord; varying vec2 uv; void main(){gl_Position=position;uv=texcoord;}",
  );
  const fs = shader(
    gl.FRAGMENT_SHADER,
    "precision mediump float; uniform sampler2D image; uniform float shade; varying vec2 uv; void main(){vec4 c=texture2D(image,uv);if(c.a<0.01)discard;gl_FragColor=vec4(c.rgb*shade,c.a);}",
  );
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const position = gl.getAttribLocation(program, "position"),
    texcoord = gl.getAttribLocation(program, "texcoord");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 4, gl.FLOAT, false, 24, 0);
  gl.enableVertexAttribArray(texcoord);
  gl.vertexAttribPointer(texcoord, 2, gl.FLOAT, false, 24, 16);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  return {
    output,
    gl,
    shade: gl.getUniformLocation(program, "shade"),
    textures: new Map<HTMLCanvasElement, WebGLTexture>(),
  };
}
type Projected = { x: number; y: number; z: number; w: number };
function fallbackTriangle(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  uv: number[][],
  p: Projected[],
) {
  const s = uv.map(([u, v]) => ({
    x: u * texture.width,
    y: v * texture.height,
  }));
  const [a, b, c] = s,
    det = a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y);
  if (Math.abs(det) < 0.001) return;
  const solve = (v: number[]) => [
    (v[0] * (b.y - c.y) + v[1] * (c.y - a.y) + v[2] * (a.y - b.y)) / det,
    (v[0] * (c.x - b.x) + v[1] * (a.x - c.x) + v[2] * (b.x - a.x)) / det,
    (v[0] * (b.x * c.y - c.x * b.y) +
      v[1] * (c.x * a.y - a.x * c.y) +
      v[2] * (a.x * b.y - b.x * a.y)) /
      det,
  ];
  const [aa, cc, ee] = solve(p.map((v) => v.x)),
    [bb, dd, ff] = solve(p.map((v) => v.y));
  ctx.save();
  ctx.beginPath();
  // Slightly overlap adjacent texture triangles so antialiased clip edges do
  // not leave a visible mesh in the software renderer.
  const center = {
    x: p.reduce((sum, v) => sum + v.x, 0) / 3,
    y: p.reduce((sum, v) => sum + v.y, 0) / 3,
  };
  const inset = Math.min(
    ...p.map((v, i) => {
      const next = p[(i + 1) % 3];
      return (
        Math.abs(
          (next.y - v.y) * center.x -
            (next.x - v.x) * center.y +
            next.x * v.y -
            next.y * v.x,
        ) / Math.hypot(next.x - v.x, next.y - v.y)
      );
    }),
  );
  const overlap = 1 + 0.6 / Math.max(0.1, inset);
  p.forEach((v, i) => {
    const x = center.x + (v.x - center.x) * overlap,
      y = center.y + (v.y - center.y) * overlap;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.clip();
  ctx.transform(aa, bb, cc, dd, ee, ff);
  ctx.drawImage(texture, 0, 0);
  ctx.restore();
}
export function drawLaptopModel(
  ctx: CanvasRenderingContext2D,
  model: LaptopModel,
  width: number,
  height: number,
  tiltX: number,
  tiltY: number,
  lift: number,
  opening: number,
) {
  const faces = surfaces(model, opening),
    pitch = (Math.max(8, Math.min(60, 22 + tiltX)) * Math.PI) / 180,
    yaw = (tiltY * Math.PI) / 180,
    camera = model.width * 4;
  const project = ([x, y, z]: Point3): Projected => {
    y -= model.height * 0.4;
    z -= model.depth * 0.08;
    const xx = x * Math.cos(yaw) + z * Math.sin(yaw),
      zz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    const yy = y * Math.cos(pitch) + zz * Math.sin(pitch),
      depth = -y * Math.sin(pitch) + zz * Math.cos(pitch),
      w = (camera + depth) / camera;
    return { x: xx / w, y: -yy / w, z: depth, w };
  };
  const projected = faces.map((f) => ({ ...f, p: f.points.map(project) })),
    points = projected.filter((f) => !f.shadow).flatMap((f) => f.p);
  const minX = Math.min(...points.map((p) => p.x)),
    maxX = Math.max(...points.map((p) => p.x)),
    minY = Math.min(...points.map((p) => p.y)),
    maxY = Math.max(...points.map((p) => p.y));
  const scale = Math.min(
      1,
      (width - 100) / (maxX - minX),
      (height - 120) / (maxY - minY),
    ),
    cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const fit = (p: Projected) => ({
    ...p,
    x: (p.x - cx) * scale,
    y: (p.y - cy) * scale + lift,
  });
  projected.forEach((f) => {
    f.p = f.p.map(fit);
  });
  try {
    if (gpu === undefined || gpu?.gl.isContextLost()) gpu = createRenderer();
    if (!gpu) throw new Error("WebGL unavailable");
    const { gl, output, textures } = gpu;
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
      gl.viewport(0, 0, width, height);
    }
    gl.depthMask(true);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const uv = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
      near = 100,
      far = camera * 4,
      A = (far + near) / (far - near),
      B = (-2 * near * far) / (far - near);
    for (const face of projected) {
      let texture = textures.get(face.texture);
      if (!texture) {
        texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          face.texture,
        );
        textures.set(face.texture, texture);
        if (textures.size > 18) {
          const oldest = textures.keys().next().value!;
          gl.deleteTexture(textures.get(oldest)!);
          textures.delete(oldest);
        }
      } else gl.bindTexture(gl.TEXTURE_2D, texture);
      const vertices: number[] = [];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const p = face.p[i];
        vertices.push(
          (p.x * p.w * 2) / width,
          (-p.y * p.w * 2) / height,
          (A * (camera + p.z) + B) / camera,
          p.w,
          ...uv[i],
        );
      }
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array(vertices),
        gl.STREAM_DRAW,
      );
      gl.uniform1f(gpu.shade, face.shade ?? 1);
      gl.depthMask(!face.shadow);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    ctx.drawImage(output, -width / 2, -height / 2);
  } catch {
    // The same hinged geometry remains available on machines without WebGL.
    projected.sort(
      (a, b) =>
        b.p.reduce((s, p) => s + p.z, 0) - a.p.reduce((s, p) => s + p.z, 0),
    );
    for (const face of projected) {
      if (face.shadow) {
        // Render the translucent shadow once. Overlapping texture triangles
        // would accumulate alpha and reveal a grid in the software renderer.
        const [a, b, , d] = face.p;
        ctx.save();
        ctx.transform(
          (b.x - a.x) / face.texture.width,
          (b.y - a.y) / face.texture.width,
          (d.x - a.x) / face.texture.height,
          (d.y - a.y) / face.texture.height,
          a.x,
          a.y,
        );
        ctx.drawImage(face.texture, 0, 0);
        ctx.restore();
        continue;
      }
      const steps = face.texture.width > 200 ? 10 : 1;
      for (let row = 0; row < steps; row++)
        for (let col = 0; col < steps; col++) {
          const uv = [
            [col / steps, row / steps],
            [(col + 1) / steps, row / steps],
            [(col + 1) / steps, (row + 1) / steps],
            [col / steps, (row + 1) / steps],
          ];
          const p = uv.map(([u, v]) =>
            fit(
              project(
                [0, 1, 2].map(
                  (k) =>
                    face.points[0][k] * (1 - u) * (1 - v) +
                    face.points[1][k] * u * (1 - v) +
                    face.points[2][k] * u * v +
                    face.points[3][k] * (1 - u) * v,
                ) as Point3,
              ),
            ),
          );
          fallbackTriangle(
            ctx,
            face.texture,
            [uv[0], uv[1], uv[2]],
            [p[0], p[1], p[2]],
          );
          fallbackTriangle(
            ctx,
            face.texture,
            [uv[0], uv[2], uv[3]],
            [p[0], p[2], p[3]],
          );
        }
    }
  }
}
