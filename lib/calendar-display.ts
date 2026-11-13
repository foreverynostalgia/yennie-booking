import {attendanceText} from './attendance';
export const calendarLabelLimit=12;
export function validCalendarLabel(value:string){return value.length<=calendarLabelLimit&&!/[\u0000-\u001f\u007f]/.test(value)}
export function calendarBookingTitle(name:string,label?:string|null,attendance?:string|null){const status=attendance&&attendance!=='unmarked'?attendanceText[attendance]:undefined;const student=status?`${name} (${status})`:name;return student}
