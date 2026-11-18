attribute float aCluster;        // cluster code of this cell (0, 1, 2 ...)
uniform float uWorldSize;        // point diameter in world units
uniform float uPxPerUnit;        // H / (2 tan(fov/2)), set from JavaScript
uniform float uHighlight;        // cluster code to highlight, -1 for none
uniform vec3 uPalette[12];       // one sRGB colour per cluster code
 
varying vec3 vColor;
 
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;

  int code = min(int(aCluster + 0.5), 11);
  vColor = uPalette[code];

  float size = uWorldSize;
  if (abs(aCluster - uHighlight) < 0.5) {
    size *= 1.6;
    vColor = mix(vColor, vec3(1.0), 0.3);
  }
  gl_PointSize = size * uPxPerUnit / -mv.z;
}
