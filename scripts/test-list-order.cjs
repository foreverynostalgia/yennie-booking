const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(path){const module={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module.exports,module);return module.exports}
const {compareTitles,compareDates}=load('lib/list-order.ts'),{parseSchedules}=load('lib/schedules.ts');
assert.deepEqual([{title:'Z'},{title:'나'},{title:'A'},{title:'가'}].sort(compareTitles).map(x=>x.title),['가','나','A','Z']);
assert.deepEqual([{date:'2026-11-02',start:'10:00',name:'나'},{date:'2026-11-01',start:'12:00',name:'가'},{date:'2026-11-02',start:'09:00',name:'나'},{date:'2026-11-02',start:'10:00',name:'가'}].sort(compareDates).map(x=>x.date+' '+x.start+' '+x.name),['2026-11-01 12:00 가','2026-11-02 09:00 나','2026-11-02 10:00 가','2026-11-02 10:00 나']);
assert.deepEqual(parseSchedules([{day:6,start:'09:00',end:'10:00'},{day:0,start:'14:00',end:'15:00'},{day:0,start:'09:00',end:'10:00'}],{}).map(x=>x.day+' '+x.start),['0 09:00','0 14:00','6 09:00']);
console.log('PASS list order: Korean/A-Z, date/time/name, Monday-first schedules.');
