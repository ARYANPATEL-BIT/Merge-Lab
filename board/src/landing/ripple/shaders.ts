// GLSL for the hero water surface. A full-screen quad drives every pass, so the
// vertex shader just passes uv straight through — no camera matrices involved.
//
// The simulation is a damped 2D wave equation on a ping-pong height field:
// each texel stores the current height in .r and the previous height in .g, so
// one texture carries "the two previous height buffers" the update needs.

export const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Wave step: new height from the four neighbours minus the previous height,
// then damped. ClampToEdge sampling makes the borders reflect the wave.
export const SIM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_prev;
  uniform vec2 u_texel;
  uniform float u_damping;
  void main() {
    vec4 c = texture2D(u_prev, vUv);
    float n =
        texture2D(u_prev, vUv + vec2(-u_texel.x, 0.0)).r
      + texture2D(u_prev, vUv + vec2( u_texel.x, 0.0)).r
      + texture2D(u_prev, vUv + vec2(0.0, -u_texel.y)).r
      + texture2D(u_prev, vUv + vec2(0.0,  u_texel.y)).r;
    float newH = n * 0.5 - c.g;
    newH *= u_damping;
    gl_FragColor = vec4(newH, c.r, 0.0, 1.0);
  }
`;

// Additive disturbance: a cosine hump added to the current height only.
export const DROP_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_prev;
  uniform vec2 u_center;
  uniform float u_radius;
  uniform float u_strength;
  uniform float u_aspect;
  void main() {
    vec4 c = texture2D(u_prev, vUv);
    vec2 d = vUv - u_center;
    d.x *= u_aspect;
    float dist = length(d);
    float bump = 0.0;
    if (dist < u_radius) {
      bump = u_strength * 0.5 * (cos(dist / u_radius * 3.14159265) + 1.0);
    }
    gl_FragColor = vec4(c.r + bump, c.g, 0.0, 1.0);
  }
`;

// Display, dark-matter variant. The output is TRANSPARENT: calm water is fully
// clear (so the theme-adaptive page shows through, with no captured colour to go
// stale when the theme flips), and disturbed water reads as flowing dark density
// — the surface darkens by gradient magnitude — rimmed with a faint luminous edge
// tinted by the brand accent, which keeps it visible on both light and dark paper.
export const DISPLAY_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D u_height;
  uniform vec2 u_texel;
  uniform float u_normal;
  uniform float u_darkness;
  uniform float u_glow;
  uniform vec3 u_tint;
  void main() {
    float hL = texture2D(u_height, vUv - vec2(u_texel.x, 0.0)).r;
    float hR = texture2D(u_height, vUv + vec2(u_texel.x, 0.0)).r;
    float hU = texture2D(u_height, vUv - vec2(0.0, u_texel.y)).r;
    float hD = texture2D(u_height, vUv + vec2(0.0, u_texel.y)).r;
    vec2 grad = vec2(hR - hL, hD - hU);
    float g = length(grad);

    float density = clamp(g * u_darkness, 0.0, 1.0);

    vec3 normal = normalize(vec3(-grad * u_normal, 1.0));
    float rim = pow(max(dot(normal, normalize(vec3(0.35, 0.5, 1.0))), 0.0), 24.0) * u_glow;

    vec3 col = vec3(0.02, 0.02, 0.03) + rim * u_tint;
    float alpha = clamp(density + rim, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
  }
`;
