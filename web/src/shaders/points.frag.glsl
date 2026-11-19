uniform float uMode;
uniform float uUncertainty;
uniform sampler2D uLut;

varying vec3 vColor;
varying float vValue;
varying float vHi;
varying float vUnc;
varying float vShape;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  if (dot(p, p) > 1.0) discard;
  if (uMode < 0.5 && vShape > 0.5 && dot(p, p) < 0.3) discard;   // ring for cluster 8, cluster mode only
  vec3 col = vColor;
  if (uMode > 0.5) {
    float b = floor(vValue * 255.0 + 0.5);
    if (b < 0.5) {
      col = vec3(0.25);
    } else {
      float t = (((b - 1.0) / 254.0) * 255.0 + 0.5) / 256.0;
      col = texture2D(uLut, vec2(t, 0.5)).rgb;
    }
    col = mix(col, vec3(1.0), 0.3 * vHi);
  } else {
    float grey = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(0.3), clamp(vUnc * 3.0 * uUncertainty, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
  
}