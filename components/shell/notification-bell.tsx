"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return;
      const json = await res.json();
      setNotifications(json.notifications ?? []);
    } catch { /* silent */ }
  }, []);

  // Poll every 30 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const unread = notifications.filter((n) => !n.read_at);

  async function markRead(id: string) {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
    );
    await fetch(`/api/notifications/${id}/read`, { method: "PATCH" });
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
    await fetch("/api/notifications", { method: "PATCH" });
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative rounded-md p-2 transition-colors",
          open
            ? "bg-[--bg-tertiary] text-[--text-primary]"
            : "text-[--text-secondary] hover:bg-[--bg-secondary] hover:text-[--text-primary]"
        )}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[--accent] text-[10px] font-semibold text-white">
            {unread.length > 9 ? "9+" : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 rounded-md border border-[--border] bg-[--bg-primary] shadow">
          <div className="flex items-center justify-between border-b border-[--border] px-4 py-2.5">
            <span className="text-sm font-semibold text-[--text-primary]">Notifications</span>
            {unread.length > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-[--accent] hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[--border]">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-[--text-tertiary]">
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRead={() => markRead(n.id)}
                  onClose={() => setOpen(false)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification: n,
  onRead,
  onClose,
}: {
  notification: Notification;
  onRead: () => void;
  onClose: () => void;
}) {
  const isUnread = !n.read_at;

  function handleClick() {
    if (isUnread) onRead();
    onClose();
  }

  const inner = (
    <div
      className={cn(
        "px-4 py-3 transition-colors",
        isUnread ? "bg-[--accent-light]" : "hover:bg-[--bg-secondary]"
      )}
    >
      <div className="flex items-start gap-2">
        {isUnread && (
          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[--accent]" />
        )}
        <div className={isUnread ? "" : "pl-3.5"}>
          <p className="text-sm font-medium text-[--text-primary] leading-snug">{n.title}</p>
          {n.body && <p className="mt-0.5 text-xs text-[--text-secondary]">{n.body}</p>}
          <p className="mt-1 text-xs text-[--text-tertiary]">
            {new Date(n.created_at).toLocaleString("en-GB")}
          </p>
        </div>
      </div>
    </div>
  );

  if (n.link) {
    return (
      <Link href={n.link} onClick={handleClick}>
        {inner}
      </Link>
    );
  }

  return (
    <button className="w-full text-left" onClick={() => { if (isUnread) onRead(); }}>
      {inner}
    </button>
  );
}
