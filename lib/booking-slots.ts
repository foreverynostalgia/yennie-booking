import type {Slot} from './schedules';
export const isClinic=(title:string)=>title.includes('클리닉');
const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
const clock=(n:number)=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
export function bookingSlots(title:string,windows:Slot[]):Slot[]{
 if(!isClinic(title))return windows;
 const unique=new Map<string,Slot>();
 for(const window of windows)for(let n=minutes(window.start);n+60<=minutes(window.end);n+=30){const slot={day:window.day,start:clock(n),end:clock(n+60)};unique.set(`${slot.day}|${slot.start}|${slot.end}`,slot)}
 return [...unique.values()];
}
export type Occupancy={course_id:string;date:string;start:string;end:string;occupied:number};
export function peakOccupancy(rows:Occupancy[],id:string,date:string,start:string,end:string){
 const overlaps=rows.filter(x=>x.course_id===id&&x.date===date&&x.start<end&&x.end>start);
 return Math.max(0,...[start,...overlaps.map(x=>x.start).filter(x=>x>start)].map(point=>overlaps.filter(x=>x.start<=point&&x.end>point).reduce((n,x)=>n+x.occupied,0)));
}
// Evaluate simultaneous occupancy at the requested start and every existing start
// inside the interval. Endpoints are half-open, so adjacent reservations can meet.
export function peakOccupancySql(course:string,date:string,start:string,end:string,exclude="''"){
 return `(SELECT COALESCE(MAX((SELECT COUNT(*) FROM bookings occupied JOIN courses oc ON oc.id=occupied.course_id WHERE occupied.course_id=${course} AND occupied.date=${date} AND occupied.status IN ('confirmed','cancel_pending','change_pending') AND occupied.id<>${exclude} AND COALESCE(occupied.time_start,oc.start)<=points.at AND COALESCE(occupied.time_end,oc.end)>points.at)),0) FROM (SELECT ${start} AS at UNION SELECT COALESCE(point.time_start,pc.start) FROM bookings point JOIN courses pc ON pc.id=point.course_id WHERE point.course_id=${course} AND point.date=${date} AND point.status IN ('confirmed','cancel_pending','change_pending') AND point.id<>${exclude} AND COALESCE(point.time_start,pc.start)>${start} AND COALESCE(point.time_start,pc.start)<${end}) points)`;
}
