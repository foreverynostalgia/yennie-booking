ALTER TABLE `courses` ADD `prerequisite_course_id` text;

--> statement-breakpoint
CREATE TRIGGER prerequisite_booking_insert AFTER INSERT ON bookings
BEGIN
 SELECT RAISE(ABORT,'COURSE_PREREQUISITE') WHERE EXISTS (SELECT 1 FROM bookings b JOIN courses c ON c.id=b.course_id
WHERE c.prerequisite_course_id IS NOT NULL AND b.status IN ('confirmed','cancel_pending','change_pending')
AND (NOT EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND (p.status!='change_pending' OR p.requested_date<b.date OR (p.requested_date=b.date AND p.requested_end<=COALESCE(b.time_start,c.start))) AND (p.date<b.date OR (p.date=b.date AND COALESCE(p.time_end,pc.end)<=COALESCE(b.time_start,c.start))))
OR (b.status='change_pending' AND NOT EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND (p.status!='change_pending' OR p.requested_date<b.requested_date OR (p.requested_date=b.requested_date AND p.requested_end<=b.requested_start)) AND (p.date<b.requested_date OR (p.date=b.requested_date AND COALESCE(p.time_end,pc.end)<=b.requested_start)))) OR EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND ((p.date=b.date AND COALESCE(p.time_start,pc.start)<COALESCE(b.time_end,c.end) AND COALESCE(p.time_end,pc.end)>COALESCE(b.time_start,c.start))
OR (b.status='change_pending' AND p.date=b.requested_date AND COALESCE(p.time_start,pc.start)<b.requested_end AND COALESCE(p.time_end,pc.end)>b.requested_start)))));
END;

--> statement-breakpoint
CREATE TRIGGER prerequisite_booking_update AFTER UPDATE OF course_id,date,time_start,time_end,name,phone,student_id,status,requested_date,requested_start,requested_end ON bookings
BEGIN
 SELECT RAISE(ABORT,'COURSE_PREREQUISITE') WHERE EXISTS (SELECT 1 FROM bookings b JOIN courses c ON c.id=b.course_id
WHERE c.prerequisite_course_id IS NOT NULL AND b.status IN ('confirmed','cancel_pending','change_pending')
AND (NOT EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND (p.status!='change_pending' OR p.requested_date<b.date OR (p.requested_date=b.date AND p.requested_end<=COALESCE(b.time_start,c.start))) AND (p.date<b.date OR (p.date=b.date AND COALESCE(p.time_end,pc.end)<=COALESCE(b.time_start,c.start))))
OR (b.status='change_pending' AND NOT EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND (p.status!='change_pending' OR p.requested_date<b.requested_date OR (p.requested_date=b.requested_date AND p.requested_end<=b.requested_start)) AND (p.date<b.requested_date OR (p.date=b.requested_date AND COALESCE(p.time_end,pc.end)<=b.requested_start)))) OR EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND ((p.date=b.date AND COALESCE(p.time_start,pc.start)<COALESCE(b.time_end,c.end) AND COALESCE(p.time_end,pc.end)>COALESCE(b.time_start,c.start))
OR (b.status='change_pending' AND p.date=b.requested_date AND COALESCE(p.time_start,pc.start)<b.requested_end AND COALESCE(p.time_end,pc.end)>b.requested_start)))));
END;

--> statement-breakpoint
CREATE TRIGGER prerequisite_booking_delete AFTER DELETE ON bookings
BEGIN
 SELECT RAISE(ABORT,'COURSE_PREREQUISITE') WHERE EXISTS (SELECT 1 FROM bookings b JOIN courses c ON c.id=b.course_id
WHERE c.prerequisite_course_id IS NOT NULL AND b.status IN ('confirmed','cancel_pending','change_pending')
AND (NOT EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND (p.status!='change_pending' OR p.requested_date<b.date OR (p.requested_date=b.date AND p.requested_end<=COALESCE(b.time_start,c.start))) AND (p.date<b.date OR (p.date=b.date AND COALESCE(p.time_end,pc.end)<=COALESCE(b.time_start,c.start))))
OR (b.status='change_pending' AND NOT EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND (p.status!='change_pending' OR p.requested_date<b.requested_date OR (p.requested_date=b.requested_date AND p.requested_end<=b.requested_start)) AND (p.date<b.requested_date OR (p.date=b.requested_date AND COALESCE(p.time_end,pc.end)<=b.requested_start)))) OR EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND ((p.date=b.date AND COALESCE(p.time_start,pc.start)<COALESCE(b.time_end,c.end) AND COALESCE(p.time_end,pc.end)>COALESCE(b.time_start,c.start))
OR (b.status='change_pending' AND p.date=b.requested_date AND COALESCE(p.time_start,pc.start)<b.requested_end AND COALESCE(p.time_end,pc.end)>b.requested_start)))));
END;

--> statement-breakpoint
CREATE TRIGGER prerequisite_course_rule AFTER UPDATE OF prerequisite_course_id,start,end ON courses
BEGIN
 SELECT RAISE(ABORT,'COURSE_PREREQUISITE') WHERE EXISTS (SELECT 1 FROM bookings b JOIN courses c ON c.id=b.course_id
WHERE c.prerequisite_course_id IS NOT NULL AND b.status IN ('confirmed','cancel_pending','change_pending')
AND (NOT EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND (p.status!='change_pending' OR p.requested_date<b.date OR (p.requested_date=b.date AND p.requested_end<=COALESCE(b.time_start,c.start))) AND (p.date<b.date OR (p.date=b.date AND COALESCE(p.time_end,pc.end)<=COALESCE(b.time_start,c.start))))
OR (b.status='change_pending' AND NOT EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND (p.status!='change_pending' OR p.requested_date<b.requested_date OR (p.requested_date=b.requested_date AND p.requested_end<=b.requested_start)) AND (p.date<b.requested_date OR (p.date=b.requested_date AND COALESCE(p.time_end,pc.end)<=b.requested_start)))) OR EXISTS (SELECT 1 FROM bookings p JOIN courses pc ON pc.id=p.course_id
WHERE p.id<>b.id AND p.course_id=c.prerequisite_course_id
AND ((b.student_id IS NOT NULL AND p.student_id=b.student_id) OR (p.name=b.name AND p.phone=b.phone))
AND p.status IN ('confirmed','cancel_pending','change_pending')
AND ((p.date=b.date AND COALESCE(p.time_start,pc.start)<COALESCE(b.time_end,c.end) AND COALESCE(p.time_end,pc.end)>COALESCE(b.time_start,c.start))
OR (b.status='change_pending' AND p.date=b.requested_date AND COALESCE(p.time_start,pc.start)<b.requested_end AND COALESCE(p.time_end,pc.end)>b.requested_start)))));
END;
--> statement-breakpoint
CREATE TRIGGER prerequisite_course_cycle BEFORE UPDATE OF prerequisite_course_id ON courses
WHEN NEW.prerequisite_course_id IS NOT NULL
BEGIN
 SELECT RAISE(ABORT,'COURSE_PREREQUISITE') WHERE NEW.prerequisite_course_id=NEW.id OR EXISTS (
 WITH RECURSIVE ancestors(id) AS (SELECT NEW.prerequisite_course_id UNION SELECT c.prerequisite_course_id FROM courses c JOIN ancestors a ON c.id=a.id WHERE c.prerequisite_course_id IS NOT NULL)
 SELECT 1 FROM ancestors WHERE id=NEW.id
 );
END;
