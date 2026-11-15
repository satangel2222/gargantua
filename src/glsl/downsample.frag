// ============================================================================
//  GARGANTUA · PASS 04 — Kawase dual-filter downsample + strict soft-knee
//  bright pass (threshold 1.1) so only the photon ring and the blue-shifted
//  inner rim are allowed to bloom.
// ============================================================================

precision highp float;

uniform sampler2D uSrc;
uniform vec2  uTexel;
uniform float uThreshold;
uniform float uKnee;
uniform float uPrefilter;

in vec2 vUv;
out vec4 fragColor;

vec3 brightPass(vec3 c){
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * contrib;
}

void main(){
  vec2 d = uTexel;
  vec3 c = texture(uSrc, vUv).rgb * 4.0;
  c += texture(uSrc, vUv + vec2( d.x,  d.y)).rgb;
  c += texture(uSrc, vUv + vec2(-d.x, -d.y)).rgb;
  c += texture(uSrc, vUv + vec2( d.x, -d.y)).rgb;
  c += texture(uSrc, vUv + vec2(-d.x,  d.y)).rgb;
  c *= 0.125;
  if (uPrefilter > 0.5) c = brightPass(c);
  fragColor = vec4(max(c, 0.0), 1.0);
}
