// ============================================================================
//  GARGANTUA — RELATIVISTIC SINGULARITY
//  A single-file, zero-asset, GPU-saturating general-relativistic black hole.
//
//  Pipeline
//    01  RK4 geodesic raytracer + volumetric disk + polar jets   → HDR RGBA16F
//    02  2048² RGBA32F particle simulation (ping-pong)           → 4.19 M states
//    03  instanced velocity-stretched micro-streaks (gl_FragDepth) → same FBO
//    04  8-level Kawase bloom downsample (bright threshold 1.1)
//    05  tent upsample chain
//    06  horizontal anamorphic streak
//    07  ACES filmic composite + grain + vignette → canvas
// ============================================================================

const THREE_CDN = [
  'https://unpkg.com/three@0.160.1/build/three.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js',
  'https://esm.sh/three@0.160.1',
];

const CFG = {
  ssaa: 2.0,
  steps: 360,
  simSize: 2048,
  safe: false,
  spin: 0.34,
  turb: 0.62,
  doppler: 1.0,
  orbit: 0.35,
  exposure: 1.18,
};

const DISK_IN = 3.0;      // ISCO for a Schwarzschild hole (3 Rs)
const DISK_OUT = 12.0;
const NEAR = 0.5;
const FAR = 400.0;

// ---------------------------------------------------------------- utilities
const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function toast(msg, ms = 3600) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

async function loadThree() {
  let lastErr = null;
  for (const url of THREE_CDN) {
    try {
      const m = await import(/* @vite-ignore */ url);
      if (m && m.WebGLRenderer) return m;
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('three.js unavailable');
}

// ------------------------------------------------------------------- boot
(async function boot() {
  const bootEl = $('#boot');
  const setBoot = (p, label) => {
    const bar = $('#bootBar i');
    if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
    const l = $('#bootLabel');
    if (l && label) l.textContent = label;
  };

  setBoot(0.05, 'ACQUIRING THREE.JS r160');
  let THREE;
  try {
    THREE = await loadThree();
  } catch (e) {
    setBoot(1, 'THREE.JS CDN UNREACHABLE');
    $('#bootLabel').textContent = 'CDN UNREACHABLE — CONNECT TO THE NETWORK AND RELOAD';
    return;
  }

  setBoot(0.2, 'VERIFYING WEBGL2 EXTENSIONS');

  const canvas = $('#gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
  } catch (e) {
    $('#bootLabel').textContent = 'WEBGL2 UNAVAILABLE ON THIS DEVICE';
    return;
  }

  const gl = renderer.getContext();
  const caps = {
    floatColor: !!gl.getExtension('EXT_color_buffer_float'),
    floatLinear: !!gl.getExtension('OES_texture_float_linear'),
    halfFloatLinear: !!gl.getExtension('OES_texture_half_float_linear'),
    maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    renderer: (() => {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      return dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'UNKNOWN';
    })(),
  };
  console.log('[GARGANTUA]', caps);

  if (!caps.floatColor) {
    $('#bootLabel').textContent = 'EXT_color_buffer_float MISSING — HDR PIPELINE UNAVAILABLE';
    return;
  }

  renderer.setPixelRatio(1);
  renderer.autoClear = false;
  renderer.setClearColor(0x000000, 0);

  // ---------------------------------------------------------- scene graph
  const fsScene = new THREE.Scene();
  const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false;
  fsScene.add(quad);

  const makeMat = (vert, frag, uniforms, extra = {}) => new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vert,
    fragmentShader: frag,
    uniforms,
    depthTest: false,
    depthWrite: false,
    ...extra,
  });

  const depthParams = { uNear: { value: NEAR }, uFar: { value: FAR } };

  // ------------------------------------------------------------- materials
  const matRay = makeMat(SHADERS.fullscreenVert, SHADERS.raytraceFrag, {
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uCamPos: { value: new THREE.Vector3() },
    uCamBasis: { value: new THREE.Matrix3() },
    uTanHalf: { value: 0.34 },
    uAspect: { value: 1 },
    uSteps: { value: CFG.steps },
    uSpin: { value: CFG.spin },
    uTurb: { value: CFG.turb },
    uDoppler: { value: CFG.doppler },
    uDiskIn: { value: DISK_IN },
    uDiskOut: { value: DISK_OUT },
    uDiskGain: { value: 0.95 },
    uJetGain: { value: 0.16 },
    uStarGain: { value: 1.0 },
    uDisp: { value: 0.6 },
    ...depthParams,
  }, { depthTest: true, depthWrite: true, depthFunc: THREE.AlwaysDepth });

  const matSim = makeMat(SHADERS.fullscreenVert, SHADERS.particleSimFrag, {
    uState: { value: null },
    uDt: { value: 0.016 },
    uTime: { value: 0 },
    uSpin: { value: CFG.spin },
    uTurb: { value: CFG.turb },
    uDiskIn: { value: DISK_IN },
    uDiskOut: { value: DISK_OUT },
  });

  const matPart = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: SHADERS.particleVert,
    fragmentShader: SHADERS.particleFrag,
    uniforms: {
      uState: { value: null },
      uViewProj: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSimW: { value: CFG.simSize },
      uDoppler: { value: CFG.doppler },
      uGain: { value: 0.50 },
      ...depthParams,
    },
    depthTest: true,
    depthWrite: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
  });

  const matDown = makeMat(SHADERS.fullscreenVert, SHADERS.downsampleFrag, {
    uSrc: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uThreshold: { value: 1.1 },
    uKnee: { value: 0.42 },
    uPrefilter: { value: 0 },
  });

  const matUp = makeMat(SHADERS.fullscreenVert, SHADERS.upsampleFrag, {
    uSrc: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uRadius: { value: 1.0 },
  }, { transparent: true, blending: THREE.AdditiveBlending });

  const matAna = makeMat(SHADERS.fullscreenVert, SHADERS.anamorphicFrag, {
    uSrcHorizontal: { value: null },
    uTexel: { value: new THREE.Vector2() },
    uStride: { value: 1.8 },
  });

  const matComp = makeMat(SHADERS.fullscreenVert, SHADERS.compositeFrag, {
    uScene: { value: null },
    uBloom: { value: null },
    uStreak: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uExposure: { value: CFG.exposure },
    uBloomGain: { value: 0.62 },
    uStreakGain: { value: 0.30 },
    uGrain: { value: 0.020 },
    uVoid: { value: 1.0 },
  });

  // -------------------------------------------------------------- targets
  const hdr = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false };

  const rtScene = new THREE.WebGLRenderTarget(2, 2, {
    ...hdr, depthBuffer: true,
    depthTexture: null,
  });

  const N_BLOOM = 8;
  const bloomRT = [];
  for (let i = 0; i < N_BLOOM; i++) bloomRT.push(new THREE.WebGLRenderTarget(2, 2, { ...hdr }));

  const floatStateType = caps.floatColor ? THREE.FloatType : THREE.HalfFloatType;
  const simA = new THREE.WebGLRenderTarget(2, 2, {
    type: floatStateType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    depthBuffer: false, stencilBuffer: false, generateMipmaps: false,
  });
  const simB = simA.clone();

  const anaA = new THREE.WebGLRenderTarget(2, 2, { ...hdr });
  const anaB = new THREE.WebGLRenderTarget(2, 2, { ...hdr });

  // ---------------------------------------------------------- particle draw
  const partScene = new THREE.Scene();
  const partCam = new THREE.PerspectiveCamera(38, 1, NEAR, FAR);
  const MAX_INST = CFG.simSize * CFG.simSize;

  function buildParticleGeometry(n) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
    ]), 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    // placeholder instance attribute: establishes the instance bound
    g.setAttribute('aDummy', new THREE.InstancedBufferAttribute(new Uint8Array(n), 1));
    g.instanceCount = n;
    g._maxInstanceCount = n;
    return g;
  }
  let partMesh = null;

  const dummy = new THREE.Object3D();

  // ------------------------------------------------------------- sim state
  let simRead = simA, simWrite = simB;

  function resetSim() {
    renderer.setRenderTarget(simRead);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(simWrite);
    renderer.clear(true, false, false);
  }

  function allocateParticles() {
    const n = CFG.simSize * CFG.simSize;
    if (partMesh) {
      partScene.remove(partMesh);
      partMesh.geometry.dispose();
    }
    partMesh = new THREE.Mesh(buildParticleGeometry(n), matPart);
    partMesh.frustumCulled = false;
    partScene.add(partMesh);
    simA.setSize(CFG.simSize, CFG.simSize);
    simB.setSize(CFG.simSize, CFG.simSize);
    matPart.uniforms.uSimW.value = CFG.simSize;
    resetSim();
  }

  // ------------------------------------------------------------- sizing
  let canvasW = 2, canvasH = 2, rtW = 2, rtH = 2;
  const MAX_INTERNAL = 3840 * 2160;

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvasW = Math.max(2, Math.round(w * dpr));
    canvasH = Math.max(2, Math.round(h * dpr));
    renderer.setSize(canvasW, canvasH, false);

    let rw = Math.round(canvasW * CFG.ssaa);
    let rh = Math.round(canvasH * CFG.ssaa);
    if (rw * rh > MAX_INTERNAL) {
      const k = Math.sqrt(MAX_INTERNAL / (rw * rh));
      rw = Math.round(rw * k); rh = Math.round(rh * k);
    }
    rw = Math.min(rw, caps.maxTex); rh = Math.min(rh, caps.maxTex);
    rtW = rw; rtH = rh;

    rtScene.setSize(rw, rh);
    matRay.uniforms.uRes.value.set(rw, rh);
    matRay.uniforms.uAspect.value = rw / rh;
    matPart.uniforms.uRes.value.set(rw, rh);

    let bw = Math.max(2, rw >> 1), bh = Math.max(2, rh >> 1);
    for (let i = 0; i < N_BLOOM; i++) {
      bloomRT[i].setSize(bw, bh);
      bw = Math.max(2, bw >> 1);
      bh = Math.max(2, bh >> 1);
    }
    anaA.setSize(Math.max(2, rtW >> 2), Math.max(2, rtH >> 2));
    anaB.setSize(Math.max(2, rtW >> 2), Math.max(2, rtH >> 2));

    matComp.uniforms.uRes.value.set(canvasW, canvasH);

    const aspect = canvasW / canvasH;
    partCam.aspect = aspect;
    partCam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------- camera
  const cam = { az: -0.95, el: 0.185, dist: 31.0, tAz: -0.95, tEl: 0.185, tDist: 31.0 };
  const camPos = new THREE.Vector3();
  const basis = new THREE.Matrix3();
  const viewProj = new THREE.Matrix4();
  const persp = new THREE.Matrix4();
  const view = new THREE.Matrix4();
  const tmpFwd = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();
  const origin = new THREE.Vector3(0, 0, 0);
  const worldUp = new THREE.Vector3(0, 1, 0);
  const FOV = 38 * Math.PI / 180;
  const TAN_HALF = Math.tan(FOV * 0.5);

  function updateCamera(dt, t) {
    cam.tAz += dt * 0.035 * CFG.orbit;
    cam.tEl = clamp(cam.tEl, 0.09, 0.62);

    cam.az += (cam.tAz - cam.az) * Math.min(1, dt * 4.0);
    cam.el += (cam.tEl - cam.el) * Math.min(1, dt * 4.0);
    cam.dist += (cam.tDist - cam.dist) * Math.min(1, dt * 3.0);

    // low-inclination cinematic drift: ~9°-12° above the disk plane
    const el2 = cam.el + Math.sin(t * 0.11) * 0.012;
    const ce = Math.cos(el2);
    camPos.set(
      cam.dist * ce * Math.sin(cam.az),
      cam.dist * Math.sin(el2),
      cam.dist * ce * Math.cos(cam.az)
    );

    tmpFwd.copy(camPos).multiplyScalar(-1).normalize();
    tmpRight.copy(tmpFwd).cross(worldUp).normalize();
    if (tmpRight.lengthSq() < 1e-6) tmpRight.set(1, 0, 0);
    tmpUp.copy(tmpRight).cross(tmpFwd).normalize();

    // view-space -> world-space basis (columns: right, up, -forward)
    basis.set(
      tmpRight.x, tmpUp.x, -tmpFwd.x,
      tmpRight.y, tmpUp.y, -tmpFwd.y,
      tmpRight.z, tmpUp.z, -tmpFwd.z
    );

    // standard look-at view matrix (row-major arguments)
    view.set(
       tmpRight.x,  tmpRight.y,  tmpRight.z, -tmpRight.dot(camPos),
       tmpUp.x,     tmpUp.y,     tmpUp.z,    -tmpUp.dot(camPos),
      -tmpFwd.x,   -tmpFwd.y,   -tmpFwd.z,    tmpFwd.dot(camPos),
       0,           0,           0,           1
    );

    const a = partCam.aspect;
    persp.makePerspective(-TAN_HALF * a, TAN_HALF * a, TAN_HALF, -TAN_HALF, NEAR, FAR);
    viewProj.multiplyMatrices(persp, view);

    return TAN_HALF;
  }

  // ------------------------------------------------------------- render loop
  let last = performance.now();
  let time = 12.0;
  let frameCount = 0;
  let fpsAcc = 0, fpsN = 0, fps = 0, ms = 0;
  let started = false;
  let governorStage = 0;

  function blit(material, target) {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCam);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = clamp(rawDt, 0.0005, 0.05);
    time += dt;
    calibrate(rawDt);

    // ---------------------------------------------------------- simulation
    const simDt = Math.min(dt * 1.15, 0.033);
    matSim.uniforms.uState.value = simRead.texture;
    matSim.uniforms.uDt.value = simDt;
    matSim.uniforms.uTime.value = time;
    matSim.uniforms.uTurb.value = CFG.turb;
    matSim.uniforms.uSpin.value = CFG.spin;
    blit(matSim, simWrite);
    const tmp = simRead; simRead = simWrite; simWrite = tmp;

    // ------------------------------------------------------------- camera
    updateCamera(dt, time);

    matRay.uniforms.uCamPos.value.copy(camPos);
    matRay.uniforms.uCamBasis.value.copy(basis);
    matRay.uniforms.uTanHalf.value = TAN_HALF;
    matRay.uniforms.uTime.value = time;
    matRay.uniforms.uSpin.value = CFG.spin;
    matRay.uniforms.uTurb.value = CFG.turb;
    matRay.uniforms.uDoppler.value = CFG.doppler;
    matRay.uniforms.uSteps.value = CFG.steps;

    // ------------------------------------------- scene: geodesics + streaks
    renderer.setRenderTarget(rtScene);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, false);
    quad.material = matRay;
    renderer.render(fsScene, fsCam);

    matPart.uniforms.uState.value = simRead.texture;
    matPart.uniforms.uViewProj.value.copy(viewProj);
    matPart.uniforms.uCamPos.value.copy(camPos);
    matPart.uniforms.uDoppler.value = CFG.doppler;
    renderer.render(partScene, partCam);

    // ------------------------------------------------------------- bloom
    let src = rtScene.texture, sw = rtW, sh = rtH;
    for (let i = 0; i < N_BLOOM; i++) {
      matDown.uniforms.uSrc.value = src;
      matDown.uniforms.uTexel.value.set(1 / sw, 1 / sh);
      matDown.uniforms.uPrefilter.value = i === 0 ? 1 : 0;
      blit(matDown, bloomRT[i]);
      src = bloomRT[i].texture;
      sw = bloomRT[i].width; sh = bloomRT[i].height;
    }
    for (let i = N_BLOOM - 1; i > 0; i--) {
      const dst = bloomRT[i - 1];
      matUp.uniforms.uSrc.value = bloomRT[i].texture;
      matUp.uniforms.uTexel.value.set(1 / dst.width, 1 / dst.height);
      matUp.uniforms.uRadius.value = 1.0;
      blit(matUp, dst);
    }

    // -------------------------------------------------------- anamorphic
    matAna.uniforms.uSrcHorizontal.value = bloomRT[1].texture;
    matAna.uniforms.uTexel.value.set(1 / anaA.width, 1 / anaA.height);
    matAna.uniforms.uStride.value = 1.7;
    blit(matAna, anaA);
    matAna.uniforms.uSrcHorizontal.value = anaA.texture;
    matAna.uniforms.uStride.value = 3.4;
    blit(matAna, anaB);

    // ----------------------------------------------------------- composite
    matComp.uniforms.uScene.value = rtScene.texture;
    matComp.uniforms.uBloom.value = bloomRT[0].texture;
    matComp.uniforms.uStreak.value = anaB.texture;
    matComp.uniforms.uTime.value = time;
    matComp.uniforms.uExposure.value = CFG.exposure;
    blit(matComp, null);
    renderer.setRenderTarget(null);

    // ---------------------------------------------------------------- HUD
    frameCount++;
    fpsAcc += rawDt; fpsN++;
    ms = ms * 0.9 + (rawDt * 1000) * 0.1;
    if (fpsAcc > 0.35) {
      fps = fpsN / fpsAcc;
      fpsAcc = 0; fpsN = 0;
      updateHud();
      governor(fps);
    }

    if (!started && frameCount > 1) {
      started = true;
      setBoot(1, '');
      bootEl.classList.add('gone');
      setTimeout(() => bootEl.remove(), 1400);
      document.body.classList.add('ready');
    }
  }

  // boot calibration: the very first frames tell us what this GPU can carry
  let calib = [];
  let calibrated = false;

  function calibrate(rawDt) {
    if (calibrated) return;
    calib.push(rawDt);
    if (calib.length < 3) return;
    calibrated = true;
    const avg = calib.reduce((a, b) => a + b, 0) / calib.length;
    if (avg > 0.55 && CFG.simSize > 1024) {
      CFG.simSize = 1024; CFG.steps = Math.min(CFG.steps, 240);
      allocateParticles(); resize();
      toast('CALIBRATION · 1.05M particles & 240 steps — this GPU asked for mercy');
    } else if (avg > 1.1) {
      CFG.ssaa = 1.0; resize();
      toast('CALIBRATION · 1× supersampling');
    }
  }

  function governor(f) {
    if (governorStage >= 2) return;
    if (frameCount < 45) return;
    if (f < 20 && governorStage === 0) {
      governorStage = 1;
      CFG.ssaa = Math.max(1.0, CFG.ssaa * 0.6);
      resize();
      toast('GOVERNOR · internal supersampling reduced — GPU saturated');
    } else if (f < 14 && governorStage === 1) {
      governorStage = 2;
      CFG.steps = 220;
      toast('GOVERNOR · geodesic budget → 220 RK4 steps');
    }
  }

  // ------------------------------------------------------------------ HUD
  const hudFps = $('#hFps'), hudMs = $('#hMs'), hudSteps = $('#hSteps'),
        hudPart = $('#hPart'), hudSsaa = $('#hSsaa');

  function updateHud() {
    hudFps.textContent = fps.toFixed(0);
    hudMs.textContent = ms.toFixed(1);
    hudSteps.textContent = 'RK4: ' + CFG.steps + ' STEPS';
    hudPart.textContent = (CFG.simSize * CFG.simSize / 1048576).toFixed(2) + 'M PARTICLES';
    hudSsaa.textContent = CFG.ssaa.toFixed(1) + 'x SSAA';
  }

  // ------------------------------------------------------------- interaction
  let dragging = false, px = 0, py = 0;
  const el = renderer.domElement;

  el.addEventListener('pointerdown', (e) => {
    dragging = true; px = e.clientX; py = e.clientY;
    el.setPointerCapture(e.pointerId);
    el.classList.add('grab');
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    cam.tAz -= (e.clientX - px) * 0.005;
    cam.tEl = clamp(cam.tEl + (e.clientY - py) * 0.003, 0.09, 0.62);
    px = e.clientX; py = e.clientY;
  });
  const endDrag = () => { dragging = false; el.classList.remove('grab'); };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.tDist = clamp(cam.tDist * (1 + Math.sign(e.deltaY) * 0.06), 9, 70);
  }, { passive: false });

  // SSAA segmented control
  document.querySelectorAll('#hSsaaSeg button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#hSsaaSeg button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      CFG.ssaa = parseFloat(b.dataset.v);
      governorStage = 2;
      resize();
      updateHud();
      toast('SUPERSAMPLING · ' + CFG.ssaa.toFixed(1) + 'x');
    });
  });

  // SAFE MODE
  $('#hSafe').addEventListener('click', (e) => {
    CFG.safe = !CFG.safe;
    e.currentTarget.classList.toggle('on', CFG.safe);
    if (CFG.safe) {
      CFG.ssaa = 1.0; CFG.steps = 140; CFG.simSize = 1024;
      document.querySelectorAll('#hSsaaSeg button').forEach((x) =>
        x.classList.toggle('on', x.dataset.v === '1'));
      toast('SAFE MODE · 1.05M particles · 140 steps · 1x');
    } else {
      CFG.ssaa = 2.0; CFG.steps = 360; CFG.simSize = 2048;
      document.querySelectorAll('#hSsaaSeg button').forEach((x) =>
        x.classList.toggle('on', x.dataset.v === '2'));
      toast('FULL SEND · 4.19M particles · 360 steps · 2x');
    }
    governorStage = 2;
    allocateParticles();
    resize();
    updateHud();
  });

  // CONTROLS drawer
  const panel = $('#panel');
  $('#hCtrl').addEventListener('click', (e) => {
    const on = panel.classList.toggle('open');
    e.currentTarget.classList.toggle('on', on);
  });

  function bindSlider(id, key, fmt = (v) => v.toFixed(2), after = null) {
    const input = document.getElementById(id);
    const out = document.getElementById(id + 'Out');
    const apply = () => {
      CFG[key] = parseFloat(input.value);
      out.textContent = fmt(CFG[key]);
      if (after) after();
    };
    input.addEventListener('input', apply);
    apply();
  }

  bindSlider('sSpin', 'spin', (v) => (v * 1.0).toFixed(2));
  bindSlider('sTurb', 'turb', (v) => v.toFixed(2));
  bindSlider('sDopp', 'doppler', (v) => v.toFixed(2));
  bindSlider('sOrbit', 'orbit', (v) => v.toFixed(2));
  bindSlider('sExp', 'exposure', (v) => v.toFixed(2));

  window.addEventListener('resize', () => { resize(); });
  document.addEventListener('visibilitychange', () => { last = performance.now(); });

  el.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    toast('GPU CONTEXT LOST — RELOAD TO RE-IGNITE THE ACCRETION FLOW', 999999);
  });

  // --------------------------------------------------------------- go live
  allocateParticles();
  resize();
  updateHud();
  setBoot(0.9, 'IGNITING ACCRETION FLOW');

  // deep-link overrides:  ?ssaa=1&steps=140&safe=1&lowres=1
  const q = new URLSearchParams(location.search);
  if (q.get('safe') === '1') $('#hSafe').click();
  if (q.get('ssaa')) {
    const v = parseFloat(q.get('ssaa'));
    if (isFinite(v) && v > 0) {
      CFG.ssaa = v;
      document.querySelectorAll('#hSsaaSeg button').forEach((x) =>
        x.classList.toggle('on', parseFloat(x.dataset.v) === v));
      governorStage = 2;
      resize(); updateHud();
    }
  }
  if (q.get('steps')) { CFG.steps = clamp(parseInt(q.get('steps'), 10) || CFG.steps, 32, 512); updateHud(); }
  if (q.get('sim')) {
    const n = clamp(parseInt(q.get('sim'), 10) || CFG.simSize, 64, 4096);
    CFG.simSize = n; allocateParticles(); updateHud();
  }

  requestAnimationFrame(frame);
  window.__GARGANTUA__ = { CFG, renderer, caps, toast, resize, allocateParticles, mats: { matRay, matSim, matPart, matComp, matDown }, rt: { rtScene, bloomRT }, get frames(){ return frameCount; } };
})();
