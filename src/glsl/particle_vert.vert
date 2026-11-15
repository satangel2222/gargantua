// ============================================================================
//  GARGANTUA · PASS 03 — instanced velocity-stretched particle micro-streaks
//  One instanced quad per simulated particle (gl_InstanceID → texel).
//  The quad is stretched along the projected orbital velocity and depth-tested
//  against the raytraced event horizon via gl_FragDepth.
// ============================================================================

precision highp float;
precision highp int;

#include "common.glsl"

in vec3 position;              // unit quad corner in [-1,1]²

uniform sampler2D uState;
uniform mat4  uViewProj;
uniform vec3  uCamPos;
uniform vec2  uRes;
uniform float uSimW;
uniform float uDoppler;
uniform float uGain;

out vec3  vCol;
out float vAlpha;
out float vDist;
out vec2  vQ;

void main(){
  vQ = position.xy;
  int id = gl_InstanceID;
  ivec2 tc = ivec2(id - (id / int(uSimW)) * int(uSimW), id / int(uSimW));
  vec4 s = texelFetch(uState, tc, 0);

  float r = s.x, phi = s.y, y = s.z;
  if (r < 1e-4){
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vCol = vec3(0.0); vAlpha = 0.0; vDist = 1e5;
    return;
  }

  vec3 p = vec3(r * cos(phi), y, r * sin(phi));

  // local orbital 3-velocity (beta·c)
  vec3  phiHat = normalize(cross(vec3(0.0, 1.0, 0.0), p) + vec3(1e-5));
  float rr = max(r, 1.30);
  float beta = min(sqrt(0.5 / rr) / sqrt(max(1.0 - 1.0 / rr, 0.10)), 0.86);
  beta = clamp(beta * (1.0 + 0.30), 0.0, 0.92);
  vec3  vel = phiHat * beta;

  // vertical (jet) motion contributes to the streak as well
  float vy = s.w;
  vec3 motion = vel + vec3(0.0, vy * 0.10, 0.0);
  float streakWorld = clamp(length(motion), 0.0, 1.2) * 0.85;

  vec4 c0 = uViewProj * vec4(p, 1.0);
  vec4 c1 = uViewProj * vec4(p - motion * streakWorld, 1.0);
  vec2 n0 = c0.xy / max(c0.w, 1e-4);
  vec2 n1 = c1.xy / max(c1.w, 1e-4);
  vec2 d  = (n1 - n0) * uRes * 0.5;
  float lenPx = clamp(length(d), 0.5, 14.0);
  vec2 dir  = (length(d) > 1e-4) ? normalize(d) : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);

  float wPx = 0.95;
  vec2 off = (dir * position.x * (lenPx + wPx) + perp * position.y * wPx) / (uRes * 0.5);
  vec4 clip = c0;
  clip.xy += off * clip.w;
  gl_Position = clip;

  // ------------------------------------------------ relativistic colouring
  vec3  toCam = normalize(uCamPos - p);
  float gamma = 1.0 / sqrt(max(1.0 - beta * beta, 0.02));
  float dop   = 1.0 / (gamma * (1.0 - dot(vel, toCam)));
  float g     = dop * sqrt(max(1.0 - RS / max(r, 1.0001), 0.04));

  float T0 = 7600.0 * pow(max(2.95 / max(r, 1.2), 0.02), 0.72);
  vec3  col = blackbody(T0 * g) * pow(max(T0 / 7600.0, 0.0), 1.7) * pow(g, 2.0 * uDoppler);

  // jets burn blue-white, far disk cools to amber
  col = mix(col, vec3(0.55, 0.85, 1.75) * 1.4, smoothstep(1.2, 5.0, abs(y)) * 0.85);

  float fade = exp(-max(c0.w - 18.0, 0.0) * 0.035);
  vAlpha = uGain * 0.012 * fade;
  vCol   = col;
  vDist  = c0.w;
}
