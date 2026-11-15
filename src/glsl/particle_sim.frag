// ============================================================================
//  GARGANTUA · PASS 02 — 4,194,304-particle relativistic accretion simulation
//  State texture (RGBA32F / RGBA16F, 2048×2048): x = radius, y = azimuth,
//  z = height above the disk plane, w = vertical (jet) velocity.
//  Ping-pong integration: Keplerian ω ∝ r^-1.5, frame dragging, turbulent MHD
//  curl perturbation, viscous inflow, magnetically collimated jet ejection.
// ============================================================================

precision highp float;
precision highp int;

#include "common.glsl"

uniform sampler2D uState;
uniform float uDt;
uniform float uTime;
uniform float uSpin;
uniform float uTurb;
uniform float uDiskIn;
uniform float uDiskOut;

out vec4 fragColor;

void main(){
  ivec2 tc = ivec2(gl_FragCoord.xy);
  vec4  s  = texelFetch(uState, tc, 0);

  vec2  h  = hash22(vec2(tc) * 1.017 + 3.71);
  float r = s.x, phi = s.y, y = s.z, vy = s.w;
  float dt = uDt;

  // ------------------------------------------------------------ (re)spawn
  if (r < 1e-4){
    float u = hash22(vec2(tc.yx) + 8.13).x;
    r   = mix(uDiskIn * 1.02, uDiskOut * 0.97, pow(u, 0.62));
    phi = hash22(vec2(tc) + 21.7).x * TAU;
    y   = (h.y - 0.5) * (diskSpan(r));
    vy  = 0.0;
  }

  float rr = max(r, 1.10);

  // ------------------------------------------- Keplerian + frame dragging
  float omega = (1.0 + uSpin * 0.85) / pow(rr, 1.5);
  phi += omega * dt * 2.55;
  phi  = mod(phi, TAU);

  // ------------------------------------------------- turbulent MHD curl
  vec3 pp = vec3(r * cos(phi), y, r * sin(phi));
  vec3 n1 = vec3(
    snoise(pp * 0.30 + vec3(0.0, 0.0, uTime * 0.11)),
    snoise(pp * 0.30 + vec3(5.2, 1.3, 0.0) + uTime * 0.08),
    snoise(pp * 0.30 + vec3(1.7, 9.1, 4.4))
  );

  r -= dt * (0.075 + 0.55 * exp(-(r - uDiskIn))) * (1.0 - 0.3 * uTurb);
  r += n1.x * dt * 0.30 * uTurb;
  y += n1.y * dt * 0.16 * uTurb;

  // ------------------------------------------------------ polar jet channel
  float ej = hash22(vec2(tc) + vec2(floor(uTime * 6.0) * 1.31, 17.0)).x;
  if (abs(y) < 0.42 && r < uDiskIn * 2.05 && ej > 0.9962){
    vy = (h.x > 0.5 ? 1.0 : -1.0) * (1.5 + 2.6 * h.y);
  }
  if (abs(y) > 0.9){
    // magnetically collimated outflow: accelerate + squeeze toward the axis
    vy += sign(y) * dt * (1.4 + 0.05 * abs(y));
    vy *= 0.997;
    r   = mix(r, uDiskIn * 0.55, clamp(dt * 0.55, 0.0, 1.0));
  }
  y += vy * dt;

  // ---------------------------------------------------------------- recycle
  if (r < uDiskIn * 0.68 || abs(y) > 15.0 || !(r < 1e6)){
    float u = hash22(vec2(tc + ivec2(37, 91)) + uTime * 0.7).x;
    r   = mix(uDiskIn * 1.02, uDiskOut * 0.97, pow(u, 0.62));
    phi = hash22(vec2(tc) + 55.3).x * TAU;
    y   = (h.y - 0.5) * diskSpan(r);
    vy  = 0.0;
  }

  fragColor = vec4(r, phi, y, vy);
}
