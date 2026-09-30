/** Physical stride, independent of the decorative grid. Keep long trails bounded
 * by retaining their newest steps, rather than stretching footprints apart. */
export function footstepLayout(distance: number, widthFt: number, pxPerFoot: number) {
  const scale = Math.max(.3, Math.min(4, widthFt / 5));
  const stride = Math.max(1, 2.2 * scale * pxPerFoot);
  const count = Math.floor(distance / stride);
  return Array.from({length: Math.min(48, count)}, (_, i) => {
    const step = Math.max(0, count - 48) + i;
    return {fraction: (step + .5) * stride / distance, side: step % 2 ? -1 : 1};
  });
}
