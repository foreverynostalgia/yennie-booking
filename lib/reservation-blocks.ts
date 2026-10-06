export type ReservationBlock = {id:string;course_id:string|null;date:string;start:string;end:string;reason?:string};
export function reservationBlocked(blocks:ReservationBlock[],courseId:string,date:string,start:string,end:string){
 return blocks.some(b=>b.date===date&&(!b.course_id||b.course_id===courseId)&&b.start<end&&b.end>start);
}
