"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { ClassroomNotification } from "@/lib/classroom/communicationTypes";

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<ClassroomNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;

    const fetchNotifications = async () => {
      try {
        const res = await fetch("/api/classroom/notifications");
        if (!res.ok) return;
        const data = await res.json();
        if (active && data.success && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          setUnreadCount(data.notifications.filter((n: ClassroomNotification) => !n.isRead).length);
        }
      } catch {
        // Silently handle if unauthenticated or network failure
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await fetch("/api/classroom/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignored
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative rounded-[3px] p-1.5 text-black hover:bg-[#F2F2F2] transition-colors"
        aria-label="View notifications"
        title="Notifications"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-xl border border-[#DCDCDC] bg-white p-3 shadow-lg z-50">
          <div className="flex items-center justify-between pb-2 border-b border-[#F0F0F0]">
            <h4 className="text-xs font-bold text-black">Notifications</h4>
            <span className="text-[10px] text-[#777777]">{unreadCount} unread</span>
          </div>

          <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-[#F0F0F0]">
            {notifications.length === 0 ? (
              <p className="py-4 text-center text-xs text-[#888888]">No notifications yet</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && handleMarkRead(n.id)}
                  className={`py-2 px-1 text-xs cursor-pointer transition-colors ${
                    n.isRead ? "opacity-60" : "bg-blue-50/50 font-medium"
                  }`}
                >
                  <p className="font-semibold text-black">{n.title}</p>
                  <p className="text-[11px] text-[#666666] line-clamp-2 mt-0.5">{n.message}</p>
                  {n.link && (
                    <Link
                      href={n.link}
                      onClick={() => setOpen(false)}
                      className="inline-block mt-1 text-[10px] text-blue-600 hover:underline"
                    >
                      View &rarr;
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
