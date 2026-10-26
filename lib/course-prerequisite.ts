export const prerequisiteMessage='선행 영상 수업을 먼저 예약하고, 종료 이후에 피드백 시간을 선택해 주세요. 선행 예약을 취소·이동하려면 연결된 피드백 예약부터 취소하거나 수정해 주세요.';
export function prerequisiteError(error:unknown):boolean{
 let current:any=error;for(let i=0;i<5&&current;i++,current=current.cause)if(String(current.message||current).includes('COURSE_PREREQUISITE'))return true;return false;
}
export type SequenceBooking={id?:string;course_id?:string;courseId?:string;date:string;start?:string;end:string;status?:string};
export function hasPrerequisite(prerequisite:string|null|undefined,date:string,start:string,bookings:SequenceBooking[],excludeId?:string,end?:string){
 const relevant=bookings.filter(b=>(b.course_id||b.courseId)===prerequisite&&(!excludeId||b.id!==excludeId)&&(!b.status||['confirmed','cancel_pending','change_pending'].includes(b.status)));
 if(prerequisite&&end&&relevant.some(b=>b.date===date&&b.start&&b.start<end&&b.end>start))return false;
 return !prerequisite||relevant.some(b=>(b.course_id||b.courseId)===prerequisite&&(!excludeId||b.id!==excludeId)&&(!b.status||['confirmed','cancel_pending','change_pending'].includes(b.status))&&(b.date<date||(b.date===date&&b.end<=start)));
}
