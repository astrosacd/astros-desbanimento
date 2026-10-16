import { vertices, triangles } from "./face-mesh";
export type FaceMode = "idle" | "listening" | "thinking" | "speaking" | "error";
type Point = [number, number, number];
// Fixed seed keeps the portrait stable through hydration and state changes.
let seed = 127;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const points: Point[] = vertices.map((v) => [v[0]!, v[1]!, v[2]!] as Point);
for (const face of triangles) {
  const a = vertices[face[0]!]!,
    b = vertices[face[1]!]!,
    c = vertices[face[2]!]!;
  const u = b.map((x, i) => x - a[i]!),
    v = c.map((x, i) => x - a[i]!);
  const cross = [
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  ];
  const count = Math.max(3, Math.ceil(Math.hypot(...cross) * 17));
  for (let j = 0; j < count; j++) {
    let p = random(),
      q = random();
    if (p + q > 1) {
      p = 1 - p;
      q = 1 - q;
    }
    points.push(a.map((x, i) => x + u[i]! * p + v[i]! * q) as Point);
  }
}
const dust = Array.from({ length: 70 }, () => [random(), random(), random(), random()]);
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mode: FaceMode,
  reduced = false,
) {
  const t = reduced ? 0 : time / 1000,
    scale = Math.min(width / 17, height / 21),
    cx = width * 0.5,
    cy = height * 0.49;
  ctx.clearRect(0, 0, width, height);
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.5);
  halo.addColorStop(0, "rgba(19,99,109,.2)");
  halo.addColorStop(0.62, "rgba(12,47,63,.08)");
  halo.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
  const yaw = -0.22 + Math.sin(t * 0.34) * 0.11,
    pitch = 0.035 + Math.sin(t * 0.27) * 0.025;
  function project(x: number, y: number, z: number): Point {
    const xx = x * Math.cos(yaw) + (z - 3) * Math.sin(yaw),
      zz = (z - 3) * Math.cos(yaw) - x * Math.sin(yaw);
    const yy = (y + 0.6) * Math.cos(pitch) - zz * Math.sin(pitch);
    const perspective = 1 + zz * 0.014;
    return [cx + xx * scale * perspective, cy - yy * scale * perspective, zz];
  }
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = "rgba(137,231,242,.065)";
  ctx.beginPath();
  for (const face of triangles) {
    for (let k = 0; k < 3; k++) {
      const a = vertices[face[k]!]!,
        b = vertices[face[(k + 1) % 3]!]!,
        p = project(a[0]!, a[1]!, a[2]!),
        q = project(b[0]!, b[1]!, b[2]!);
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
    }
  }
  ctx.stroke();
  // Small bright particles reveal the real geometry of nose, eyelids, cheekbones and lips.
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const lip =
      mode === "speaking" && a[1] < -2.6 && a[1] > -5
        ? Math.sin(t * 14) * 0.07 * Math.exp(-(a[0] ** 2) * 0.3)
        : 0;
    const p = project(a[0], a[1] - lip, a[2]);
    const rim = Math.min(1, Math.abs(a[0]) / 6.5),
      shimmer = 0.85 + 0.15 * Math.sin(i * 0.7 + t * 0.5);
    const alpha = Math.min(0.93, (0.26 + (p[2] + 3) * 0.065) * shimmer);
    ctx.fillStyle =
      mode === "error"
        ? `rgba(255,190,150,${alpha})`
        : rim > 0.65
          ? `rgba(99,218,239,${alpha * 0.85})`
          : `rgba(220,247,250,${alpha})`;
    const r = (0.43 + (i % 5) * 0.085) * (width < 220 ? 0.8 : 1);
    ctx.beginPath();
    ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(111,220,236,.35)";
  for (const [x, y, speed, size] of dust) {
    const yy = reduced ? y! : (y! + t * 0.006 * speed!) % 1;
    ctx.fillRect(x! * width, yy * height, 0.5 + size!, 0.5 + size!);
  }
  const active = mode === "speaking" || mode === "listening" || mode === "thinking";
  const base = height - 20;
  const bars = 33;
  for (let i = 0; i < bars; i++) {
    const envelope = Math.sin(((i + 1) / (bars + 1)) * Math.PI),
      h = active
        ? (3 + Math.abs(Math.sin(t * (mode === "thinking" ? 3 : 10) + i * 0.8)) * 18) * envelope
        : 2 + envelope * 3;
    ctx.fillStyle = `rgba(100,225,217,${active ? 0.7 : 0.3})`;
    ctx.fillRect(cx + (i - bars / 2) * 4, base - h / 2, 1.5, h);
  }
}
