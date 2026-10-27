import {NextRequest} from 'next/server';
import {db,fail,json,sameOrigin,future} from '@/lib/server';
import {getBookingStudent} from '@/lib/reservation-session';
import {validDate,withinCoursePeriod} from '@/lib/course-period';
import {acceptsGrade} from '@/lib/course-grades';
import {bookingSlots} from '@/lib/booking-slots';
import {parseSchedules} from '@/lib/schedules';
import {hasPrerequisite,type SequenceBooking} from '@/lib/course-prerequisite';
export async function POST(req:NextRequest){
 if(!sameOrigin(req))return fail('요청을 확인할 수 없습니다.',403);
 try{const s=await getBookingStudent(req);if(!s)return fail('닉네임으로 접속해 주세요.',401);
 const x=await req.json() as any,date=String(x.date||''),courseId=String(x.courseId||'');if(!validDate(date))return fail('날짜를 확인해 주세요.');
 const course=await db().prepare('SELECT * FROM courses WHERE id=? AND active=1').bind(courseId).first<any>();if(!course||!acceptsGrade(course.target_grades,s.grade)||!withinCoursePeriod(date,course.start_date,course.end_date))return json({allowedStarts:[]});
 const cart=Array.isArray(x.cart)?x.cart:[];if(cart.length>100)return fail('예약 목록을 확인해 주세요.');
 if(cart.some((b:any)=>!b||typeof b.courseId!=='string'||!validDate(b.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.end)||b.start>=b.end))return fail('예약 목록을 확인해 주세요.');
 const existing=await db().prepare("SELECT b.course_id,b.date,COALESCE(b.time_start,c.start) AS start,COALESCE(b.time_end,c.end) AS end,b.status FROM bookings b JOIN courses c ON c.id=b.course_id WHERE (b.student_id=? OR (b.student_id IS NULL AND b.name=? AND b.phone=?)) AND b.status IN ('confirmed','cancel_pending','change_pending')").bind(s.id,s.name,s.phone).all<SequenceBooking>();
 const day=(new Date(date+'T12:00:00+09:00').getUTCDay()+6)%7;
 const slots=bookingSlots(course.title,parseSchedules(course.schedules,{day:course.day,start:course.start,end:course.end}),course.booking_minutes).filter(slot=>slot.day===day&&future(date,slot.start)&&hasPrerequisite(course.prerequisite_course_id,date,slot.start,[...existing.results,...cart],undefined,slot.end));
 // Return selectable starts only, never existing booking IDs or schedules.
 return json({allowedStarts:slots.map(slot=>slot.start)});
 }catch{return fail('예약 가능한 시간을 확인하지 못했습니다.',503)}
}
