import {validDate} from './course-period';
// Administrators can choose any calendar date and an interval within that day.
export function validAdminBookingSchedule(date:string,start:string,end:string){
 const time=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
 return validDate(date)&&time.test(start)&&(time.test(end)||end==='24:00')&&start<end;
}
export const adminStartTimes=Array.from({length:96},(_,i)=>`${String(Math.floor(i/4)).padStart(2,'0')}:${String(i%4*15).padStart(2,'0')}`);
export const adminEndTimes=[...adminStartTimes.slice(1),'24:00'];
