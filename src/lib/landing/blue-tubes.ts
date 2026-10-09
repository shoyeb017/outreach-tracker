import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, Mesh, PerspectiveCamera, Scene, ShaderMaterial, Vector2, WebGLRenderer } from "three";

export interface TubeScene { dispose(): void }

// Original procedural geometry/shaders, not the non-commercial reference implementation.
const vertexShader = `
  uniform float time;
  uniform float span;
  uniform float radius;
  uniform vec2 pointer;
  varying vec3 surfaceNormal;
  varying float lane;
  varying float along;
  vec3 curve(float t, float ray) {
    float phase = time * 0.27 + ray * 1.38;
    float envelope = sin(t * 3.14159265);
    return vec3((t - 0.5) * span,
      sin(t * 7.2 + phase) * 1.85 + cos(t * 12.0 - phase) * 0.48 + (ray - 1.5) * 0.28,
      cos(t * 8.0 + phase) * 1.35
    ) + vec3(pointer * envelope * envelope * 1.8, 0.0);
  }
  void main() {
    float t = position.x;
    float angle = position.y;
    float ray = position.z;
    vec3 center = curve(t, ray);
    vec3 tangent = normalize(curve(t + 0.001, ray) - curve(t - 0.001, ray));
    vec3 side = normalize(cross(tangent, vec3(0.0, 0.0, 1.0)));
    vec3 up = normalize(cross(side, tangent));
    vec3 normal = cos(angle) * side + sin(angle) * up;
    surfaceNormal = normal; lane = ray; along = t;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(center + normal * radius, 1.0);
  }
`;
const fragmentShader = `
  uniform float halo;
  varying vec3 surfaceNormal;
  varying float lane;
  varying float along;
  void main() {
    float face = max(0.0, dot(normalize(surfaceNormal), normalize(vec3(-0.3, 0.5, 1.0))));
    vec3 blue = mix(vec3(0.015, 0.15, 0.85), vec3(0.12, 0.62, 1.0), 0.5 + 0.5 * sin(lane + along * 8.0));
    vec3 core = mix(blue * 0.25, blue, face) + vec3(0.38, 0.63, 0.85) * pow(face, 16.0);
    float fade = smoothstep(0.0, 0.08, along) * smoothstep(0.0, 0.08, 1.0 - along);
    gl_FragColor = vec4(mix(core, blue, halo), mix(fade, fade * 0.075 * pow(face, 2.0), halo));
  }
`;

export function createBlueTubes(canvas: HTMLCanvasElement, container: HTMLElement, onFailure: () => void): TubeScene {
  const smallScreen = container.clientWidth < 768;
  const context = canvas.getContext("webgl2", { antialias: !smallScreen, alpha: true, powerPreference: "low-power" });
  if (!context) throw new Error("WebGL2 is unavailable");
  const renderer = new WebGLRenderer({ canvas, context, antialias: !smallScreen, alpha: true, powerPreference: "low-power" });
  renderer.setClearColor(0x000000, 0); // CSS supplies the light or dark surface without restarting the scene.
  const scene = new Scene();
  const camera = new PerspectiveCamera(48, 1, 0.1, 30);
  camera.position.z = 8;
  const uniforms = { time: { value: 1.8 }, span: { value: 16 }, pointer: { value: new Vector2() } };
  const target = new Vector2();
  const geometry = new BufferGeometry();
  const vertices: number[] = [];
  const indices: number[] = [];
  const rings = smallScreen ? 100 : 160;
  const sides = 8;
  const rays = smallScreen ? 2 : 4;
  for (let ray = 0; ray < rays; ray++) {
    const offset = vertices.length / 3;
    for (let ring = 0; ring <= rings; ring++) for (let side = 0; side <= sides; side++) vertices.push(ring / rings, side / sides * Math.PI * 2, ray);
    for (let ring = 0; ring < rings; ring++) for (let side = 0; side < sides; side++) {
      const a = offset + ring * (sides + 1) + side;
      const b = a + sides + 1;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  geometry.setAttribute("position", new BufferAttribute(new Float32Array(vertices), 3));
  geometry.setIndex(indices);
  const materials = [0.045, 0.12, 0.25].map((radius, index) => new ShaderMaterial({
    uniforms: { ...uniforms, radius: { value: radius }, halo: { value: index === 0 ? 0 : 1 } },
    vertexShader, fragmentShader, side: DoubleSide, transparent: true, depthWrite: index === 0,
    ...(index > 0 ? { blending: AdditiveBlending } : {}),
  }));
  for (const material of materials) {
    const mesh = new Mesh(geometry, material);
    mesh.frustumCulled = false; // The shader positions the parameter mesh in world space.
    scene.add(mesh);
  }
  let disposed = false;
  let failed = false;
  let visible = true;
  let frame = 0;
  let previous = 0;
  let lastRender = 0;
  const interval = 1000 / (smallScreen ? 24 : 30);
  function stop() { cancelAnimationFrame(frame); frame = 0; previous = 0; }
  function fail() { if (!failed && !disposed) { failed = true; stop(); onFailure(); } }
  renderer.debug.onShaderError = fail;
  function render() { if (!disposed && !failed) { try { renderer.render(scene, camera); } catch { fail(); } } }
  function tick(now: number) {
    frame = 0;
    if (!visible || document.hidden || disposed || failed) return;
    if (now - lastRender >= interval) {
      const elapsed = previous ? Math.min((now - previous) / 1000, 0.06) : 0;
      uniforms.time.value += elapsed;
      uniforms.pointer.value.lerp(target, 1 - Math.exp(-elapsed * 3));
      previous = now; lastRender = now; render();
    }
    if (!failed) frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (!visible || document.hidden || disposed || failed) stop();
    else if (!frame) frame = requestAnimationFrame(tick);
  }
  function resize() {
    if (disposed || failed) return;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    // Bound fill-rate on high-DPI/ultrawide displays, not only on phones.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 768 ? 1 : 1.5, Math.sqrt(2_500_000 / (width * height))));
    renderer.setSize(width, height, false);
    camera.aspect = width / height; camera.updateProjectionMatrix();
    uniforms.span.value = Math.max(7, 7.4 * camera.aspect) * 1.4;
    render();
  }
  function move(event: PointerEvent) {
    if (event.pointerType === "touch") return; // No touch capture or prevention of native scrolling.
    const bounds = container.getBoundingClientRect();
    target.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
  }
  function leave() { target.set(0, 0); }
  function lost(event: Event) { event.preventDefault(); fail(); }
  const resizeObserver = new ResizeObserver(resize);
  const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); }, { threshold: 0 });
  resizeObserver.observe(container); visibilityObserver.observe(container);
  container.addEventListener("pointermove", move, { passive: true }); container.addEventListener("pointerleave", leave);
  canvas.addEventListener("webglcontextlost", lost); document.addEventListener("visibilitychange", sync);
  resize(); sync();
  return {
    dispose() {
      if (disposed) return;
      disposed = true; stop(); resizeObserver.disconnect(); visibilityObserver.disconnect();
      container.removeEventListener("pointermove", move); container.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("webglcontextlost", lost); document.removeEventListener("visibilitychange", sync);
      geometry.dispose(); materials.forEach((material) => material.dispose()); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
