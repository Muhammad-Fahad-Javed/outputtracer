import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found | OutputTracer",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center px-5 py-16">
      <p className="text-xs font-semibold uppercase tracking-wider text-[#666666]">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">This page does not exist</h1>
      <p className="mt-3 text-sm leading-relaxed text-[#666666]">
        The address may be out of date. The compiler, practice questions, and courses are still available.
      </p>
      <div className="mt-6 flex gap-4 text-sm font-medium">
        <Link href="/" className="underline decoration-[#DCDCDC] underline-offset-4 hover:decoration-black">
          Compiler
        </Link>
        <Link href="/practice" className="underline decoration-[#DCDCDC] underline-offset-4 hover:decoration-black">
          Practice
        </Link>
        <Link href="/learn" className="underline decoration-[#DCDCDC] underline-offset-4 hover:decoration-black">
          Learn
        </Link>
      </div>
    </main>
  );
}
