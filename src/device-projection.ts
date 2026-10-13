// One shared WebGL context renders a perspective-correct textured device.
// The result is copied immediately into Fabric's 2D canvas, so it exports normally.
let renderer: ReturnType<typeof createRenderer> | null | undefined;
function createRenderer() {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;
  const shader = (type: number, source: string) => {
    const result = gl.createShader(type)!;
    gl.shaderSource(result, source);
    gl.compileShader(result);
    if (!gl.getShaderParameter(result, gl.COMPILE_STATUS))
      throw new Error("Device perspective shader failed.");
    return result;
  };
  const vertex = shader(
    gl.VERTEX_SHADER,
    `
    attribute vec2 position;
    uniform vec2 bodySize;
    uniform vec2 outputSize;
    uniform vec2 rotation;
    uniform float thickness;
    uniform float lift;
    varying vec2 uv;
    void main(){
      vec3 p=vec3(position*bodySize,thickness);
      float cx=cos(rotation.x),sx=sin(rotation.x),cy=cos(rotation.y),sy=sin(rotation.y);
      p=vec3(p.x,p.y*cx-p.z*sx,p.y*sx+p.z*cx);
      p=vec3(p.x*cy+p.z*sy,p.y,-p.x*sy+p.z*cy);
      float camera=max(bodySize.x,bodySize.y)*2.8;
      float w=(camera+p.z)/camera;
      gl_Position=vec4(p.x*2.0/outputSize.x,-(p.y+lift*w)*2.0/outputSize.y,0.0,w);
      uv=position+0.5;
    }
  `,
  );
  const fragment = shader(
    gl.FRAGMENT_SHADER,
    `
    precision mediump float;
    uniform sampler2D image;
    uniform vec4 tint;
    varying vec2 uv;
    void main(){vec4 color=texture2D(image,uv);gl_FragColor=tint.a>0.0?vec4(tint.rgb*color.a,color.a):color;}
  `,
  );
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
    gl.STATIC_DRAW,
  );
  const position = gl.getAttribLocation(program, "position");
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const uniforms = Object.fromEntries(
    ["bodySize", "outputSize", "rotation", "thickness", "lift", "tint"].map(
      (name) => [name, gl.getUniformLocation(program, name)],
    ),
  );
  return { canvas, gl, uniforms, last: null as HTMLCanvasElement | null };
}
export function projectDevice(
  ctx: CanvasRenderingContext2D,
  source: HTMLCanvasElement,
  width: number,
  height: number,
  x: number,
  y: number,
  lift: number,
  dark: boolean,
) {
  try {
    if (renderer === undefined) renderer = createRenderer();
    if (!renderer || renderer.gl.isContextLost()) return false;
    const { canvas, gl, uniforms: u } = renderer;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
    if (renderer.last !== source) {
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      renderer.last = source;
    }
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(u.bodySize, source.width, source.height);
    gl.uniform2f(u.outputSize, width, height);
    gl.uniform2f(u.rotation, (x * Math.PI) / 180, (y * Math.PI) / 180);
    gl.uniform1f(u.lift, lift);
    const shade = dark ? 0.13 : 0.55;
    gl.uniform4f(u.tint, shade, shade + 0.02, shade + 0.04, 1);
    for (const depth of [12, 8, 4]) {
      gl.uniform1f(u.thickness, depth);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.uniform4f(u.tint, 0, 0, 0, 0);
    gl.uniform1f(u.thickness, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    ctx.drawImage(canvas, -width / 2, -height / 2);
    return true;
  } catch {
    renderer = null;
    return false;
  }
}
