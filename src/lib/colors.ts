/**
 * Segment color palette. Mid-saturation hues chosen to read clearly on the
 * dark `#0B0F17` background without overpowering the video.
 */
export const SEGMENT_COLORS = [
  "#38BDF8", // sky
  "#A78BFA", // violet
  "#34D399", // emerald
  "#FBBF24", // amber
  "#F472B6", // pink
  "#22D3EE", // cyan
  "#FB923C", // orange
  "#A3E635", // lime
] as const;

/** Returns the palette color for the n-th created segment (cycles). */
export function colorForIndex(index: number): string {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}
