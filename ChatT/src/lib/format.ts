import { formatDistanceToNowStrict, format, isToday, isYesterday } from "date-fns";

export function formatMessageTime(iso: string) {
  return format(new Date(iso), "h:mm a");
}

export function formatDayDivider(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "MMMM d, yyyy");
}

export function formatLastSeen(iso: string | null) {
  if (!iso) return "Offline";
  const distance = formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  return `Last seen ${distance}`;
}
