// ============================================================================
//  GARGANTUA · PASS 07 — ACES filmic composite, anamorphic flare, 35 mm grain
// ============================================================================

precision highp float;
precision highp int;

#include "common.glsl"

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uStreak;
uniform vec2  uRes;
uniform float uTime;
uniform float uExposure;
uniform float uBloomGain;
uniform float uStreakGain;
uniform float uGrain;
uniform float uVoid;       // keeps the horizon a true, unclamped #000000

in vec2 vUv;
out vec4 fragColor;

// ACES filmic (Stephen Hill fit)
const mat3 ACESIn = mat3(
  0.59719, 0.07600, 0.02840,
  0.35458, 0.90834, 0.13383,
  0.04823, 0.01566, 0.83777
);
const mat3 ACESOut = mat3(
   1.60475, -0.10208, -0.00327,
  -0.53108,  1.10813, -0.07276,
  -0.07367, -0.00605,  1.07602
);

vec3 rrtAndOdt(vec3 v){
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 aces(vec3 color){
  color = ACESIn * color;
  color = rrtAndOdt(color);
  color = ACESOut * color;
  return clamp(color, 0.0, 1.0);
}

vec3 toSRGB(vec3 c){
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main(){
  vec2 uv = vUv;
  vec2 c  = uv - 0.5;
  float r2 = dot(c, c);

  // ultra-subtle lateral chromatic aberration toward the frame edges
  float ca = r2 * 0.0016;
  vec3 col;
  col.r = texture(uScene, uv + c * ca).r;
  col.g = texture(uScene, uv).g;
  col.b = texture(uScene, uv - c * ca).b;

  // 8-level Kawase bloom + horizontal anamorphic streak
  vec3 bloom  = texture(uBloom, uv).rgb;
  vec3 streak = texture(uStreak, uv).rgb * vec3(1.0, 0.62, 0.92);
  col += bloom * uBloomGain;
  col += streak * uStreakGain;

  col *= uExposure;
  col = aces(col);

  // 35 mm film grain, luminance-weighted
  float grain = hash12(gl_FragCoord.xy + fract(uTime) * 517.0) - 0.5;
  float luma  = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += grain * uGrain * (1.0 - 0.75 * luma);

  // couture vignette
  col *= smoothstep(1.28, 0.30, length(c) * 1.36);

  col = toSRGB(max(col, 0.0));

  // the event horizon is absolute void: never lift pure black off #000000
  float voidMask = smoothstep(0.0, 0.0035, dot(col, vec3(0.3333)));
  col *= mix(1.0, voidMask, uVoid);

  fragColor = vec4(col, 1.0);
}
