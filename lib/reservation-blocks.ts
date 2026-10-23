export type BlockScope='all'|'include'|'exclude';
export type ReservationBlock = {id:string;course_id:string|null;scope_mode?:BlockScope;course_ids?:string|string[];date:string;start:string;end:string;reason?:string};
export function blockCourseIds(value:ReservationBlock['course_ids']):string[]{try{const ids=typeof value==='string'?JSON.parse(value):value;return Array.isArray(ids)?ids.filter(x=>typeof x==='string'):[]}catch{return []}}
export function blockApplies(block:ReservationBlock,courseId:string){const ids=blockCourseIds(block.course_ids);return block.scope_mode==='include'?ids.includes(courseId):block.scope_mode==='exclude'?!ids.includes(courseId):true}
export function reservationBlocked(blocks:ReservationBlock[],courseId:string,date:string,start:string,end:string){
 return blocks.some(b=>b.date===date&&blockApplies(b,courseId)&&b.start<end&&b.end>start);
}
export function blockAppliesSql(courseExpression:string){return `(rb.scope_mode='all' OR (rb.scope_mode='include' AND EXISTS (SELECT 1 FROM json_each(rb.course_ids) blocked_course WHERE blocked_course.value=${courseExpression})) OR (rb.scope_mode='exclude' AND NOT EXISTS (SELECT 1 FROM json_each(rb.course_ids) blocked_course WHERE blocked_course.value=${courseExpression})))`}
