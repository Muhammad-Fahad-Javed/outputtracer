"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

const NAV_LINKS = [
  { label: "Projects", href: "/projects" },
  { label: "Practice", href: "/practice" },
  { label: "Learn", href: "/learn" },
];

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

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
              className="text-[13px] text-[#000000] transition-opacity hover:opacity-55"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:block">
          <span className="rounded-[3px] border border-[#DCDCDC] bg-[#F2F2F2] px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide text-black">
            C++
          </span>
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
          </nav>
        </div>
      )}
    </header>
  );
}
