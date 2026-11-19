attribute float aCluster;
attribute float aValue;
attribute float aUncertainty;    // 1: declared
uniform float uWorldSize;
uniform float uPxPerUnit;
uniform float uHighlight;
uniform vec3 uPalette[12];

varying vec3 vColor;
varying float vValue;
varying float vHi;
varying float vUnc;              // 2: declared
varying float vShape;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  int code = min(int(aCluster + 0.5), 11);
  vColor = uPalette[code];
  vValue = aValue;
  vUnc = aUncertainty;           // 3: assigned
  vShape = aCluster > 7.5 ? 1.0 : 0.0;

  float size = uWorldSize;
  vHi = 0.0;
  if (abs(aCluster - uHighlight) < 0.5) {
    size *= 1.6;
    vColor = mix(vColor, vec3(1.0), 0.3);
    vHi = 1.0;
  }
  gl_PointSize = size * uPxPerUnit / -mv.z;
  
}