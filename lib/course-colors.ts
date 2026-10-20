export const courseColors = ['#347BB2','#B34D73','#548647','#8060AD','#B87528','#258C88','#BD5945','#566FC1','#A3538E','#687D31'] as const;

// Older courses have no saved color. Give them a stable color until an admin chooses one.
export function courseColor(value: string | null | undefined, id: string): string {
  if (value && /^#[\da-fA-F]{6}$/.test(value)) return value;
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return courseColors[hash % courseColors.length];
}
