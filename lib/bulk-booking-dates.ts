import {validDate} from './course-period';
export function bulkBookingDates(from:string,until:string,weekday?:number){
 if(!validDate(from)||!validDate(until)||from>until)throw Error('예약 시작일·종료일을 확인하세요.');
 if(weekday!==undefined&&(!Number.isInteger(weekday)||weekday<0||weekday>6))throw Error('반복 요일을 확인하세요.');
 const a=new Date(from+'T00:00:00Z'),b=new Date(until+'T00:00:00Z');
 if((b.getTime()-a.getTime())/86400000>366)throw Error('한 번에 최대 1년 범위로 생성하세요.');
 const dates:string[]=[];for(let d=a;d<=b;d=new Date(d.getTime()+86400000))if(weekday===undefined||d.getUTCDay()===weekday)dates.push(d.toISOString().slice(0,10));
 if(!dates.length)throw Error('기간 안에 선택한 요일이 없습니다.');return dates;
}
