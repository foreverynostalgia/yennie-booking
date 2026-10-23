export const calendarLabelLimit=12;
export function validCalendarLabel(value:string){return value.length<=calendarLabelLimit&&!/[\u0000-\u001f\u007f]/.test(value)}
export function calendarBookingTitle(name:string,label?:string|null){const prefix=(label||'').trim();return prefix?`${prefix} · ${name}`:name}
