// ============================================================================
//  GARGANTUA · PASS 01 — RK4 null-geodesic raytracer
//  Integrates d²x/dλ² = -1.5·h²·x/|x|⁵  (exact Schwarzschild null geodesic in
//  Cartesian form, Rs = 1) with 4th-order Runge–Kutta and adaptive Δλ.
//  Volumetric turbulent disk + magnetically collimated polar jets are
//  integrated as an emitting/absorbing medium along every geodesic.
// ============================================================================

precision highp float;
precision highp int;

#include "common.glsl"

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCamPos;
uniform mat3  uCamBasis;    // view space -> world space
uniform float uTanHalf;
uniform float uAspect;
uniform int   uSteps;
uniform float uSpin;
uniform float uTurb;
uniform float uDoppler;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uDiskGain;
uniform float uJetGain;
uniform float uStarGain;
uniform float uDisp;
uniform float uNear;
uniform float uFar;

out vec4 fragColor;

// ---------------------------------------------------------------- potential
vec3 geoAccel(vec3 p, float h2, float spin){
  float r2 = dot(p, p);
  float r  = sqrt(r2);
  float d  = r2 * r2 * r + 1e-4;          // |x|^5
  vec3  a  = -1.5 * h2 * p / d;           // Schwarzschild null geodesic
  // Kerr-inspired frame dragging: prograde swirl of the local inertial frame
  a += spin * 1.15 * cross(vec3(0.0, 1.0, 0.0), p) / (r2 * r2 + 0.6);
  return a;
}

void rk4(inout vec3 p, inout vec3 v, float dt, float h2, float spin){
  vec3 v1 = v,               a1 = geoAccel(p, h2, spin);
  vec3 v2 = v + 0.5 * dt * a1, a2 = geoAccel(p + 0.5 * dt * v1, h2, spin);
  vec3 v3 = v + 0.5 * dt * a2, a3 = geoAccel(p + 0.5 * dt * v2, h2, spin);
  vec3 v4 = v + dt * a3,       a4 = geoAccel(p + dt * v3, h2, spin);
  p += dt / 6.0 * (v1 + 2.0 * v2 + 2.0 * v3 + v4);
  v += dt / 6.0 * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
}

// ------------------------------------------------------------- accretion disk
float diskH(float r){ return 0.026 * r + 0.016; }

// Swirling Keplerian differential shear applied to a 4-octave simplex FBM
float diskNoise(vec3 p, float r){
  float omega = 2.05 / pow(max(r, 1.25), 1.5);
  float ang   = -uTime * omega * 2.6;
  float ca = cos(ang), sa = sin(ang);
  vec2  xz = vec2(ca * p.x - sa * p.z, sa * p.x + ca * p.z);
  vec3  q  = vec3(xz.x, p.y * 4.2, xz.y) * 0.78;
  q.y += uTime * 0.06;
  float n = fbm4(q);
  float f = 1.0 - abs(snoise(q * 3.4 + vec3(0.0, uTime * 0.18, 4.0)));  // filaments
  float f2 = 1.0 - abs(snoise(q * 8.1 + vec3(2.0, uTime * 0.30, 1.0)));
  return n * 0.62 + (f - 0.5) * 0.70 + (f2 - 0.5) * 0.34;
}

float diskDensity(vec3 p, out float rr){
  rr = length(p);
  if (rr < uDiskIn || rr > uDiskOut) return 0.0;
  float h  = diskH(rr);
  float ay = abs(p.y);
  if (ay > h * 2.8) return 0.0;
  float vert = exp(-(ay * ay) / (h * h)) * (1.0 - smoothstep(h * 1.7, h * 2.8, ay));
  // razor-sharp inner rim at the ISCO, feathered outer edge
  float env  = smoothstep(uDiskIn * 0.995, uDiskIn + 0.22, rr) *
               (1.0 - smoothstep(uDiskOut * 0.58, uDiskOut, rr));
  float n    = diskNoise(p, rr);
  float turb = mix(1.0, clamp(0.26 + 1.95 * n, 0.0, 2.6), uTurb);
  float d    = env * vert * turb;
  return max(d, 0.0) * 1.15;
}

// Relativistic Doppler beaming + gravitational redshift + blackbody colour
vec3 diskEmission(vec3 p, vec3 rayDir, float r, float density){
  vec3  phiHat = normalize(cross(vec3(0.0, 1.0, 0.0), p) + vec3(1e-5));
  float rr = max(r, 1.35);
  float beta = min(sqrt(0.5 / rr) / sqrt(max(1.0 - 1.0 / rr, 0.10)), 0.72);
  beta = clamp(beta * (1.0 + uSpin * 0.30), 0.0, 0.92);
  vec3  vOrb  = phiHat * beta;
  vec3  toCam = -normalize(rayDir);
  float gamma = 1.0 / sqrt(max(1.0 - beta * beta, 0.02));
  float dop   = 1.0 / (gamma * (1.0 - dot(vOrb, toCam)));
  float grav  = sqrt(max(1.0 - RS / r, 0.03));
  float g     = dop * grav;

  float T0 = 8800.0 * pow(max(2.95 / r, 0.02), 0.74);   // Shakura–Sunyaev-ish
  float T  = T0 * g;                                    // observed temperature
  float lum = pow(T0 / 8800.0, 1.40);
  return blackbody(T) * lum * pow(g, 2.7 * uDoppler) * density * uDiskGain;
}

// --------------------------------------------------------------- polar jets
float jetDensity(vec3 p, out float ay){
  ay = abs(p.y);
  float rc = length(p.xz);
  if (ay < 1.15 || ay > 27.0) return 0.0;
  float w    = 0.185 + 0.075 * ay;
  float core = exp(-(rc * rc) / (w * w));
  float ang  = atan(p.z, p.x);
  float n    = fbm4(vec3(rc * 1.7, ay * 0.55 - uTime * 1.9, ang * 0.6));
  float rag  = snoise(vec3(rc * 5.0, ay * 1.10 - uTime * 2.4, ang * 3.0));
  float hel  = 0.50 + 0.50 * sin(ang * 2.0 - ay * 1.35 + uTime * 2.2);
  float d    = core * clamp(0.30 + 1.05 * n + 0.45 * rag, 0.0, 3.0) * hel;
  d *= smoothstep(1.15, 3.4, ay) * (1.0 - smoothstep(13.0, 27.0, ay));
  return max(d, 0.0);
}

vec3 jetEmission(float ay, float density){
  float T = mix(15000.0, 4200.0, clamp(ay / 22.0, 0.0, 1.0));
  return blackbody(T) * density * uJetGain * 1.6;
}

// ------------------------------------------------------------------ deep sky
vec3 starLayer(vec3 d, float scale, float prob, float size, float gain){
  vec3 p  = d * scale;
  vec3 id = floor(p);
  vec3 r  = hash33(id);
  vec3 f  = fract(p) - 0.5;
  vec3 off = (hash33(id + 17.731) - 0.5) * 0.62;
  float dist = length(f - off);
  float s = size * (0.30 + 1.05 * r.y);
  float core = exp(-(dist * dist) / (s * s));
  float halo = exp(-dist / (s * 3.2)) * 0.10;
  float on   = step(1.0 - prob, r.x);
  float temp = mix(2700.0, 13500.0, pow(r.z, 2.0));
  return blackbody(temp) * (core + halo) * gain * (0.16 + 2.6 * pow(r.y, 7.0)) * on;
}

vec3 nebula(vec3 d){
  vec3 q  = d * 1.55;
  float n  = fbm4(q + vec3(3.1, 0.7, 1.4));
  float n2 = fbm4(q * 2.6 + vec3(9.0, 2.0, 5.5));
  float dust = smoothstep(-0.35, 0.85, n2);
  float band = exp(-pow(abs(dot(d, normalize(vec3(0.35, 0.82, -0.45)))) * 2.6, 2.0));
  vec3 base = mix(vec3(0.010, 0.014, 0.038), vec3(0.055, 0.020, 0.070), n * 0.5 + 0.5);
  vec3 glow = vec3(0.020, 0.036, 0.075) * pow(max(n, 0.0), 1.7);
  return (base * (0.40 + 1.30 * dust) + glow * 1.5) * (0.55 + 0.85 * band);
}

vec3 sky(vec3 d){
  vec3 c  = starLayer(d, 17.0, 0.62, 0.048, 1.15);
       c += starLayer(d, 43.0, 0.55, 0.032, 1.85);
       c += starLayer(d, 102.0, 0.38, 0.021, 2.55);
  return c;
}

// --------------------------------------------------------------------- main
void main(){
  vec2 uv  = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  vec3 rdv = normalize(vec3(uv.x * uAspect * uTanHalf, uv.y * uTanHalf, -1.0));
  vec3 rd  = normalize(uCamBasis * rdv);

  vec3  pos = uCamPos;
  vec3  vel = rd;
  float h2  = dot(cross(pos, vel), cross(pos, vel));

  vec3  accum  = vec3(0.0);
  float trans  = 1.0;
  float path   = 0.0;
  float minR   = 1e9;
  float hit    = -1.0;              // depth-carrying surface distance
  bool  eaten  = false;

  for (int i = 0; i < 512; i++){
    if (i >= uSteps) break;
    float r = length(pos);
    minR = min(minR, r);

    if (r < RS * 1.0008){ eaten = true; hit = path; break; }
    if (r > 140.0 && dot(pos, vel) > 0.0) break;

    // --- adaptive step: fine at the photon sphere, coarse in flat space
    float dt = clamp(0.040 + 0.085 * (r - 1.0), 0.040, 0.52);
    float ps = abs(r - 1.5 * RS);
    dt = min(dt, 0.05 + 0.55 * ps);
    // never overshoot the disk slab
    float ay = abs(pos.y);
    float hh = diskH(max(r, uDiskIn));
    if (ay < hh * 3.0 && r > uDiskIn * 0.8 && r < uDiskOut * 1.1){
      dt = min(dt, max(0.10, hh * 0.55));
    }
    path += dt;

    vec3 p0 = pos, v0 = vel;
    rk4(pos, vel, dt, h2, uSpin);

    // --- volumetric sample at the midpoint of the integrated chord
    vec3  pm = 0.5 * (p0 + pos);
    float rr;
    float dd = diskDensity(pm, rr);
    if (dd > 1e-3){
      if (hit < 0.0) hit = path - dt * 0.5;
      vec3 em = diskEmission(pm, normalize(v0), rr, dd);
      accum += trans * em * dt;
      trans *= exp(-dd * dt * 0.26);
    }

    // --- twin relativistic jets
    float jay;
    float jd = jetDensity(pm, jay);
    if (jd > 1e-3 && uJetGain > 0.001){
      if (hit < 0.0) hit = path - dt * 0.5;
      accum += trans * jetEmission(jay, jd) * dt;
      trans *= exp(-jd * dt * 0.30);
    }

    if (trans < 0.008) break;
  }

  // ---------------------------------------------------------- background
  if (!eaten){
    vec3 n    = normalize(vel);
    vec3 up   = vec3(0.0, 1.0, 0.0);
    vec3 tang = normalize(cross(n, up) + vec3(1e-5));
    // chromatic gravitational dispersion — wavelength-dependent lensing
    float lens = clamp(0.30 / (minR * minR * minR + 0.02), 0.0, 3.0);
    float damp = uDisp * 0.055 * lens;
    vec3  nR = normalize(n + tang * damp);
    vec3  nB = normalize(n - tang * damp);
    vec3  bg = vec3(sky(nR).r, sky(n).g, sky(nB).b) + nebula(n) * 0.85;
    accum += trans * bg * uStarGain;
    hit = -1.0;
  }

  // ------------------------------------------------------------- depth out
  float vz = (hit > 0.0) ? hit * rdv.z : -uFar * 1.5;
  gl_FragDepth = depthFromDist(-vz, uNear, uFar);

  fragColor = vec4(max(accum, vec3(0.0)), 1.0);
}
