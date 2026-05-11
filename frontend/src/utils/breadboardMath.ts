export const pitch = 14.15;
export const paddingX = 26;
export const paddingY = 18;

export const validRowIndices = [
   1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 17, 18,
   21, 22, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 37, 38
];

// Convert a grid column index to a pixel X coordinate
export const colToPixelX = (col: number): number => paddingX + col * pitch;

// Convert a valid row index to a pixel Y coordinate
export const rowIndexToPixelY = (rowIndex: number): number => paddingY + rowIndex * pitch;

// Convert grid (col, rowIndex) -> pixel (x, y) — the canonical grid-to-pixel function
export const holeToPixel = (col: number, rowIndex: number): { x: number; y: number } => ({
   x: colToPixelX(col),
   y: rowIndexToPixelY(rowIndex),
});

// Find the nearest valid rowIndex for a given pixel y
export const pixelYToRowIndex = (y: number): number => {
   let best = validRowIndices[0];
   let minDiff = Infinity;
   validRowIndices.forEach(r => {
      const ry = paddingY + r * pitch;
      if (Math.abs(ry - y) < minDiff) {
         minDiff = Math.abs(ry - y);
         best = r;
      }
   });
   return best;
};

// Find the nearest valid column for a given pixel x
export const pixelXToCol = (x: number): number => {
   const col = Math.round((x - paddingX) / pitch);
   return Math.max(0, Math.min(62, col));
};

export const snapToHole = (x: number, y: number) => {
   const col = pixelXToCol(x);
   const rowIndex = pixelYToRowIndex(y);
   return { x: colToPixelX(col), y: rowIndexToPixelY(rowIndex) };
};
