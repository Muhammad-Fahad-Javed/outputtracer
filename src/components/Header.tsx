"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import NotificationBell from "@/components/NotificationBell";
import {
  accountMenuFor,
  navLinksFor,
  roleBadge,
  type SessionRole,
} from "@/lib/sessionRole";

export default function Header() {
  const pathname = usePathname();
  const isAssembly = pathname?.startsWith("/assembly");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { user, isLoading, signOut } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [sessionRole, setSessionRole] = useState<SessionRole | null>(null);
  const [sessionSignedIn, setSessionSignedIn] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/session-role")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setSessionSignedIn(Boolean(data.signedIn));
        setSessionRole(data.role === "learner" || data.role === "teacher" || data.role === "admin" ? data.role : null);
        setIsAdmin(Boolean(data.isAdmin));
        setIsTeacher(Boolean(data.isVerifiedTeacher));
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user]);

  const signedIn = Boolean(user) || sessionSignedIn;
  const navLinks = navLinksFor({
    signedIn,
    role: sessionRole,
    isVerifiedTeacher: isTeacher,
    isAdmin,
  });
  const accountLinks = accountMenuFor({
    role: sessionRole,
    isVerifiedTeacher: isTeacher,
    isAdmin,
  });
  const badge = roleBadge({
    role: sessionRole,
    isVerifiedTeacher: isTeacher,
    isAdmin,
  });

  // Close account dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayName =
    user?.user_metadata?.display_name ||
    user?.email?.split("@")[0] ||
    "User";

  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-50 border-b border-[#DCDCDC] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-12 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="text-[14px] font-semibold tracking-tight text-black">
          OutputTracer
        </Link>

        <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`text-[13px] transition-opacity hover:opacity-55 ${
                pathname === link.href ? "font-semibold text-black underline underline-offset-4" : "text-[#000000]"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {isAssembly ? (
            <span className="rounded-[3px] border border-[#007ACC] bg-[#094771] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-white">
              8086 / DOS
            </span>
          ) : (
            <span className="rounded-[3px] border border-[#DCDCDC] bg-[#F2F2F2] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-black">
              C++
            </span>
          )}

          {!isLoading && (
            signedIn ? (
              <div className="flex items-center gap-2.5">
                <NotificationBell />

                {/* User Account Dropdown */}
                <div className="relative" ref={accountMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((v) => !v)}
                    aria-expanded={accountMenuOpen}
                    aria-haspopup="menu"
                    className="flex items-center gap-1.5 rounded-[4px] border border-[#DCDCDC] bg-white px-2 py-1 text-xs font-medium text-black hover:bg-[#F8F8F8] transition-colors"
                  >
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white shrink-0">
                      {initials}
                    </div>
                    <span className="max-w-[100px] truncate text-xs">{displayName}</span>
                    <ChevronDown size={12} className="text-[#888888]" />
                  </button>

                  {accountMenuOpen && (
                    <div className="absolute right-0 mt-1.5 w-52 rounded-xl border border-[#EAEAEA] bg-white py-1.5 shadow-lg text-xs z-50">
                      <div className="px-3 py-2 border-b border-[#F2F2F2]">
                        <p className="font-semibold text-black truncate">{displayName}</p>
                        <p className="text-[11px] text-[#888888] truncate">{user?.email}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span
                            className={`rounded-full px-1.5 py-0.2 text-[9px] font-bold ${
                              badge === "Admin"
                                ? "bg-amber-100 text-amber-800"
                                : badge === "Teacher"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {badge}
                          </span>
                        </div>
                      </div>

                      <div className="py-1">
                        {accountLinks.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-1.5 text-black hover:bg-[#F8F8F8]"
                          >
                            {item.label}
                          </Link>
                        ))}
                      </div>

                      <div className="border-t border-[#F2F2F2] pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setAccountMenuOpen(false);
                            void signOut();
                          }}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-rose-600 hover:bg-rose-50 text-left"
                        >
                          <LogOut size={13} /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <Link
                href="/login"
                className="rounded-[3px] bg-black px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-[#333333]"
              >
                Sign In
              </Link>
            )
          )}
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-[3px] p-1.5 text-black md:hidden"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </div>

      {menuOpen && (
        <div className="border-t border-[#DCDCDC] bg-white px-5 py-3 md:hidden">
          <nav className="flex flex-col gap-0.5" aria-label="Mobile">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-[3px] px-2 py-2.5 text-[14px] text-black transition-colors hover:bg-[#F2F2F2]"
              >
                {link.label}
              </Link>
            ))}

            {!isLoading && (
              <div className="mt-3 border-t border-[#DCDCDC] pt-3">
                {signedIn ? (
                  <div className="space-y-2">
                    <div className="px-2 py-1">
                      <p className="text-xs font-semibold text-black">{displayName}</p>
                      <p className="text-[11px] text-[#666666]">{user?.email}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#666666]">{badge}</p>
                    </div>

                    <div className="flex flex-col gap-1 text-xs">
                      {accountLinks.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className="rounded px-2 py-1.5 hover:bg-[#F2F2F2]"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        void signOut();
                        setMenuOpen(false);
                      }}
                      className="w-full mt-2 rounded-[3px] border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <Link
                    href="/login"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-[3px] bg-black px-3 py-2 text-center text-xs font-medium text-white hover:bg-[#333333]"
                  >
                    Sign In
                  </Link>
                )}
              </div>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
