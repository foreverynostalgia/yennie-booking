type StudentName={name?:string|null;school?:string|null;nickname?:string|null;id?:string|null};
const collator=new Intl.Collator('ko-KR',{numeric:true,sensitivity:'base'});
/** Sort copies by actual Korean name; ties remain deterministic. */
export function compareStudentNames(a:StudentName,b:StudentName){for(const key of ['name','school','nickname','id'] as const){const order=collator.compare(String(a[key]||'').normalize('NFC').trim(),String(b[key]||'').normalize('NFC').trim());if(order)return order}return 0}
export function sortedStudents<T extends StudentName>(items:readonly T[]):T[]{return [...items].sort(compareStudentNames)}
