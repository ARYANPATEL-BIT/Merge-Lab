// A self-contained "dark matter" surface: three.js, an orthographic full-screen
// quad, a half-resolution ping-pong height field running a damped wave equation,
// and a transparent display pass that renders disturbed water as flowing dark
// density with a luminous accent rim. No post-processing library.
//
// Output is transparent, so the theme-adaptive page shows through and nothing
// goes stale when the theme flips. Reused by the hero background (interactive)
// and the route-change flourish (one impulse, then faded out). The caller drives
// the lifecycle and feeds disturbances; this class owns only the GL.

import * as THREE from "three";
import { DISPLAY_FRAG, DROP_FRAG, SIM_FRAG, VERT } from "./shaders.js";

const MAX_DPR = 1.5;
const DAMPING = 0.985;

interface Drop {
  u: number;
  v: number;
  radius: number;
  strength: number;
}

function makeTarget(w: number, h: number): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
  });
}

export class WaterRipple {
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad!: THREE.Mesh;

  private simMat!: THREE.ShaderMaterial;
  private dropMat!: THREE.ShaderMaterial;
  private dispMat!: THREE.ShaderMaterial;

  private read!: THREE.WebGLRenderTarget;
  private write!: THREE.WebGLRenderTarget;

  private cssW = 1;
  private cssH = 1;
  private simW = 1;
  private simH = 1;

  private raf = 0;
  private running = false;
  private drops: Drop[] = [];

  constructor(private canvas: HTMLCanvasElement) {}

  /** Returns false if a WebGL context could not be created; the caller then
   *  falls back to the static surface. Never throws. `tint` is the accent colour
   *  used for the luminous rim of the dark matter. */
  init(tint: string): boolean {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: true,
        premultipliedAlpha: false,
        powerPreference: "low-power",
      });
    } catch {
      return false;
    }
    if (!this.renderer.getContext()) return false;

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DPR));
    this.renderer.setClearColor(0x000000, 0);

    this.simMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        u_prev: { value: null },
        u_texel: { value: new THREE.Vector2() },
        u_damping: { value: DAMPING },
      },
      depthTest: false,
    });
    this.dropMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: DROP_FRAG,
      uniforms: {
        u_prev: { value: null },
        u_center: { value: new THREE.Vector2() },
        u_radius: { value: 0.05 },
        u_strength: { value: 0.1 },
        u_aspect: { value: 1 },
      },
      depthTest: false,
    });
    this.dispMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: DISPLAY_FRAG,
      transparent: true,
      uniforms: {
        u_height: { value: null },
        u_texel: { value: new THREE.Vector2() },
        u_normal: { value: 7.0 },
        u_darkness: { value: 15.0 },
        u_glow: { value: 0.6 },
        u_tint: { value: new THREE.Color(tint || "#e5491f") },
      },
      depthTest: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMat);
    this.scene.add(this.quad);

    this.resize();
    return true;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, Math.round(rect.width));
    this.cssH = Math.max(1, Math.round(rect.height));
    this.renderer.setSize(this.cssW, this.cssH, false);

    const dpr = Math.min(window.devicePixelRatio, MAX_DPR);
    // Simulate at half the render resolution.
    this.simW = Math.max(2, Math.floor((this.cssW * dpr) / 2));
    this.simH = Math.max(2, Math.floor((this.cssH * dpr) / 2));

    if (this.read) this.read.dispose();
    if (this.write) this.write.dispose();
    this.read = makeTarget(this.simW, this.simH);
    this.write = makeTarget(this.simW, this.simH);

    const texel = new THREE.Vector2(1 / this.simW, 1 / this.simH);
    this.simMat.uniforms.u_texel.value.copy(texel);
    this.dispMat.uniforms.u_texel.value.copy(texel);
    this.dropMat.uniforms.u_aspect.value = this.cssW / this.cssH;
  }

  /** Queue a disturbance at uv (0..1, v up). Radius/strength in surface units. */
  addDrop(u: number, v: number, radius: number, strength: number): void {
    if (this.drops.length > 24) return; // never let a flood of moves pile up
    this.drops.push({ u, v, radius, strength });
  }

  private swap(): void {
    const t = this.read;
    this.read = this.write;
    this.write = t;
  }

  private pass(material: THREE.ShaderMaterial): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(this.write);
    this.renderer.render(this.scene, this.camera);
    this.swap();
  }

  private frame = (): void => {
    if (!this.running) return;

    for (const d of this.drops) {
      this.dropMat.uniforms.u_prev.value = this.read.texture;
      this.dropMat.uniforms.u_center.value.set(d.u, d.v);
      this.dropMat.uniforms.u_radius.value = d.radius;
      this.dropMat.uniforms.u_strength.value = d.strength;
      this.pass(this.dropMat);
    }
    this.drops.length = 0;

    this.simMat.uniforms.u_prev.value = this.read.texture;
    this.pass(this.simMat);

    this.dispMat.uniforms.u_height.value = this.read.texture;
    this.quad.material = this.dispMat;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);

    this.raf = requestAnimationFrame(this.frame);
  };

  start(): void {
    if (this.running) return;
    this.running = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    this.read?.dispose();
    this.write?.dispose();
    this.simMat?.dispose();
    this.dropMat?.dispose();
    this.dispMat?.dispose();
    (this.quad?.geometry as THREE.BufferGeometry | undefined)?.dispose();
    this.renderer?.dispose();
  }
}
