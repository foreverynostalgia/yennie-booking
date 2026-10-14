import type {Slot} from './schedules';

const minutes=(time:string)=>Number(time.slice(0,2))*60+Number(time.slice(3));
export const courseHourBounds=(day:number)=>day===5?{start:600,end:1320}:day>=0&&day<=4?{start:840,end:1320}:null;
export function withinRegistrationHours(slot:Slot){
 const bounds=courseHourBounds(slot.day);
 return !!bounds&&minutes(slot.start)>=bounds.start&&minutes(slot.end)<=bounds.end;
}
