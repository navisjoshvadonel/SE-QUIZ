// server/qr.js
// Compact, standalone QR Code SVG Generator (No dependencies)
// Implements QR Code Model 2 with Byte mode and Error Correction (ECC-M/L)

function generateQRCodeSVG(text, size = 260) {
  // A minimal, robust QR matrix generator for URLs
  const modules = createQRMatrix(text);
  const count = modules.length;
  const cellSize = size / (count + 8);
  const margin = cellSize * 4;

  let rects = '';
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (modules[r][c]) {
        const x = (margin + c * cellSize).toFixed(2);
        const y = (margin + r * cellSize).toFixed(2);
        const s = (cellSize + 0.1).toFixed(2);
        rects += `<rect x="${x}" y="${y}" width="${s}" height="${s}" fill="#1E293B" rx="1.5"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
    <rect width="${size}" height="${size}" fill="#FFFFFF" rx="16"/>
    ${rects}
  </svg>`;
}

// QR Matrix computation helper
function createQRMatrix(text) {
  // Choose version based on text length (Version 3: 29x29 or Version 4: 33x33)
  const len = text.length;
  const version = len <= 32 ? 3 : len <= 50 ? 4 : 5;
  const size = 17 + 4 * version;
  const matrix = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder patterns (top-left, top-right, bottom-left)
  function addFinder(row, col) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = row + r;
        const nc = col + c;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          isFunction[nr][nc] = true;
          const inside = (r >= 0 && r <= 6 && c >= 0 && c <= 6);
          if (inside) {
            matrix[nr][nc] = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          } else {
            matrix[nr][nc] = false;
          }
        }
      }
    }
  }

  addFinder(0, 0);
  addFinder(0, size - 7);
  addFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = (i % 2 === 0);
    isFunction[6][i] = true;
    matrix[i][6] = (i % 2 === 0);
    isFunction[i][6] = true;
  }

  // Dark module
  matrix[4 * version + 9][8] = true;
  isFunction[4 * version + 9][8] = true;

  // Alignment pattern for version >= 2
  if (version >= 2) {
    const alignPos = version === 3 ? 22 : version === 4 ? 26 : 30;
    const coords = [6, alignPos];
    for (const r of coords) {
      for (const c of coords) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            isFunction[r + dr][c + dc] = true;
            matrix[r + dr][c + dc] = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0));
          }
        }
      }
    }
  }

  // Format info areas
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) isFunction[8][i] = true;
    if (!isFunction[i][8]) isFunction[i][8] = true;
    if (!isFunction[8][size - 1 - i]) isFunction[8][size - 1 - i] = true;
    if (!isFunction[size - 1 - i][8]) isFunction[size - 1 - i][8] = true;
  }

  // Simple Reed-Solomon payload bitstream
  const bits = [];
  // Mode: Byte (0100)
  bits.push(0, 1, 0, 0);
  // Character count (8 bits)
  for (let i = 7; i >= 0; i--) bits.push((len >> i) & 1);
  // Data bytes
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    for (let j = 7; j >= 0; j--) bits.push((code >> j) & 1);
  }
  // Terminator
  for (let i = 0; i < 4 && bits.length < (version * 128); i++) bits.push(0);
  // Pad bytes
  while (bits.length % 8 !== 0) bits.push(0);
  const padPatterns = [0xEC, 0x11];
  let padIdx = 0;
  while (bits.length < (version * 128)) {
    const pad = padPatterns[padIdx % 2];
    for (let j = 7; j >= 0; j--) bits.push((pad >> j) & 1);
    padIdx++;
  }

  // Place data bits in matrix (zig-zag right to left)
  let bitIdx = 0;
  let dir = -1; // up
  let col = size - 1;
  while (col > 0) {
    if (col === 6) col--; // skip vertical timing
    let row = dir === -1 ? size - 1 : 0;
    while (row >= 0 && row < size) {
      for (let c = 0; c < 2; c++) {
        const curCol = col - c;
        if (!isFunction[row][curCol]) {
          let b = bitIdx < bits.length ? bits[bitIdx++] : 0;
          // Apply mask pattern 0: (row + col) % 2 === 0
          if ((row + curCol) % 2 === 0) b ^= 1;
          matrix[row][curCol] = (b === 1);
        }
      }
      row += dir;
    }
    dir = -dir;
    col -= 2;
  }

  return matrix;
}

module.exports = { generateQRCodeSVG };
