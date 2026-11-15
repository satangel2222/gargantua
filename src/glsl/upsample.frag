// ============================================================================
//  GARGANTUA · PASS 05 — tent-filter upsample (additive into the lower mip)
// ============================================================================

precision highp float;

uniform sampler2D uSrc;
uniform vec2 uTexel;      // texel size of the LOWER (destination) mip
uniform float uRadius;

in vec2 vUv;
out vec4 fragColor;

void main(){
  vec2 d = uTexel * uRadius;
  vec3 c = texture(uSrc, vUv + vec2(-d.x * 2.0, 0.0)).rgb * 1.0;
  c += texture(uSrc, vUv + vec2(-d.x,  d.y)).rgb * 2.0;
  c += texture(uSrc, vUv + vec2( 0.0,  d.y * 2.0)).rgb * 1.0;
  c += texture(uSrc, vUv + vec2( d.x,  d.y)).rgb * 2.0;
  c += texture(uSrc, vUv + vec2( d.x * 2.0, 0.0)).rgb * 1.0;
  c += texture(uSrc, vUv + vec2( d.x, -d.y)).rgb * 2.0;
  c += texture(uSrc, vUv + vec2( 0.0, -d.y * 2.0)).rgb * 1.0;
  c += texture(uSrc, vUv + vec2(-d.x, -d.y)).rgb * 2.0;
  fragColor = vec4(c / 12.0, 1.0);
}
