import * as THREE from "three";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { gunzipSync } from "three/addons/libs/fflate.module.js";
import type { Articulation } from "./voice";
import type { FaceMode } from "./portrait";
// Face Cap generic head by Niels J. (MIT). Local model and textures only.
// The face has real morph targets for eyelids, jaw, cheeks and lips.
export async function mountAvatar(
  canvas: HTMLCanvasElement,
  state: () => { mode: FaceMode; articulation: Articulation; reduced: boolean },
  signal: AbortSignal,
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x030509, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  const group = new THREE.Group();
  scene.add(group);
  scene.add(new THREE.HemisphereLight(0xecfaff, 0x182230, 2));
  const key = new THREE.DirectionalLight(0xf5fbff, 3);
  key.position.set(-4, 5, 9);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88c5de, 2);
  rim.position.set(5, 1, -3);
  scene.add(rim);
  let frame = 0,
    disposed = false;
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Set<THREE.Material>(),
    textures = new Set<THREE.Texture>();
  const tracked: Array<THREE.Mesh | THREE.Points> = [];
  const resize = () => {
    const w = canvas.clientWidth,
      h = canvas.clientHeight;
    if (w <= 0 || h <= 0) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.set(0, 0.25, Math.max(18, 12.2 / Math.max(0.5, camera.aspect)));
    camera.lookAt(0, 0.15, 0);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const releaseScene = () => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    releaseScene();
    renderer.dispose();
    signal.removeEventListener("abort", dispose);
  };
  signal.addEventListener("abort", dispose, { once: true });
  if (signal.aborted) {
    dispose();
    return dispose;
  }
  try {
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) =>
      /\.(png|jpe?g|tga)$/i.test(url) ? "/models/astra/FaceCapHeadGeneric.png" : url,
    );
    const response = await fetch("/models/astra/human.fbx.gz", { signal });
    if (!response.ok) throw Error("Modelo 3D indisponível.");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 5 * 1024 * 1024) throw Error("Modelo 3D acima do limite.");
    const decoded = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes;
    if (decoded.byteLength > 5 * 1024 * 1024) throw Error("Modelo 3D acima do limite.");
    const model = new FBXLoader(manager).parse(new Uint8Array(decoded).buffer, "/models/astra/");
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      const oldMaterials = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of oldMaterials) {
        materials.add(m);
        if ("map" in m && m.map instanceof THREE.Texture) textures.add(m.map);
      }
      const map = (oldMaterials[0] as THREE.MeshPhongMaterial).map;
      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      }
      const material = new THREE.MeshStandardMaterial({
        map,
        color: 0x243b49,
        roughness: 0.6,
        metalness: 0.1,
        depthWrite: true,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      materials.add(material);
      o.material = material;
      o.renderOrder = 0;
      if (o.morphTargetInfluences) {
        o.morphTargetInfluences.fill(0);
        tracked.push(o);
      }
    });
    if (disposed) {
      releaseScene();
      return dispose;
    }
    // Recenter and fit the complete head and neck, independently of source units.
    const box = new THREE.Box3().setFromObject(model, true),
      size = box.getSize(new THREE.Vector3()),
      centre = box.getCenter(new THREE.Vector3());
    const normalizer = new THREE.Group();
    const fit = 8 / Math.max(size.y, 0.001);
    normalizer.scale.setScalar(fit);
    model.position.sub(centre);
    normalizer.add(model);
    group.add(normalizer);
    // A restrained luminous overlay follows the same facial morphs as the skin.
    const head = tracked.find((m) =>
      Object.keys(m.morphTargetDictionary || {}).some((k) => k.toLowerCase().includes("jawopen")),
    );
    if (head instanceof THREE.Mesh) {
      const source = head.geometry,
        pos = source.getAttribute("position"),
        index = source.index;
      const selected = Object.entries(head.morphTargetDictionary || {}).filter(([name]) =>
        /jawopen|mouthfunnel|mouthpucker|eyeblinkleft|eyeblinkright|eyesquintleft|eyesquintright|mouthsmileleft|mouthsmileright/i.test(
          name,
        ),
      );
      const count = 24000,
        coordinates = new Float32Array(count * 3);
      const morphs = selected.map(() => new Float32Array(count * 3));
      const triangleCount = Math.floor((index?.count || pos.count) / 3);
      let seed = 127;
      const random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
      for (let i = 0; i < count; i++) {
        const triangle = Math.floor(random() * triangleCount) * 3;
        const ids = [0, 1, 2].map((k) => (index ? index.getX(triangle + k) : triangle + k));
        let u = random(),
          v = random();
        if (u + v > 1) {
          u = 1 - u;
          v = 1 - v;
        }
        const weights = [1 - u - v, u, v];
        const sample = (
          attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
          target: Float32Array,
        ) => {
          for (let k = 0; k < 3; k++)
            target[i * 3 + k] = ids.reduce(
              (sum, id, j) => sum + attribute.getComponent(id, k) * weights[j]!,
              0,
            );
        };
        sample(pos, coordinates);
        selected.forEach(([, target], j) =>
          sample(source.morphAttributes.position![target]!, morphs[j]!),
        );
      }
      const cloudGeometry = new THREE.BufferGeometry();
      geometries.add(cloudGeometry);
      cloudGeometry.setAttribute("position", new THREE.BufferAttribute(coordinates, 3));
      cloudGeometry.morphAttributes.position = morphs.map(
        (array) => new THREE.BufferAttribute(array, 3),
      );
      cloudGeometry.morphTargetsRelative = source.morphTargetsRelative;
      const pointMaterial = new THREE.PointsMaterial({
        color: 0xe6f5fc,
        size: 0.026 / fit,
        transparent: true,
        opacity: 0.64,
        depthWrite: false,
        sizeAttenuation: true,
      });
      materials.add(pointMaterial);
      const cloud = new THREE.Points(cloudGeometry, pointMaterial);
      cloud.position.copy(head.position);
      cloud.quaternion.copy(head.quaternion);
      cloud.scale.copy(head.scale);
      cloud.renderOrder = 1;
      cloud.morphTargetDictionary = Object.fromEntries(selected.map(([name], i) => [name, i]));
      cloud.morphTargetInfluences = selected.map(() => 0);
      head.parent?.add(cloud);
      tracked.push(cloud);
    }
    resize();
    let last = -Infinity,
      start = -1;
    const smooth = { jaw: 0, round: 0, width: 1 };
    const draw = (time: number) => {
      if (disposed) return;
      frame = requestAnimationFrame(draw);
      if (document.hidden || time - last < 40) return;
      last = time;
      if (start < 0) start = time;
      const current = state(),
        t = current.reduced ? 0 : (time - start) / 1000,
        speaking = current.mode === "speaking" && !current.reduced;
      smooth.jaw += ((speaking ? current.articulation.jaw : 0) - smooth.jaw) * 0.4;
      smooth.round += ((speaking ? current.articulation.round : 0) - smooth.round) * 0.4;
      smooth.width += ((speaking ? current.articulation.width : 1) - smooth.width) * 0.4;
      const blink = current.reduced ? 0 : Math.exp(-((((t % 6.1) - 5.7) / 0.095) ** 2));
      for (const object of tracked)
        for (const [name, index] of Object.entries(object.morphTargetDictionary || {})) {
          const key = name.toLowerCase().replace(/[^a-z]/g, "");
          let value = 0;
          if (key.endsWith("jawopen")) value = smooth.jaw * 0.5;
          else if (key.endsWith("mouthfunnel")) value = smooth.round * 0.55;
          else if (key.endsWith("mouthpucker")) value = smooth.round * 0.3;
          else if (key.endsWith("eyeblinkleft") || key.endsWith("eyeblinkright")) value = blink;
          else if (key.endsWith("eyesquintleft") || key.endsWith("eyesquintright")) value = 0.12;
          else if (key.endsWith("mouthsmileleft") || key.endsWith("mouthsmileright")) value = 0.025;
          if (object.morphTargetInfluences) object.morphTargetInfluences[index] = value;
        }
      group.rotation.y = Math.sin(t * 0.35) * 0.085;
      group.rotation.x = Math.sin(t * 0.27) * 0.018;
      group.position.y = Math.sin(t * 0.8) * 0.02;
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(draw);
    return dispose;
  } catch (error) {
    dispose();
    throw error;
  }
}
