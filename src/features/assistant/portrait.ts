import { vertices, triangles } from "./face-mesh";
import type { Articulation } from "./voice";
export type FaceMode = "idle" | "listening" | "thinking" | "speaking" | "error";
type Point = [number, number, number];
let seed = 127;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const points: Point[] = vertices.map((v) => [v[0]!, v[1]!, v[2]!] as Point);
for (const face of triangles) {
  const a = vertices[face[0]!]!,
    b = vertices[face[1]!]!,
    c = vertices[face[2]!]!,
    u = b.map((x, i) => x - a[i]!),
    v = c.map((x, i) => x - a[i]!);
  const cross = [
    u[1]! * v[2]! - u[2]! * v[1]!,
    u[2]! * v[0]! - u[0]! * v[2]!,
    u[0]! * v[1]! - u[1]! * v[0]!,
  ];
  for (let j = 0, n = Math.max(2, Math.ceil(Math.hypot(...cross) * 18)); j < n; j++) {
    let p = random(),
      q = random();
    if (p + q > 1) {
      p = 1 - p;
      q = 1 - q;
    }
    points.push(a.map((x, i) => x + u[i]! * p + v[i]! * q) as Point);
  }
}
const contours = [
  [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
    148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109, 10,
  ],
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33],
  [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362],
  [61, 40, 37, 0, 267, 270, 291, 321, 314, 17, 84, 91, 61],
  [78, 81, 82, 13, 312, 311, 308, 402, 317, 14, 87, 178, 78],
  [168, 6, 197, 195, 5, 4, 1, 19, 94, 2],
];
const dust = Array.from({ length: 65 }, () => [random(), random(), random()]);
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  mode: FaceMode,
  reduced = false,
  articulation: Articulation = { jaw: 0, round: 0, width: 1 },
) {
  const t = reduced ? 0 : time / 1000,
    scale = Math.min(width / 16.7, height / 22),
    cx = width * 0.5,
    cy = height * 0.5,
    yaw =
      -0.2 +
      Math.sin(t * 0.31) * 0.11 +
      Math.sin(t * 0.67) * 0.035 +
      (mode === "speaking" && !reduced ? articulation.jaw * 0.035 : 0),
    pitch =
      0.045 +
      Math.sin(t * 0.27) * 0.035 +
      (mode === "speaking" && !reduced ? articulation.jaw * 0.04 : 0);
  const jaw = mode === "speaking" && !reduced ? articulation.jaw : 0,
    round = mode === "speaking" ? articulation.round : 0;
  ctx.clearRect(0, 0, width, height);
  function project(x: number, y: number, z: number): Point {
    const lip = Math.exp(-(((y + 4.4) / 1.5) ** 2)) * Math.exp(-((x / 3.1) ** 4)),
      lower = Math.max(0, Math.min(1, (-y - 3.9) / 1.2));
    x *= 0.93;
    x *= 1 - 0.1 * Math.max(0, Math.min(1, (-y - 2) / 7));
    x *= 1 + lip * ((mode === "speaking" ? articulation.width : 1) - 1);
    z += lip * round * 0.6;
    y += 0.32 * Math.exp(-(((y + 4.6) / 0.8) ** 2)) * Math.exp(-((x * x) / 6)) * (1 - jaw);
    y += 0.18 * Math.exp(-(((Math.abs(x) - 2) / 0.7) ** 2)) * Math.exp(-(((y + 4.3) / 0.8) ** 2));
    y -= jaw * 1.6 * lower * Math.exp(-((x / 5.6) ** 4));
    z -= jaw * 0.35 * lower;
    if (y > 3.5) y = 3.5 + (y - 3.5) * 1.35;
    const eye = Math.exp(-(((Math.abs(x) - 3.2) / 1.5) ** 4));
    const blink = reduced ? 0 : Math.exp(-((((t % 5.8) - 5.55) / 0.075) ** 2));
    if (y > 1.8 && y < 3.5) y = 2.65 + (y - 2.65) * (1 - blink * eye * 0.85);
    const xx = x * Math.cos(yaw) + (z - 3) * Math.sin(yaw),
      zz = (z - 3) * Math.cos(yaw) - x * Math.sin(yaw),
      yy = (y + 0.5) * Math.cos(pitch) - zz * Math.sin(pitch),
      perspective = 1 + zz * 0.012;
    return [cx + xx * scale * perspective, cy - yy * scale * perspective, zz];
  }
  // Translucent coloured facets and moving highlights, reconstructed from the reference's glass phase.
  const palette = [
    "33,225,209",
    "74,167,255",
    "244,74,131",
    "85,237,171",
    "181,119,255",
    "255,207,116",
  ];
  const glass = reduced ? 0 : Math.pow(0.5 + 0.5 * Math.sin(t * 0.55 - 1.4), 6);
  triangles.forEach((f, i) => {
    const a = vertices[f[0]!]!,
      b = vertices[f[1]!]!,
      c = vertices[f[2]!]!;
    const p = project(a[0]!, a[1]!, a[2]!),
      q = project(b[0]!, b[1]!, b[2]!),
      r = project(c[0]!, c[1]!, c[2]!);
    const phase = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.73);
    const coloured = i % 23 === 0;
    const ux = b[0]! - a[0]!,
      uy = b[1]! - a[1]!,
      uz = b[2]! - a[2]!,
      vx = c[0]! - a[0]!,
      vy = c[1]! - a[1]!,
      vz = c[2]! - a[2]!,
      nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx,
      length = Math.hypot(nx, ny, nz) || 1;
    const light = Math.max(
      0,
      Math.abs((nx * Math.sin(t * 0.22) * 0.4 + ny * 0.2 + nz * 0.84) / length),
    );
    const shine = light ** 18;
    ctx.fillStyle = coloured
      ? `rgba(${palette[i % palette.length]},${glass * (0.35 + phase * 0.5)})`
      : `rgba(195,229,246,${0.008 + light * 0.018 + shine * 0.16 + glass * 0.025})`;
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.lineTo(r[0], r[1]);
    ctx.closePath();
    ctx.fill();
  });
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = `rgba(233,244,248,${0.06 + glass * 0.23})`;
  ctx.beginPath();
  for (const f of triangles) {
    for (let k = 0; k < 3; k++) {
      const a = vertices[f[k]!]!,
        b = vertices[f[(k + 1) % 3]!]!,
        p = project(a[0]!, a[1]!, a[2]!),
        q = project(b[0]!, b[1]!, b[2]!);
      ctx.moveTo(p[0], p[1]);
      ctx.lineTo(q[0], q[1]);
    }
  }
  ctx.stroke();
  ctx.fillStyle = "#030509";
  for (const eye of [contours[1]!, contours[2]!]) {
    ctx.beginPath();
    eye.forEach((index, i) => {
      const a = vertices[index]!,
        p = project(a[0]!, a[1]!, a[2]!);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fill();
  }
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    if (((Math.abs(a[0]) - 3.16) / 1.13) ** 2 + ((a[1] - 2.64) / 0.23) ** 2 < 1) continue;
    const p = project(a[0], a[1], a[2]),
      brightness = 0.43 + (i % 7) / 18;
    ctx.fillStyle = `rgba(244,250,255,${brightness})`;
    ctx.beginPath();
    ctx.arc(p[0], p[1], (0.55 + (i % 5) * 0.13) * (width < 220 ? 0.75 : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(248,253,255,.73)";
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  for (const contour of contours) {
    contour.forEach((index, i) => {
      const a = vertices[index]!,
        p = project(a[0]!, a[1]!, a[2]!);
      if (i === 0) ctx.moveTo(p[0], p[1]);
      else ctx.lineTo(p[0], p[1]);
    });
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(203,227,238,.24)";
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (const [x, y, s] of dust) {
    const yy = reduced ? y! : (y! + t * 0.008 * s!) % 1;
    ctx.moveTo(x! * width, yy * height);
    ctx.lineTo(x! * width + 1 + s! * 2, yy * height - 2 - s! * 4);
  }
  ctx.stroke();
  const active = mode === "speaking" || mode === "listening" || mode === "thinking",
    base = height - 14;
  for (let i = 0; i < 39; i++) {
    const envelope = Math.sin(((i + 1) / 40) * Math.PI),
      h = active
        ? (2 + (mode === "speaking" ? jaw * 22 : 8) * Math.abs(Math.sin(t * 9 + i * 0.9))) *
          envelope
        : 1.5;
    ctx.fillStyle = `rgba(46,238,162,${active ? 0.85 : 0.25})`;
    ctx.fillRect(cx + (i - 19.5) * 3, base - h / 2, 1.4, h);
  }
}
