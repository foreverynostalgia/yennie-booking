import {NextRequest} from 'next/server';
import {db,fail,json} from '@/lib/server';
import {getStudentSession} from '@/lib/students';
import {accessibleVideo,type ReviewVideo} from '@/lib/review-videos';
export async function GET(req:NextRequest){try{const student=await getStudentSession(req);if(!student)return fail('예약 닉네임과 PIN으로 학생 확인을 해 주세요.',401);const requested=req.nextUrl.searchParams.get('id'),rows=requested?await db().prepare('SELECT * FROM review_videos WHERE id=? AND published=1').bind(requested).all<ReviewVideo>():await db().prepare('SELECT * FROM review_videos WHERE published=1 ORDER BY created_at DESC').all<ReviewVideo>();const videos=[];for(const row of rows.results)if(await accessibleVideo(student.id,row))videos.push({id:row.id,title:row.title,description:row.description,videoId:row.video_id,lessonNo:row.lesson_no});if(requested&&!videos.length)return fail('배부된 영상이 아닙니다.',404);return json({nickname:student.nickname,videos})}catch{return fail('복습 영상을 불러오지 못했습니다.',503)}}
