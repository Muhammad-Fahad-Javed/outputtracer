import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "C++ Examples | OutputTracer",
  description: "Browse sample C++ programs and try them in our C++ online compiler.",
};

export default function ExamplesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
