// The secret and the Site origin are substituted only in the admin-generated copy.
export const googleScriptTemplate = String.raw`// 옌쌤 과학 예약 ↔ Google Calendar. 이 코드 전체를 교체하세요.
const BOOKING_TOKEN = '__BOOKING_TOKEN__';
const BOOKING_SITE = '__BOOKING_SITE__';
const BOOKING_MARKER = 'YEBOOKING:';
const BOOKING_COLORS = [CalendarApp.EventColor.PALE_BLUE, CalendarApp.EventColor.PALE_GREEN, CalendarApp.EventColor.MAUVE, CalendarApp.EventColor.PALE_RED, CalendarApp.EventColor.YELLOW, CalendarApp.EventColor.ORANGE, CalendarApp.EventColor.CYAN, CalendarApp.EventColor.GRAY, CalendarApp.EventColor.BLUE, CalendarApp.EventColor.GREEN, CalendarApp.EventColor.RED];

// 한 번 실행하면 '학생 예약' 전용 캘린더를 연결하고 자동 동기화를 시작합니다.
function enableSimpleBooking() {
  const catalog = bookingRequest({action:'catalog'});
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('simple_booking_calendar_id');
  if (!id) {
    const calendars = CalendarApp.getCalendarsByName('학생 예약');
    if (calendars.length > 1) throw new Error('학생 예약 캘린더가 여러 개입니다. 같은 이름의 캘린더를 하나로 정리하세요.');
    const cal = calendars[0] || CalendarApp.createCalendar('학생 예약', {timeZone:'Asia/Seoul'});
    if (!cal.isOwnedByMe()) throw new Error('내 계정이 소유한 학생 예약 캘린더를 사용하세요.');
    props.setProperty('simple_booking_calendar_id',cal.getId());
  }
  console.log('학생 예약 캘린더에서 닉네임 + 일정 색상으로 예약하세요. ' + JSON.stringify(catalog.courses));
  enableCalendarSync();
}
// 사이트 수업별로 전용 캘린더를 생성·배정합니다. 이미 배정된 캘린더는 재사용합니다.
function enableCourseCalendars() {
  const catalog = bookingRequest({action:'catalog'}), props = PropertiesService.getScriptProperties();
  for (const course of catalog.courses) {
    const key = 'course_calendar_' + course.id;
    let id = course.calendarId || props.getProperty(key);
    if (!id) {
      const cal = CalendarApp.createCalendar('옌쌤 · ' + course.title,{timeZone:'Asia/Seoul'});
      id = cal.getId(); props.setProperty(key,id);
    }
    const cal = CalendarApp.getCalendarById(id);
    if (!cal || !cal.isOwnedByMe()) throw new Error(course.title + ': 내 계정이 소유한 캘린더에 연결하세요.');
    bookingRequest({action:'bind-calendar',courseId:course.id,calendarId:id});
    props.setProperty(key,id);
    console.log(course.title + ' → ' + cal.getName());
  }
  refreshCourseCalendars(); enableCalendarSync();
}
function refreshCourseCalendars() {
  const catalog = bookingRequest({action:'catalog'}), props = PropertiesService.getScriptProperties();
  const previous = JSON.parse(props.getProperty('course_calendar_history') || '[]');
  const courses = (catalog.courses || []).filter(course => course.calendarId);
  props.setProperty('course_calendar_bindings',JSON.stringify(courses));
  props.setProperty('course_calendar_history',JSON.stringify(Array.from(new Set(previous.concat(courses.map(course => course.calendarId))))));
  return courses;
}
function courseCalendarBindings() { return JSON.parse(PropertiesService.getScriptProperties().getProperty('course_calendar_bindings') || '[]'); }
function bookingCalendars() {
  const props = PropertiesService.getScriptProperties();
  const ids = JSON.parse(props.getProperty('course_calendar_history') || '[]');
  const calendars = ids.map(id => {const cal = CalendarApp.getCalendarById(id);if (!cal) throw new Error('이전에 연결한 수업 캘린더의 접근 권한을 확인하세요.');return cal;});
  return Array.from(new Map(calendars.concat([simpleBookingCalendar(),CalendarApp.getDefaultCalendar()].filter(Boolean)).map(cal => [cal.getId(),cal])).values());
}
function findBookingLocation(id) {
  if (!id) return null;
  for (const cal of bookingCalendars()) {const event = cal.getEventById(id);if (event) return {event:event,calendar:cal};}
  return null;
}
function simpleBookingCalendar() {
  const id = PropertiesService.getScriptProperties().getProperty('simple_booking_calendar_id');
  if (!id) return null;
  const cal = CalendarApp.getCalendarById(id);
  if (!cal) throw new Error('학생 예약 캘린더에 접근할 수 없습니다.');
  return cal;
}
function findBookingEvent(id) { const found = findBookingLocation(id);return found ? found.event : null; }
function bookingRegistrationError(event,message) {
  const description = String(event.getDescription() || '').replace(/(?:^|\n)예약 등록 오류:[^\n]*/g,'').trim();
  event.setDescription([description,'예약 등록 오류: ' + String(message).replace(/[\r\n]/g,' ').slice(0,400)].filter(Boolean).join('\n'));
}
function authorizeCalendar() { return CalendarApp.getDefaultCalendar().getName(); }
function bookingTime(date) { return Utilities.formatDate(date, 'Asia/Seoul', 'yyyy-MM-dd HH:mm').split(' '); }
function bookingAttendanceLine(event) {
  const match = String(event.getDescription() || '').match(/(?:^|\n)출결:\s*([^\n]*)/);
  return match ? match[1].trim() : '';
}
function bookingSignature(event) {
  return JSON.stringify([bookingTime(event.getStartTime()), bookingTime(event.getEndTime()), event.getTitle(), bookingAttendanceLine(event)]);
}
function bookingAttendance(event, previous) {
  const values = {'출석':'present','결석':'absent','지각':'late','사유 결석':'excused','미확인':'unmarked'};
  const title = String(event.getTitle() || ''), line = bookingAttendanceLine(event);
  const match = title.match(/\((출석|결석|지각|사유 결석|미확인)\)\s*$/);
  if (previous && previous.length > 2 && title !== previous[2]) return match ? values[match[1]] : 'unmarked';
  if (previous && previous.length > 3 && line !== previous[3]) {
    if (!line) return 'unmarked';
    if (!Object.prototype.hasOwnProperty.call(values,line)) throw new Error('출결은 출석·결석·지각·사유 결석·미확인 중 하나로 입력하세요.');
    return values[line];
  }
  return match ? values[match[1]] : values[line] || 'unmarked';
}
function setBookingAttendance(event, attendance) {
  const labels = {present:'출석',absent:'결석',late:'지각',excused:'사유 결석',unmarked:'미확인'};
  const description = String(event.getDescription() || '');
  const line = '출결: ' + labels[attendance];
  event.setDescription(/(?:^|\n)출결:[^\n]*/.test(description) ? description.replace(/(^|\n)출결:[^\n]*/, '$1' + line) : [description,line].filter(Boolean).join('\n'));
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
    if (p.action === 'diagnose') return ContentService.createTextOutput(JSON.stringify({ok:true,version:7,simpleBookingEnabled:!!PropertiesService.getScriptProperties().getProperty('simple_booking_calendar_id')})).setMimeType(ContentService.MimeType.JSON);
    if (!/^[a-f0-9-]{36}$/.test(String(p.bookingId))) throw new Error('예약 ID 오류');
    const lock = LockService.getScriptLock(); lock.waitLock(25000);
    try {
      const cal = p.calendarId ? CalendarApp.getCalendarById(p.calendarId) : simpleBookingCalendar() || CalendarApp.getDefaultCalendar(), props = PropertiesService.getScriptProperties();
      const key = 'booking_' + p.bookingId, snap = 'booking_snapshot_' + p.bookingId;
      const eventId = props.getProperty(key);
      if (!cal) throw new Error('수업에 배정된 캘린더를 열지 못했습니다. 캘린더 ID와 계정을 확인하세요.');
      const located = findBookingLocation(eventId);
      let event = located ? located.event : null;
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
        if (!event || located.calendar.getId() !== cal.getId()) {
          const old = event;
          const matches = cal.getEvents(start,end,{search:p.bookingMarker}).filter(item => bookingIdFrom(item) === p.bookingId);
          if (matches.length > 1) throw new Error('대상 캘린더에 같은 예약이 여러 개 있습니다. 중복 일정을 확인하세요.');
          event = matches[0] || cal.createEvent(title,start,end,{description:description});
          if (old) old.deleteEvent();
          props.setProperty(key,event.getId());
        }
        if (event) { event.setTitle(title); event.setTime(start, end); event.setDescription(description); }
        else { event = cal.createEvent(title, start, end, {description: description}); props.setProperty(key, event.getId()); }
        const colorIndex = Number(p.eventColor) - 1;
        if (Number.isInteger(colorIndex) && BOOKING_COLORS[colorIndex]) event.setColor(BOOKING_COLORS[colorIndex]);
        props.setProperty(snap, bookingSignature(event));
      } else throw new Error('지원하지 않는 동작');
      return ContentService.createTextOutput(JSON.stringify({ok:true,version:7,bookingId:p.bookingId})).setMimeType(ContentService.MimeType.JSON);
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
    const courseBindings = refreshCourseCalendars();
    const cal = CalendarApp.getDefaultCalendar(), props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    // The known event IDs are checked directly so moving an event out of the scan window is still seen.
    Object.keys(all).filter(key => /^booking_[a-f0-9-]{36}$/.test(key)).forEach(key => {
      const id = key.slice(8), event = findBookingEvent(all[key]);
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
          const attendance = bookingAttendance(event, JSON.parse(last));
          const result = bookingRequest({action:'update',eventId:event.getId(),bookingId:id,date:start[0],start:start[1],end:end[1],attendance:attendance});
          if (result.title) event.setTitle(result.title);
          setBookingAttendance(event,attendance);
          props.setProperty('booking_snapshot_' + id,bookingSignature(event));
        }
      } catch (error) { console.error('예약 ' + id + ': ' + String(error)); }
    });
    // New events must use an explicit title; ordinary personal calendar events are untouched.
    const from = new Date(Date.now() - 30 * 86400000), until = new Date(Date.now() + 365 * 86400000);
    const simple = simpleBookingCalendar(), simpleEvents = simple ? simple.getEvents(from,until) : [];
    const simpleIds = new Set(simpleEvents.map(event => event.getId()));
    const courseEventCalendars = new Map(), courseEvents = [];
    for (const binding of courseBindings) {
      const courseCal = CalendarApp.getCalendarById(binding.calendarId);
      if (!courseCal) throw new Error(binding.title + ': 수업 캘린더에 접근할 수 없습니다.');
      for (const event of courseCal.getEvents(from,until)) {courseEvents.push(event);courseEventCalendars.set(event.getId(),binding.calendarId);}
    }
    const events = Array.from(new Map(cal.getEvents(from,until).concat(simpleEvents,courseEvents).map(event => [event.getId(),event])).values());
    // Recover a newly added event if a previous run stopped after the Site accepted it.
    events.forEach(event => {
      const id = bookingIdFrom(event);
      if (id && !props.getProperty('booking_' + id)) {
        props.setProperty('booking_' + id,event.getId());
        props.setProperty('booking_snapshot_' + id,bookingSignature(event));
      }
    });
    events.filter(event => !bookingIdFrom(event) && (/^예약추가\s*\|/.test(event.getTitle()) || simpleIds.has(event.getId()) || courseEventCalendars.has(event.getId()))).forEach(event => {
      try {
        if (event.isAllDayEvent()) throw new Error('종일 일정 대신 시작·종료 시간을 설정하세요.');
        if (event.isRecurringEvent()) throw new Error('반복 일정 대신 예약 한 건씩 개별 일정으로 만들어 주세요.');
        const start = bookingTime(event.getStartTime()), end = bookingTime(event.getEndTime());
        if (start[0] !== end[0]) throw new Error('하루 안에서 끝나는 일정만 예약할 수 있습니다.');
        const assignedCalendar = courseEventCalendars.get(event.getId());
        const legacy = /^예약추가\s*\|/.test(event.getTitle());
        const result = bookingRequest(Object.assign({action:'create',eventId:event.getId(),title:event.getTitle(),date:start[0],start:start[1],end:end[1]}, legacy ? {} : {nickname:event.getTitle().trim(),colorId:String(event.getColor() || '')}, assignedCalendar ? {calendarId:assignedCalendar} : {}));
        event.setDescription([String(event.getDescription() || '').replace(/(?:^|\n)예약 등록 오류:[^\n]*/g,'').trim(),BOOKING_MARKER + result.bookingId].filter(Boolean).join('\n'));
        if (result.title) event.setTitle(result.title);
        if (result.colorId && BOOKING_COLORS[Number(result.colorId)-1]) event.setColor(BOOKING_COLORS[Number(result.colorId)-1]);
        props.setProperty('booking_' + result.bookingId,event.getId());
        props.setProperty('booking_snapshot_' + result.bookingId,bookingSignature(event));
      } catch (error) { bookingRegistrationError(event,error.message || error); console.error('새 일정 ' + event.getId() + ': ' + String(error)); }
    });
    bookingRequest({action:'heartbeat'});
  } finally { lock.releaseLock(); }
}`;
