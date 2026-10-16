// Two cars seen from above are rectangles, each turned to face where it is heading. They overlap unless some axis separates them
// (the separating-axis test); the axis with the least overlap is the shortest way out. Used by multiplayer car-on-car contact.
/** (dx, dz) is from the other car to this one. A and B are unit forward vectors [x, z]; hl/hw are half-lengths and half-widths.
 *  Returns null when apart, else { overlap, nx, nz } with n pointing from the other car towards this one. */
export function obbOverlap(dx, dz, A, B, mhl, mhw, thl, thw) {
  let overlap = Infinity, nx = 0, nz = 0;
  for (const [ax, az] of [[A[0], A[1]], [-A[1], A[0]], [B[0], B[1]], [-B[1], B[0]]]) {
    const rA = mhl * Math.abs(A[0] * ax + A[1] * az) + mhw * Math.abs(-A[1] * ax + A[0] * az);
    const rB = thl * Math.abs(B[0] * ax + B[1] * az) + thw * Math.abs(-B[1] * ax + B[0] * az);
    const d = dx * ax + dz * az, o = rA + rB - Math.abs(d);
    if (o <= 0) return null;
    if (o < overlap) { overlap = o; nx = d >= 0 ? ax : -ax; nz = d >= 0 ? az : -az; }
  }
  return { overlap, nx, nz };
}
