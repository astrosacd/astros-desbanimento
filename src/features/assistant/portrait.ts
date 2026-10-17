import { vertices, triangles } from "./face-mesh";
import type { Articulation } from "./voice";
export type FaceMode = "idle" | "listening" | "thinking" | "speaking" | "error";
type Point = [number, number, number];
type Sample = { position: Point; normal: Point; size: number; sparkle: number };
const unit = (v: number[]): Point => {
  const length = Math.hypot(...v) || 1;
  return v.map((n) => n / length) as Point;
};
const vertexNormals: Point[] = vertices.map(() => [0, 0, 0]);
for (const [a, b, c] of triangles) {
  const p = vertices[a!]!,
    q = vertices[b!]!,
    r = vertices[c!]!;
  const u = q.map((n, i) => n - p[i]!),
    v = r.map((n, i) => n - p[i]!);
  const normal = [
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  ];
  for (const index of [a!, b!, c!])
    for (let k = 0; k < 3; k++) vertexNormals[index]![k]! += normal[k]!;
}
for (let i = 0; i < vertexNormals.length; i++) vertexNormals[i] = unit(vertexNormals[i]!);
let seed = 127;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
// Surface samples retain interpolated normals: lighting reveals the nose, cheeks
// and eye sockets instead of painting equally bright noise over the entire face.
const samples: Sample[] = [];
for (const [ia, ib, ic] of triangles) {
  const a = vertices[ia!]!,
    b = vertices[ib!]!,
    c = vertices[ic!]!;
  const u = b.map((n, i) => n - a[i]!),
    v = c.map((n, i) => n - a[i]!);
  const area = Math.hypot(
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  );
  for (let j = 0, count = Math.max(2, Math.ceil(area * 12)); j < count; j++) {
    let p = random(),
      q = random();
    if (p + q > 1) {
      p = 1 - p;
      q = 1 - q;
    }
    samples.push({
      position: a.map((n, i) => n + u[i]! * p + v[i]! * q) as Point,
      normal: unit(
        vertexNormals[ia!]!.map(
          (n, i) => n * (1 - p - q) + vertexNormals[ib!]![i]! * p + vertexNormals[ic!]![i]! * q,
        ),
      ),
      size: 0.22 + random() * 0.32,
      sparkle: random(),
    });
  }
}
const eyes = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
];
const mouth = [78, 81, 82, 13, 312, 311, 308, 402, 317, 14, 87, 178];
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mode: FaceMode,
  reduced = false,
  articulation: Articulation = { jaw: 0, round: 0, width: 1 },
) {
  const t = reduced ? 0 : time / 1000;
  const scale = Math.min(width / 19.5, height / 23.5),
    cx = width / 2,
    cy = height * 0.46;
  const yaw = reduced ? 0 : Math.sin(t * 0.32) * 0.055;
  const pitch = reduced ? 0 : Math.sin(t * 0.26) * 0.012;
  const jaw = mode === "speaking" && !reduced ? articulation.jaw : 0;
  const blink = reduced ? 0 : Math.exp(-((((t % 6.2) - 5.85) / 0.09) ** 2));
  ctx.clearRect(0, 0, width, height);
  const halo = ctx.createRadialGradient(cx, cy, scale * 2, cx, cy, scale * 10);
  halo.addColorStop(0, "rgba(29,90,108,.17)");
  halo.addColorStop(1, "rgba(9,28,41,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);
  function project(x: number, y: number, z: number): Point {
    if (mode === "speaking" && (jaw > 0 || articulation.round > 0)) {
      const lip = Math.exp(-(((y + 4.3) / 1.3) ** 2)) * Math.exp(-((x / 3) ** 4));
      const lower = Math.max(0, Math.min(1, (-y - 4.1) / 1.5));
      x *= 1 + lip * (articulation.width - 1) * 0.65;
      z += lip * articulation.round * 0.4;
      y -= jaw * 1.25 * lower * Math.exp(-((x / 5.5) ** 4));
      z -= jaw * 0.2 * lower;
    }
    if (y > 5) y += 0.8 * Math.exp(-((x / 4) ** 2)) * Math.min(1, (y - 5) / 3);
    if (blink > 0.001 && y > 1.8 && y < 3.5) {
      const eye = Math.exp(-(((Math.abs(x) - 3.2) / 1.4) ** 4));
      y = 2.65 + (y - 2.65) * (1 - blink * eye * 0.86);
    }
    const xx = x * Math.cos(yaw) + (z - 3) * Math.sin(yaw);
    const zz = (z - 3) * Math.cos(yaw) - x * Math.sin(yaw);
    const yy = (y + 0.5) * Math.cos(pitch) - zz * Math.sin(pitch);
    const perspective = 1 + zz * 0.009;
    return [cx + xx * scale * perspective, cy - yy * scale * perspective, zz];
  }
  // A continuous, low-opacity glass surface, shaded by geometry rather than
  // randomly coloured triangles. Back-to-front ordering prevents crossed facets.
  const faces = triangles
    .map((f) => {
      const a = vertices[f[0]!]!,
        b = vertices[f[1]!]!,
        c = vertices[f[2]!]!;
      return { f, depth: (a[2]! + b[2]! + c[2]!) / 3 };
    })
    .sort((a, b) => a.depth - b.depth);
  for (const { f } of faces) {
    const projected = f.map((i) => project(...(vertices[i!] as Point)));
    const shades = f.map((i) => {
      const n = vertexNormals[i!]!;
      const nx = n[0] * Math.cos(yaw) + n[2] * Math.sin(yaw);
      const nz = n[2] * Math.cos(yaw) - n[0] * Math.sin(yaw);
      return 0.12 + Math.max(0, nx * -0.55 + n[1] * 0.35 + nz * 0.75) * 0.88;
    });
    const [a, b, c] = projected as [Point, Point, Point];
    const dx1 = b[0] - a[0],
      dy1 = b[1] - a[1],
      dx2 = c[0] - a[0],
      dy2 = c[1] - a[1];
    const determinant = dx1 * dy2 - dx2 * dy1;
    const ds1 = shades[1]! - shades[0]!,
      ds2 = shades[2]! - shades[0]!;
    const gx = Math.abs(determinant) > 0.001 ? (ds1 * dy2 - ds2 * dy1) / determinant : 0;
    const gy = Math.abs(determinant) > 0.001 ? (dx1 * ds2 - dx2 * ds1) / determinant : 0;
    const length2 = gx * gx + gy * gy;
    const colour = (light: number) =>
      `rgb(${Math.round(9 + light * 63)},${Math.round(24 + light * 100)},${Math.round(36 + light * 110)})`;
    if (length2 > 0.0000001) {
      const lo = Math.min(...shades),
        hi = Math.max(...shades);
      const gradient = ctx.createLinearGradient(
        a[0] + (gx * (lo - shades[0]!)) / length2,
        a[1] + (gy * (lo - shades[0]!)) / length2,
        a[0] + (gx * (hi - shades[0]!)) / length2,
        a[1] + (gy * (hi - shades[0]!)) / length2,
      );
      gradient.addColorStop(0, colour(lo));
      gradient.addColorStop(1, colour(hi));
      ctx.fillStyle = gradient;
    } else ctx.fillStyle = colour(shades[0]!);
    ctx.beginPath();
    projected.forEach((p, k) => {
      if (!k) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fill();
    // Fill subpixel cracks without outlining the mesh.
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 0.55;
    ctx.stroke();
  }
  const buckets: Array<Array<[number, number, number]>> = Array.from({ length: 16 }, () => []);
  for (const { position: a, normal: n, size, sparkle } of samples) {
    const p = project(...a);
    const nx = n[0] * Math.cos(yaw) + n[2] * Math.sin(yaw);
    const nz = n[2] * Math.cos(yaw) - n[0] * Math.sin(yaw);
    const light = Math.max(0, nx * -0.6 + n[1] * 0.3 + nz * 0.74);
    const alpha = Math.min(
      0.55,
      0.025 + light * 0.25 + (1 - Math.abs(nz)) ** 3 * 0.08 + light ** 16 * 0.15 + sparkle * 0.025,
    );
    buckets[Math.min(15, Math.floor(alpha * 28))]!.push([
      p[0],
      p[1],
      size * 1.4 * Math.max(0.75, scale / 21),
    ]);
  }
  buckets.forEach((bucket, i) => {
    ctx.fillStyle = `rgba(196,232,241,${(i + 0.5) / 28})`;
    ctx.beginPath();
    for (const [x, y, size] of bucket) ctx.rect(x, y, size, size);
    ctx.fill();
  });
  // Recessed eyes with a soft iris highlight, instead of empty black cut-outs.
  for (const indices of eyes) {
    ctx.beginPath();
    indices.forEach((i, k) => {
      const p = project(...(vertices[i]! as Point));
      if (!k) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    const lid = indices.map((i) => project(...(vertices[i]! as Point)));
    const minY = Math.min(...lid.map((p) => p[1])),
      maxY = Math.max(...lid.map((p) => p[1]));
    const sclera = ctx.createLinearGradient(0, minY, 0, maxY || minY + 1);
    sclera.addColorStop(0, "#07121a");
    sclera.addColorStop(0.7, "#476573");
    sclera.addColorStop(1, "#213b49");
    ctx.fillStyle = sclera;
    ctx.fill();
    ctx.strokeStyle = "rgba(168,214,225,.28)";
    ctx.lineWidth = 0.65;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    const eyeCenter = indices.reduce<Point>(
      (a, i) => a.map((n, k) => n + vertices[i]![k]! / indices.length) as Point,
      [0, 0, 0],
    );
    const p = project(...eyeCenter),
      radius = scale * 0.29;
    const iris = ctx.createRadialGradient(
      p[0] - radius * 0.2,
      p[1] - radius * 0.2,
      0,
      p[0],
      p[1],
      radius,
    );
    iris.addColorStop(0, "#c2e7eb");
    iris.addColorStop(0.22, "#456c7d");
    iris.addColorStop(0.65, "#244453");
    iris.addColorStop(1, "#091820");
    ctx.fillStyle = iris;
    ctx.beginPath();
    ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#071019";
    ctx.beginPath();
    ctx.arc(p[0], p[1], radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(223,250,255,.7)";
    ctx.beginPath();
    ctx.arc(
      p[0] - radius * 0.3,
      p[1] - radius * 0.35,
      Math.max(0.5, radius * 0.13),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
  ctx.beginPath();
  const lipCentre = mouth.reduce((sum, i) => sum + vertices[i]![1]! / mouth.length, 0);
  mouth.forEach((i, k) => {
    const v = vertices[i]!;
    const p = project(v[0]!, lipCentre + (v[1]! - lipCentre) * (0.22 + jaw * 0.78), v[2]!);
    if (!k) ctx.moveTo(p[0], p[1]);
    else ctx.lineTo(p[0], p[1]);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(2,8,13,.94)";
  ctx.fill();
  ctx.strokeStyle = "rgba(186,220,230,.28)";
  ctx.lineWidth = 0.65;
  ctx.stroke();
  // Tapered neck particles give the portrait a grounded silhouette.
  for (let row = 0; row < 25; row++)
    for (let col = -22; col <= 22; col++) {
      const y = -8.6 - row * 0.1,
        x = col * 0.13 * (1 + row / 65),
        z = -1.2 + Math.sqrt(Math.max(0, 1 - (col / 23) ** 2));
      const p = project(x, y, z),
        alpha = (1 - row / 25) * 0.15 * (0.6 + 0.4 * Math.cos(col / 22));
      ctx.fillStyle = `rgba(130,190,209,${alpha})`;
      ctx.fillRect(p[0], p[1], 0.6, 0.6);
    }
  const active = ["speaking", "listening", "thinking"].includes(mode),
    base = height - 18;
  for (let i = 0; i < 39; i++) {
    const envelope = Math.sin(((i + 1) / 40) * Math.PI);
    const h = active
      ? (2 + (mode === "speaking" ? jaw * 22 : 7) * Math.abs(Math.sin(t * 9 + i * 0.9))) * envelope
      : 1.5;
    ctx.fillStyle = `rgba(105,213,190,${active ? 0.75 : 0.25})`;
    ctx.fillRect(cx + (i - 19.5) * 3, base - h / 2, 1.4, h);
  }
}
