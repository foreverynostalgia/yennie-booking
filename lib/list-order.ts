export const listCollator=new Intl.Collator('ko-KR',{numeric:true,sensitivity:'base'});
export function compareTitles(a:{title:string},b:{title:string}){return listCollator.compare(a.title,b.title)}
export function compareDates(a:{date:string;start:string;name?:string;title?:string},b:{date:string;start:string;name?:string;title?:string}){return a.date.localeCompare(b.date)||a.start.localeCompare(b.start)||listCollator.compare(a.name||a.title||'',b.name||b.title||'')}
