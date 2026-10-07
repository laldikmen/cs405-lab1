

const canvas = document.querySelector('canvas');

if (!navigator.gpu) throw new Error('WebGPU is not supported in this browser');

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('No GPU adapter found');

const device = await adapter.requestDevice();
const ctx = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format, alphaMode: 'opaque' });

console.log('WebGPU ready:', format);

const shader = device.createShaderModule({
  label: 'square shader',
  code: /* wgsl */ `
    struct Uniforms {
      time: f32,
      aspect: f32,     // canvas width / height
      mouse: vec2f,    // mouse position in clip space (-1..1)
    };
    @group(0) @binding(0) var<uniform> u: Uniforms;

    struct VSOut {
      @builtin(position) pos: vec4f,
      @location(0) color: vec3f,
    };

    @vertex
    fn vs(@builtin(vertex_index) i: u32) -> VSOut {
      let s = 0.25;   // half the side length of the square

      var pos = array<vec2f, 6>(
        vec2f(-s, -s), vec2f( s, -s), vec2f( s,  s),   // triangle 1
        vec2f(-s, -s), vec2f( s,  s), vec2f(-s,  s),   // triangle 2
      );
      var col = array<vec3f, 6>(
        vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), vec3f(0.0, 0.0, 1.0),
        vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), vec3f(1.0, 1.0, 0.0),
      );


      let p = pos[i];
      let c = cos(u.time);
      let sn = sin(u.time);
      let r = vec2f(p.x * c - p.y * sn, p.x * sn + p.y * c);

      let final_pos = vec2f(r.x / u.aspect, r.y) + u.mouse;

      var out: VSOut;
      out.pos = vec4f(final_pos, 0.0, 1.0);
      out.color = col[i];
      return out;
    }

    @fragment
    fn fs(in: VSOut) -> @location(0) vec4f {
      return vec4f(in.color, 1.0);
    }
  `,
});

const pipeline = device.createRenderPipeline({
  label: 'triangle pipeline',
  layout: 'auto',
  vertex:   { module: shader, entryPoint: 'vs' },
  fragment: { module: shader, entryPoint: 'fs', targets: [{ format }] },
});

const uniformBuffer = device.createBuffer({
  label: 'uniforms',
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
const uniformData = new Float32Array(4);   // 4 floats = 16 bytes

const bind = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
});

const mouse = { x: 0, y: 0 };

canvas.addEventListener('pointermove', (e) => {
  const rect = canvas.getBoundingClientRect();

  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = 1 - ((e.clientY - rect.top) / rect.height) * 2;
});

const t0 = performance.now();

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
window.addEventListener('resize', resize);
resize();

function frame() {
  uniformData[0] = (performance.now() - t0) / 1000; 
  uniformData[1] = canvas.width / canvas.height;     
  uniformData[2] = mouse.x;
  uniformData[3] = mouse.y;
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: ctx.getCurrentTexture().createView(),
      clearValue: { r: 0.1, g: 0.2, b: 0.4, a: 1 },
      loadOp: 'clear',
      storeOp: 'store',
    }],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bind);
  pass.draw(6); 
  pass.end();
  device.queue.submit([encoder.finish()]);

  requestAnimationFrame(frame);
}
frame();
