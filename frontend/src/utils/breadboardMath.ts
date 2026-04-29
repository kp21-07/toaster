export const pitch = 14.15;
export const paddingX = 26;
export const paddingY = 22;

export const validRowIndices = [
   1, 2, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 17, 18,
   21, 22, 24, 25, 26, 27, 28, 31, 32, 33, 34, 35, 37, 38
];

export const snapToHole = (x: number, y: number) => {
   let col = Math.round((x - paddingX) / pitch);
   col = Math.max(0, Math.min(62, col));
   const newX = paddingX + col * pitch;

   let closestRowY = paddingY;
   let minDiff = Infinity;
   validRowIndices.forEach(r => {
      const ry = paddingY + r * pitch;
      if (Math.abs(ry - y) < minDiff) {
         minDiff = Math.abs(ry - y);
         closestRowY = ry;
      }
   });
   return { x: newX, y: closestRowY };
};
