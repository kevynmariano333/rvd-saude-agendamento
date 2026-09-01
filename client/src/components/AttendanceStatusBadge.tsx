import { attendanceStatusCopy, attendanceStatusTone, type AttendanceStatus } from "@/lib/attendance";
import { cn } from "@/lib/utils";

export default function AttendanceStatusBadge({
  status,
  className,
}: {
  status: AttendanceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
        attendanceStatusTone[status],
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {attendanceStatusCopy[status]}
    </span>
  );
}
