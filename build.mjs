#!/usr/bin/env node
/**
 * GARGANTUA build — inlines every GLSL source, the stylesheet and the
 * application module into ONE self-contained index.html (zero external
 * assets; three.js r160 is the single CDN import).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const esc = (s) => s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const COMMON = read('src/glsl/common.glsl');

const SHADERS = {
  fullscreenVert: 'src/glsl/fullscreen.vert',
  raytraceFrag: 'src/glsl/raytrace.frag',
  particleSimFrag: 'src/glsl/particle_sim.frag',
  particleVert: 'src/glsl/particle_vert.vert',
  particleFrag: 'src/glsl/particle_frag.frag',
  downsampleFrag: 'src/glsl/downsample.frag',
  upsampleFrag: 'src/glsl/upsample.frag',
  anamorphicFrag: 'src/glsl/anamorphic.frag',
  compositeFrag: 'src/glsl/composite.frag',
};

let shaderBlock = '/* ------------------------------------------------------------------------\n   GLSL ES 3.00 sources (inlined at build time)\n   --------------------------------------------------------------------- */\nconst SHADERS = {\n';

for (const [name, file] of Object.entries(SHADERS)) {
  let src = read(file);
  src = src.replace(/^#include\s+"common\.glsl"\s*$/m, () => COMMON);
  // strip the include guard from the embedded copy so each shader stays standalone
  shaderBlock += `  ${name}: \`\n${esc(src)}\`,\n\n`;
}
shaderBlock += '};\n\n';

const app = read('src/app.js');
const css = read('src/style.css');

let html = read('src/template.html');
html = html.replace('/*__CSS__*/', () => css);
html = html.replace('/*__BUILD__*/', () => shaderBlock + app);

fs.writeFileSync(path.join(root, 'index.html'), html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`✔ index.html  ${kb} kB  ·  ${Object.keys(SHADERS).length} shaders inlined`);
