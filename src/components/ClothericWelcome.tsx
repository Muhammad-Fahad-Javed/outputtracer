"use client";

import Image from "next/image";
import { ArrowRight, ArrowUpRight, Code2, ShoppingBag } from "lucide-react";
import { useEffect, useRef } from "react";

export default function ClothericWelcome({ onContinue }: { onContinue: () => void }) {
  const continueButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { continueButton.current?.focus({ preventScroll: true }); }, []);

  return <section
    data-surface="light"
    aria-labelledby="clotheric-welcome-title"
    className="flex h-dvh w-full flex-col text-[#25251f]"
    style={{ backgroundColor: "#f5f2eb" }}
  >
    <header className="shrink-0 border-b border-[#e2ddd2] bg-white/80 px-5 py-4 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <span className="inline-flex items-center gap-2.5 text-sm font-semibold tracking-tight text-slate-900"><span className="rounded-lg bg-slate-900 p-1.5 text-white"><Code2 size={18} aria-hidden="true"/></span>OutputTracer</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-[#756b59]">Featured marketplace · Ad</span>
      </div>
    </header>

    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-8 sm:py-6">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col justify-center">
        <article className="grid overflow-hidden rounded-2xl border border-[#ddd4c3] bg-[#fffcf6] shadow-[0_18px_70px_-45px_rgba(53,40,15,0.4)] md:grid-cols-[1.05fr_1fr]">
          <div className="flex flex-col justify-center px-6 py-8 sm:px-10 sm:py-10 lg:px-12">
            <p className="mb-6 font-serif text-3xl tracking-[0.14em] text-[#8b733f] sm:text-4xl">CLOTHERIC</p>
            <h2 id="clotheric-welcome-title" className="font-serif text-4xl leading-[1.08] tracking-tight text-[#292820] sm:text-[2.75rem] lg:text-5xl">Your style.<br/>Your next find.</h2>
            <p className="mt-5 max-w-sm text-sm leading-7 text-[#635e52] sm:text-base">Discover streetwear, sportswear and everyday clothing from independent creators at Clotheric.</p>
            <a href="https://clotheric.com/" target="_blank" rel="noopener noreferrer sponsored" className="mt-7 inline-flex min-h-12 items-center justify-center gap-3 self-start rounded-lg bg-[#292820] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#494333] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#806b42]">
              <ShoppingBag size={17} aria-hidden="true"/>Shop now<ArrowUpRight size={16} aria-hidden="true"/><span className="sr-only"> at Clotheric (opens in a new tab)</span>
            </a>
            <p className="mt-4 text-xs tracking-wide text-[#635e52]">clotheric.com</p>
          </div>
          <div className="relative min-h-64 bg-[#e9dfce] md:min-h-[470px]">
            <Image src="/promotions/clotheric-editorial-v1.webp" alt="Navy T-shirt, ivory sweatshirt and folded sportswear arranged on warm stone display blocks" width={1122} height={1402} unoptimized loading="eager" fetchPriority="high" className="h-72 w-full object-cover object-[50%_48%] sm:h-96 md:absolute md:inset-0 md:h-full"/>
            <span className="absolute bottom-4 right-4 rounded-full border border-white/60 bg-[#fffaf0]/90 px-3 py-1.5 text-[10px] font-medium tracking-wide text-[#6b5e43]">The everyday edit</span>
          </div>
        </article>
        <p className="px-2 pt-4 text-center text-[11px] leading-5 text-[#635e52]">A featured promotion for Clotheric. Shopping opens in a separate tab.</p>
      </div>
    </div>

    <footer className="shrink-0 border-t border-[#ded8cb] bg-white px-4 py-4 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div className="hidden sm:block"><p className="text-sm font-semibold text-slate-900">Ready to code?</p><p className="mt-0.5 text-xs text-slate-500">Open your OutputTracer workspace.</p></div>
        <button ref={continueButton} onClick={onContinue} className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg bg-[#0f172a] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#263449] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#007acc] sm:w-auto sm:min-w-72">
          Continue to OUTPUTTRACER<ArrowRight size={18} aria-hidden="true"/>
        </button>
      </div>
    </footer>
  </section>;
}
