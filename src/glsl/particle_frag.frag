// ============================================================================
//  GARGANTUA · PASS 03b — particle fragment: soft micro-streak + horizon depth
// ============================================================================

precision highp float;
precision highp int;

#include "common.glsl"

uniform float uNear;
uniform float uFar;

in vec3  vCol;
in float vAlpha;
in float vDist;
in vec2  vQ;

out vec4 fragColor;

void main(){
  if (vAlpha <= 0.0001) discard;
  float d2 = dot(vQ, vQ);
  if (d2 > 1.0) discard;
  float a = exp(-d2 * 2.6) * (1.0 - d2);
  gl_FragDepth = depthFromDist(vDist, uNear, uFar);
  fragColor = vec4(vCol * a * vAlpha, 1.0);
}
