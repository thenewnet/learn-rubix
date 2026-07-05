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
