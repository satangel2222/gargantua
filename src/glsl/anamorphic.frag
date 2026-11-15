// ============================================================================
//  GARGANTUA · PASS 06 — horizontal anamorphic streak (wide-tap, 2 iterations)
// ============================================================================

precision highp float;

uniform sampler2D uSrcHorizontal;   // bright pass of the previous stage
uniform vec2  uTexel;
uniform float uStride;

in vec2 vUv;
out vec4 fragColor;

void main(){
  vec2 d = vec2(uTexel.x * uStride, 0.0);
  vec3 c  = texture(uSrcHorizontal, vUv).rgb * 0.2270270270;
  c += texture(uSrcHorizontal, vUv + d * 1.0).rgb * 0.1945945946;
  c += texture(uSrcHorizontal, vUv - d * 1.0).rgb * 0.1945945946;
  c += texture(uSrcHorizontal, vUv + d * 2.6).rgb * 0.1216216216;
  c += texture(uSrcHorizontal, vUv - d * 2.6).rgb * 0.1216216216;
  c += texture(uSrcHorizontal, vUv + d * 5.4).rgb * 0.0540540541;
  c += texture(uSrcHorizontal, vUv - d * 5.4).rgb * 0.0540540541;
  c += texture(uSrcHorizontal, vUv + d * 9.8).rgb * 0.0162162162;
  c += texture(uSrcHorizontal, vUv - d * 9.8).rgb * 0.0162162162;
  fragColor = vec4(max(c, 0.0), 1.0);
}
