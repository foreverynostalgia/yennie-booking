import {NextRequest} from 'next/server';import {fail,json} from '@/lib/server';import {getStudentSession} from '@/lib/students';import {studentSessionReports} from '@/lib/class-sessions';
// The signed-in student's published 회차 report cards (성적표 · 수업자료).
export async function GET(req:NextRequest){try{const student=await getStudentSession(req);if(!student)return fail('예약 닉네임과 PIN으로 학생 확인을 해 주세요.',401);return json({nickname:student.nickname,reports:await studentSessionReports(student.id)})}catch{return fail('성적표를 불러오지 못했습니다.',503)}}
