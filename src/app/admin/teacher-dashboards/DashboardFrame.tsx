import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export function DashboardFrame({
  back,
  backLabel,
  title,
  description,
  children,
}: {
  back: string;
  backLabel: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[#FAFAFA] text-black">
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <Link href={back} className="inline-flex items-center gap-2 text-sm text-neutral-700 hover:underline">
          <ArrowLeft size={14} aria-hidden /> {backLabel}
        </Link>
        <div className="my-5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-900">
            <ShieldCheck size={14} aria-hidden /> Administrator view
          </span>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-neutral-700">{description}</p>
        </div>
        {children}
      </main>
      <Footer />
    </div>
  );
}

export function DashboardPager({ page, previous, next }: { page: number; previous?: string; next?: string }) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Result pages" className="mt-4 flex flex-wrap items-center gap-4 text-sm">
      {previous && <Link href={previous} prefetch={false} className="underline">Previous page</Link>}
      <span aria-current="page">Page {page}</span>
      {next && <Link href={next} prefetch={false} className="underline">Next page</Link>}
    </nav>
  );
}

export function DashboardNotice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <p role={error ? "alert" : undefined} className="rounded-xl border border-neutral-200 bg-white p-5 text-sm text-neutral-700">
      {children}
    </p>
  );
}
