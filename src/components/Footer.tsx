"use client";
import {usePathname} from "next/navigation";
import Link from "next/link";

const FOOTER_LINKS = [
  { label: "Projects", href: "/projects" },
  { label: "Examples", href: "/examples" },
  { label: "Practice", href: "/practice" },
  { label: "Learn", href: "/learn" },
  { label: "About", href: "/about" },
];

export default function Footer() {
  const path=usePathname();
  const compact=/^\/(classroom|projects|groups|profile|admin|p)(\/|$)/.test(path||'') || path?.startsWith('/learn/dashboard');
  if(compact)return <footer data-surface="light" className="shrink-0 border-t px-5 py-2 text-[11px] text-gray-600"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2"><span>OutputTracer · DELTADISTORT · FAHAD & AADIL</span><nav aria-label="Footer" className="flex gap-4"><Link href="/projects">All Projects</Link><Link href="/learn">Learn</Link><Link href="/about">About</Link></nav></div></footer>;
  return (
    <footer data-surface="light" className="border-t border-[#DCDCDC]">
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-[15px] font-semibold tracking-tight text-black">OutputTracer</span>
            <p className="mt-1.5 text-sm text-[#666666]">
              Predict the output. Trace every step.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Footer">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="text-sm text-[#666666] transition-colors hover:text-black"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-col items-center justify-center gap-2 border-t border-[#EAEAEA] pt-6 pb-2 text-center">
          <p className="text-xs font-medium text-[#666666]">
            Developed at <span className="font-semibold text-black">DELTADISTORT</span> by <span className="font-semibold text-black">FAHAD & AADIL</span>
          </p>
          <p className="text-xs text-[#999999]">
            © 2026 OutputTracer. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
