"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
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
  const { user, isLoading, signOut } = useAuth();

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
                <span
                  className="max-w-[130px] truncate text-xs font-mono text-[#555555]"
                  title={user.email ?? ""}
                >
                  {user.user_metadata?.display_name || user.email?.split("@")[0]}
                </span>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="rounded-[3px] border border-[#DCDCDC] px-2.5 py-1 text-xs font-medium text-black transition-colors hover:bg-[#F2F2F2]"
                >
                  Sign Out
                </button>
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
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="truncate text-xs font-mono text-[#666666]">
                      {user.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => { void signOut(); setMenuOpen(false); }}
                      className="rounded-[3px] border border-[#DCDCDC] px-2.5 py-1 text-xs font-medium text-black hover:bg-[#F2F2F2]"
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
