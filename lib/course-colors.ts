export const courseColors = ['#347BB2','#B34D73','#548647','#8060AD','#B87528','#258C88','#BD5945','#566FC1','#A3538E','#687D31'] as const;

// Older courses have no saved color. Give them a stable color until an admin chooses one.
export function courseColor(value: string | null | undefined, id: string): string {
  if (value && /^#[\da-fA-F]{6}$/.test(value)) return value;
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return courseColors[hash % courseColors.length];
}

// Google Calendar supports eleven event colors. Keep the ten built-in course
// swatches distinct; map custom colors to the nearest supported color.
export function googleEventColor(value: string | null | undefined, id: string): string {
  const color=courseColor(value,id).toUpperCase();
  const defaults=['7','4','10','3','6','2','11','9','1','5'];
  const index=courseColors.findIndex(x=>x.toUpperCase()===color);
  if(index>=0)return defaults[index];
  const palette=['#a4bdfc','#7ae7bf','#dbadff','#ff887c','#fbd75b','#ffb878','#46d6db','#e1e1e1','#5484ed','#51b749','#dc2127'];
  const rgb=(hex:string)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));
  const target=rgb(color);let best=0,distance=Infinity;
  palette.forEach((hex,i)=>{const d=rgb(hex).reduce((sum,n,k)=>sum+(n-target[k])**2,0);if(d<distance){distance=d;best=i}});
  return String(best+1);
}
