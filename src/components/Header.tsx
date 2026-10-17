"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  User,
  ShieldCheck,
  GraduationCap,
  BookOpen,
  LogOut,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import NotificationBell from "@/components/NotificationBell";

const NAV_LINKS = [
  { label: "8086 Assembly", href: "/assembly" },
  { label: "Projects", href: "/projects" },
  { label: "Practice", href: "/practice" },
  { label: "Learn", href: "/learn" },
  { label: "Classroom", href: "/classroom" },
];

export default function Header() {
  const pathname = usePathname();
  const isAssembly = pathname?.startsWith("/assembly");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const { user, isLoading, signOut } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);

  useEffect(() => {
    if (!user) {
      setIsAdmin(false);
      setIsTeacher(false);
      return;
    }

    let active = true;
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active && data?.profile) {
          setIsAdmin(Boolean(data.profile.isAdmin));
          setIsTeacher(Boolean(data.profile.isVerifiedTeacher));
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [user]);

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
          {NAV_LINKS.map((link) => (
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
            user ? (
              <div className="flex items-center gap-2.5">
                <NotificationBell />

                {/* User Account Dropdown */}
                <div className="relative" ref={accountMenuRef}>
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((v) => !v)}
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
                        <p className="text-[11px] text-[#888888] truncate">{user.email}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {isAdmin && (
                            <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800">
                              Admin
                            </span>
                          )}
                          {isTeacher && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[9px] font-bold text-emerald-800">
                              Teacher
                            </span>
                          )}
                          <span className="rounded-full bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-blue-800">
                            Learner
                          </span>
                        </div>
                      </div>

                      <div className="py-1">
                        <Link
                          href="/profile"
                          onClick={() => setAccountMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-1.5 text-black hover:bg-[#F8F8F8]"
                        >
                          <User size={13} className="text-[#666666]" /> My Profile
                        </Link>
                        <Link
                          href="/classroom/student"
                          onClick={() => setAccountMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-1.5 text-black hover:bg-[#F8F8F8]"
                        >
                          <BookOpen size={13} className="text-[#666666]" /> Student Dashboard
                        </Link>
                        <Link
                          href="/classroom"
                          onClick={() => setAccountMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-1.5 text-black hover:bg-[#F8F8F8]"
                        >
                          <GraduationCap size={13} className="text-[#666666]" /> Teacher Studio
                        </Link>
                        {isAdmin && (
                          <Link
                            href="/admin"
                            onClick={() => setAccountMenuOpen(false)}
                            className="flex items-center gap-2 px-3 py-1.5 text-black hover:bg-[#F8F8F8] font-semibold text-amber-900"
                          >
                            <ShieldCheck size={13} className="text-amber-700" /> Admin Center
                          </Link>
                        )}
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
            {NAV_LINKS.map((link) => (
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
                {user ? (
                  <div className="space-y-2">
                    <div className="px-2 py-1">
                      <p className="text-xs font-semibold text-black">{displayName}</p>
                      <p className="text-[11px] text-[#666666]">{user.email}</p>
                    </div>

                    <div className="flex flex-col gap-1 text-xs">
                      <Link
                        href="/profile"
                        onClick={() => setMenuOpen(false)}
                        className="rounded px-2 py-1.5 hover:bg-[#F2F2F2]"
                      >
                        My Profile
                      </Link>
                      <Link
                        href="/classroom/student"
                        onClick={() => setMenuOpen(false)}
                        className="rounded px-2 py-1.5 hover:bg-[#F2F2F2]"
                      >
                        Student Dashboard
                      </Link>
                      <Link
                        href="/classroom"
                        onClick={() => setMenuOpen(false)}
                        className="rounded px-2 py-1.5 hover:bg-[#F2F2F2]"
                      >
                        Teacher Studio
                      </Link>
                      {isAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="rounded px-2 py-1.5 font-semibold text-amber-900 hover:bg-amber-50"
                        >
                          Admin Center
                        </Link>
                      )}
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
