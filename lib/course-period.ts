export function validDate(date:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
 const d=new Date(date+'T00:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===date;
}
export function withinCoursePeriod(date:string,start:string|null|undefined,end:string|null|undefined){
 return validDate(date)&&(!start||date>=start)&&(!end||date<=end);
}
