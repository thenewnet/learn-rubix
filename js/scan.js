// scan.js — detect the nine sticker colours of a cube face from a photo.
// This is an assist: the user can always correct the grid by hand afterwards.

// Classify an RGB colour into one of the six cube colours via HSV.
export function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const v = mx / 255;
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  let h = 0;
  const d = mx - mn;
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  // whites: washed-out, bright
  if (s < 0.22 && v > 0.45) return 'W';
  if (v < 0.18) return 'B'; // very dark -> treat as blue-ish, user can fix
  if (h < 18 || h >= 345) return 'R';
  if (h < 42) return 'O';
  if (h < 72) return 'Y';
  if (h < 170) return 'G';
  if (h < 265) return 'B';
  return 'R';
}

// ---- corner view: read THREE faces from one photo -------------------------
// A single photo shows the three faces meeting at a corner. We model the cube's
// silhouette as a hexagon (centre = near corner) split into three rhombi, and
// bilinearly sample each rhombus into an n×n grid.

// Six outer vertices + centre of a pointy-top hexagon (screen coords, y down).
export function hexVertices({ cx, cy, R, rot = 0 }) {
  const pt = (deg) => {
    const a = (deg + rot) * Math.PI / 180;
    return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
  };
  return {
    T: pt(-90), UR: pt(-30), LR: pt(30), Bo: pt(90), LL: pt(150), UL: pt(210), Ce: [cx, cy],
  };
}

// The three visible rhombi. Each is [A, B, C, D] going around; sampling treats
// A as origin, A→B as columns, A→D as rows.
export function faceQuads(h) {
  return {
    top: [h.UL, h.T, h.UR, h.Ce],   // top face (U / D)
    left: [h.LL, h.UL, h.Ce, h.Bo], // lower-left face (F / B)
    right: [h.Ce, h.UR, h.LR, h.Bo], // lower-right face (R / L)
  };
}

// Projective map of the unit square to a quad [p0,p1,p2,p3] at the unit corners
// (0,0),(1,0),(1,1),(0,1). Correctly handles perspective foreshortening.
function quadMapper(p0, p1, p2, p3) {
  const [x0, y0] = p0, [x1, y1] = p1, [x2, y2] = p2, [x3, y3] = p3;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let a, b, c, d, e, f, g, h;
  if (Math.abs(dx3) < 1e-6 && Math.abs(dy3) < 1e-6) {
    a = x1 - x0; b = x3 - x0; c = x0; d = y1 - y0; e = y3 - y0; f = y0; g = 0; h = 0;
  } else {
    const den = dx1 * dy2 - dx2 * dy1;
    g = (dx3 * dy2 - dx2 * dy3) / den;
    h = (dx1 * dy3 - dx3 * dy1) / den;
    a = x1 - x0 + g * x1; b = x3 - x0 + h * x3; c = x0;
    d = y1 - y0 + g * y1; e = y3 - y0 + h * y3; f = y0;
  }
  return (u, v) => { const w = g * u + h * v + 1; return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]; };
}

function sampleQuad(ctx, quad, n) {
  const [A, B, C, D] = quad;
  const map = quadMapper(A, B, C, D);
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const rad = 5;
  const grid = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      let [x, y] = map((c + 0.5) / n, (r + 0.5) / n);
      // keep the sample window fully inside the canvas so getImageData never throws
      x = Math.max(rad, Math.min(W - rad, Number.isFinite(x) ? x : W / 2));
      y = Math.max(rad, Math.min(H - rad, Number.isFinite(y) ? y : H / 2));
      const data = ctx.getImageData(x - rad, y - rad, rad * 2, rad * 2).data;
      // median-ish: average, which is fine for solid stickers
      let R = 0, G = 0, Bl = 0, cnt = 0;
      for (let i = 0; i < data.length; i += 4) { R += data[i]; G += data[i + 1]; Bl += data[i + 2]; cnt++; }
      row.push(classify(R / cnt, G / cnt, Bl / cnt));
    }
    grid.push(row);
  }
  return grid;
}

// Rotate an n×n grid by 90° clockwise `times` times (used to align a rhombus to
// the standard face orientation).
export function rotateGrid(g, times) {
  let out = g.map((row) => row.slice());
  const n = g.length;
  for (let t = 0; t < ((times % 4) + 4) % 4; t++) {
    const nx = Array.from({ length: n }, () => new Array(n));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) nx[c][n - 1 - r] = out[r][c];
    out = nx;
  }
  return out;
}

// Draw an image into a square canvas of `size` px and return its 2D context.
export function imageToCtx(img, size) {
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2, sy = (img.naturalHeight - s) / 2;
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  return ctx;
}

// Try to locate the cube in the photo automatically and return a starting
// hexagon frame. Works by finding the largest blob of vivid (saturated) pixels
// — i.e. the coloured cube — and fitting a hexagon to it. Returns null if it
// can't find a confident blob (then the caller keeps the default centred frame).
export function autoFitHex(ctx, size) {
  const G = 72;                     // coarse grid for speed + noise immunity
  const cell = size / G;
  const data = ctx.getImageData(0, 0, size, size).data;
  const vivid = new Uint8Array(G * G);
  for (let gy = 0; gy < G; gy++) {
    for (let gx = 0; gx < G; gx++) {
      const x = Math.min(size - 1, Math.floor((gx + 0.5) * cell));
      const y = Math.min(size - 1, Math.floor((gy + 0.5) * cell));
      const i = (y * size + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = mx === 0 ? 0 : (mx - mn) / mx, v = mx / 255;
      if (s > 0.33 && v > 0.22) vivid[gy * G + gx] = 1;
    }
  }
  // largest 4-connected component of vivid cells
  const seen = new Uint8Array(G * G);
  let best = [], bestN = 0;
  for (let start = 0; start < G * G; start++) {
    if (!vivid[start] || seen[start]) continue;
    const q = [start]; seen[start] = 1; const comp = [start];
    for (let h = 0; h < q.length; h++) {
      const cur = q[h], cx = cur % G, cy = (cur / G) | 0;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of nb) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || nx >= G || ny < 0 || ny >= G) continue;
        const ni = ny * G + nx;
        if (vivid[ni] && !seen[ni]) { seen[ni] = 1; q.push(ni); comp.push(ni); }
      }
    }
    if (comp.length > bestN) { bestN = comp.length; best = comp; }
  }
  if (bestN < 24) return null;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const c of best) {
    const px = ((c % G) + 0.5) * cell, py = (((c / G) | 0) + 0.5) * cell;
    if (px < minX) minX = px; if (px > maxX) maxX = px;
    if (py < minY) minY = py; if (py > maxY) maxY = py;
  }
  const w = maxX - minX, h = maxY - minY;
  if (w < size * 0.12 || h < size * 0.12) return null;
  // hexagon height ≈ 2R, width ≈ √3 R; fit to the blob and clamp
  const R = Math.min(size * 0.49, Math.max(h * 0.52, w / 1.7));
  return hexVertices({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, R });
}

// Sample the three rhombi of a corner view. Returns { top, left, right } grids.
export function sampleCorner(ctx, params, n) {
  return sampleCornerHex(ctx, hexVertices(params), n);
}

// Sample from an explicit set of hexagon vertices (used by the alignable overlay,
// so the frame can match any perspective the photo was taken at).
export function sampleCornerHex(ctx, h, n) {
  const q = faceQuads(h);
  return { top: sampleQuad(ctx, q.top, n), left: sampleQuad(ctx, q.left, n), right: sampleQuad(ctx, q.right, n) };
}

// All the sample-point pixel coordinates, for drawing the overlay preview.
export function samplePoints(h, n) {
  const q = faceQuads(h);
  const pts = { top: [], left: [], right: [] };
  for (const key of ['top', 'left', 'right']) {
    const map = quadMapper(...q[key]);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) pts[key].push(map((c + 0.5) / n, (r + 0.5) / n));
  }
  return pts;
}

// Detect an n×n grid of colour letters from a loaded HTMLImageElement.
export function detectGrid(img, n) {
  const size = 240;
  const cv = document.createElement('canvas');
  cv.width = size; cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - s) / 2;
  const sy = (img.naturalHeight - s) / 2;
  ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size);
  const grid = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) {
      const cx = (c + 0.5) * size / n;
      const cy = (r + 0.5) * size / n;
      const rad = Math.max(3, (size / n) * 0.22);
      const data = ctx.getImageData(cx - rad, cy - rad, rad * 2, rad * 2).data;
      let R = 0, G = 0, B = 0, cnt = 0;
      for (let i = 0; i < data.length; i += 4) { R += data[i]; G += data[i + 1]; B += data[i + 2]; cnt++; }
      row.push(classify(R / cnt, G / cnt, B / cnt));
    }
    grid.push(row);
  }
  return grid;
}
