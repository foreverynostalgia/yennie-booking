const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('lib/google-script-template.ts','utf8').split('String.raw`')[1].split('`;')[0];
const context={CalendarApp:{EventColor:{}},Utilities:{formatDate:()=> '2026-11-10 16:00'}};vm.createContext(context);vm.runInContext(source,context);
let title='A · 김학생',description='학교: 중학교\n출결: 미확인\nYEBOOKING:test';
const event={getTitle:()=>title,setTitle:x=>title=x,getDescription:()=>description,setDescription:x=>description=x,getStartTime:()=>new Date(),getEndTime:()=>new Date()};
let previous=JSON.parse(context.bookingSignature(event));
for(const [label,state] of [['출석','present'],['결석','absent'],['지각','late'],['사유 결석','excused']]){title=`A · 김학생 (${label})`;assert.equal(context.bookingAttendance(event,previous),state);context.setBookingAttendance(event,state);assert.ok(description.includes('출결: '+label));previous=JSON.parse(context.bookingSignature(event));}
title='A · 김학생';assert.equal(context.bookingAttendance(event,previous),'unmarked');context.setBookingAttendance(event,'unmarked');previous=JSON.parse(context.bookingSignature(event));
description=description.replace('출결: 미확인','출결: 지각');assert.equal(context.bookingAttendance(event,previous),'late');
assert.equal(context.bookingAttendance(event,previous.slice(0,2)),'late');
assert.ok(description.includes('YEBOOKING:test'));
console.log('PASS Apps Script title/description attendance detection, reset, snapshot upgrade and marker preservation');
