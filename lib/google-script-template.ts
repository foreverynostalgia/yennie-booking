// The secret and the Site origin are substituted only in the admin-generated copy.
export const googleScriptTemplate = String.raw`// 옌쌤 과학 예약 ↔ Google Calendar. 이 코드 전체를 교체하세요.
const BOOKING_TOKEN = '__BOOKING_TOKEN__';
const BOOKING_SITE = '__BOOKING_SITE__';
const BOOKING_MARKER = 'YEBOOKING:';
const BOOKING_COLORS = [CalendarApp.EventColor.PALE_BLUE, CalendarApp.EventColor.PALE_GREEN, CalendarApp.EventColor.MAUVE, CalendarApp.EventColor.PALE_RED, CalendarApp.EventColor.YELLOW, CalendarApp.EventColor.ORANGE, CalendarApp.EventColor.CYAN, CalendarApp.EventColor.GRAY, CalendarApp.EventColor.BLUE, CalendarApp.EventColor.GREEN, CalendarApp.EventColor.RED];

function authorizeCalendar() { return CalendarApp.getDefaultCalendar().getName(); }
function bookingTime(date) { return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd HH:mm').split(' '); }
function bookingSignature(event) {
  return JSON.stringify([bookingTime(event.getStartTime()), bookingTime(event.getEndTime())]);
}
function bookingRequest(change) {
  const response = UrlFetchApp.fetch(BOOKING_SITE + '/api/calendar/inbound', {
    method: 'post', contentType: 'application/json', headers: {'x-ye-calendar-token': BOOKING_TOKEN},
    payload: JSON.stringify(change), muteHttpExceptions: true
  });
  let result;
  try { result = JSON.parse(response.getContentText()); } catch (_) { throw new Error('예약 사이트 응답을 확인하지 못했습니다.'); }
  if (response.getResponseCode() !== 200 || !result.ok) throw new Error(result.error || '예약 사이트 반영 실패');
  return result;
}
function bookingIdFrom(event) {
  const match = String(event.getDescription() || '').match(/YEBOOKING:([a-f0-9-]{36})/);
  return match ? match[1] : null;
}
function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);
    if (p.token !== BOOKING_TOKEN) throw new Error('인증 코드가 일치하지 않습니다.');
    if (!/^[a-f0-9-]{36}$/.test(String(p.bookingId))) throw new Error('예약 ID 오류');
    const lock = LockService.getScriptLock(); lock.waitLock(25000);
    try {
      const cal = CalendarApp.getDefaultCalendar(), props = PropertiesService.getScriptProperties();
      const key = 'booking_' + p.bookingId, snap = 'booking_snapshot_' + p.bookingId;
      const eventId = props.getProperty(key);
      let event = eventId ? cal.getEventById(eventId) : null;
      if (p.action === 'delete') {
        if (event) event.deleteEvent();
        props.deleteProperty(key); props.deleteProperty(snap);
      } else if (p.action === 'upsert') {
        const start = new Date(p.date + 'T' + p.start + ':00+09:00');
        const end = new Date(p.date + 'T' + p.end + ':00+09:00');
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) throw new Error('예약 날짜·시간 오류');
        const title = p.eventTitle || p.name;
        const description = ['학교: ' + p.school, '학년: ' + p.grade, '출결: ' + p.attendance,
          p.status === 'cancel_pending' ? '취소 승인 대기' : p.status === 'change_pending' ? '변경 승인 대기' : '',
          p.status === 'change_pending' && p.requestedDate ? '변경 요청: ' + p.requestedDate + ' ' + p.requestedStart + '–' + p.requestedEnd : '',
          p.bookingMarker].filter(Boolean).join('\n');
        if (event) { event.setTitle(title); event.setTime(start, end); event.setDescription(description); }
        else { event = cal.createEvent(title, start, end, {description: description}); props.setProperty(key, event.getId()); }
        const colorIndex = Number(p.eventColor) - 1;
        if (Number.isInteger(colorIndex) && BOOKING_COLORS[colorIndex]) event.setColor(BOOKING_COLORS[colorIndex]);
        props.setProperty(snap, bookingSignature(event));
      } else throw new Error('지원하지 않는 동작');
      return ContentService.createTextOutput(JSON.stringify({ok:true,version:3,bookingId:p.bookingId})).setMimeType(ContentService.MimeType.JSON);
    } finally { lock.releaseLock(); }
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ok:false,error:String(err.message || err)})).setMimeType(ContentService.MimeType.JSON);
  }
}

// 한 번 실행하면 5분 간격 자동 점검이 설치됩니다. 기존 트리거는 중복 설치하지 않습니다.
function enableCalendarSync() {
  const triggers = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'syncCalendarChanges');
  if (!triggers.length) ScriptApp.newTrigger('syncCalendarChanges').timeBased().everyMinutes(5).create();
  syncCalendarChanges();
}
function syncCalendarChanges() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    const cal = CalendarApp.getDefaultCalendar(), props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    // The known event IDs are checked directly so moving an event out of the scan window is still seen.
    Object.keys(all).filter(key => /^booking_[a-f0-9-]{36}$/.test(key)).forEach(key => {
      const id = key.slice(8), event = cal.getEventById(all[key]);
      try {
        if (!event) {
          bookingRequest({action:'delete',eventId:all[key],bookingId:id});
          props.deleteProperty(key); props.deleteProperty('booking_snapshot_' + id);
          return;
        }
        const sig = bookingSignature(event), last = all['booking_snapshot_' + id];
        if (!last) { props.setProperty('booking_snapshot_' + id,sig); return; }
        if (sig !== last) {
          const start = bookingTime(event.getStartTime()), end = bookingTime(event.getEndTime());
          if (start[0] !== end[0]) throw new Error('하루 안에서 끝나는 일정만 예약할 수 있습니다.');
          const result = bookingRequest({action:'update',eventId:event.getId(),bookingId:id,date:start[0],start:start[1],end:end[1]});
          if (result.title) event.setTitle(result.title);
          props.setProperty('booking_snapshot_' + id,sig);
        }
      } catch (error) { console.error('예약 ' + id + ': ' + String(error)); }
    });
    // New events must use an explicit title; ordinary personal calendar events are untouched.
    const from = new Date(Date.now() - 30 * 86400000), until = new Date(Date.now() + 365 * 86400000);
    const events = cal.getEvents(from,until);
    // Recover a newly added event if a previous run stopped after the Site accepted it.
    events.forEach(event => {
      const id = bookingIdFrom(event);
      if (id && !props.getProperty('booking_' + id)) {
        props.setProperty('booking_' + id,event.getId());
        props.setProperty('booking_snapshot_' + id,bookingSignature(event));
      }
    });
    events.filter(event => /^예약추가\s*\|/.test(event.getTitle()) && !bookingIdFrom(event)).forEach(event => {
      try {
        const start = bookingTime(event.getStartTime()), end = bookingTime(event.getEndTime());
        if (start[0] !== end[0]) throw new Error('하루 안에서 끝나는 일정만 예약할 수 있습니다.');
        const result = bookingRequest({action:'create',eventId:event.getId(),title:event.getTitle(),date:start[0],start:start[1],end:end[1]});
        event.setDescription([event.getDescription(),BOOKING_MARKER + result.bookingId].filter(Boolean).join('\n'));
        if (result.title) event.setTitle(result.title);
        if (result.colorId && BOOKING_COLORS[Number(result.colorId)-1]) event.setColor(BOOKING_COLORS[Number(result.colorId)-1]);
        props.setProperty('booking_' + result.bookingId,event.getId());
        props.setProperty('booking_snapshot_' + result.bookingId,bookingSignature(event));
      } catch (error) { console.error('새 일정 ' + event.getId() + ': ' + String(error)); }
    });
  } finally { lock.releaseLock(); }
}`;
