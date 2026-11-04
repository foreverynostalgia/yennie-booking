export type StudentImport={nickname:string;name:string;school:string;academy?:string;grade:string;phone:string;parentPhone?:string;pin?:string};
const columns:Record<string,keyof StudentImport>={'닉네임':'nickname','이름':'name','학생명':'name','학교':'school','소속학원':'academy','학원':'academy',academy:'academy','학년':'grade','학생연락처':'phone','학부모연락처':'parentPhone','parentphone':'parentPhone','연락처':'phone','전화번호':'phone','예약pin':'pin','pin':'pin',nickname:'nickname',name:'name',school:'school',grade:'grade',phone:'phone'};
export function parseStudentImport(source:string):StudentImport[]{
 const text=source.replace(/^\uFEFF/,'');if(!text.trim())throw new Error('파일이 비어 있습니다.');
 const delimiter=text.split(/\r?\n/,1)[0].includes('\t')?'\t':',';
 const table:string[][]=[];let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else if(quoted)quoted=false;else if(!cell)quoted=true;else throw new Error('따옴표 형식을 확인해 주세요.')}else if(ch===delimiter&&!quoted){row.push(cell);cell=''}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))table.push(row);row=[];cell=''}else cell+=ch}
 if(quoted)throw new Error('닫히지 않은 따옴표가 있습니다.');row.push(cell);if(row.some(x=>x.trim()))table.push(row);
 const headers=(table.shift()||[]).map(x=>columns[x.trim().toLowerCase().replace(/\s/g,'')]);
 if(['nickname','name','school','grade','phone'].some(key=>!headers.includes(key as keyof StudentImport)))throw new Error('헤더에 닉네임, 이름, 학교, 학년, 연락처가 필요합니다. 양식을 내려받아 사용해 주세요.');
 if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length)throw new Error('중복된 열 제목이 있습니다.');
 if(!table.length||table.length>200)throw new Error('한 번에 1~200명을 업로드해 주세요.');
 return table.map((values,i)=>{if(values.length!==headers.length)throw new Error(`${i+2}행의 열 개수를 확인해 주세요.`);const result:any={};headers.forEach((key,j)=>{if(key)result[key]=values[j].trim()});return result});
}
export function credentialsCsv(rows:{nickname:string;pin:string}[]){const escape=(s:string)=>'"'+(/^[=+@\-]/.test(s)?"'":'')+s.replace(/"/g,'""')+'"';return '\uFEFF닉네임,예약PIN\r\n'+rows.map(r=>[r.nickname,r.pin].map(escape).join(',')).join('\r\n')}
