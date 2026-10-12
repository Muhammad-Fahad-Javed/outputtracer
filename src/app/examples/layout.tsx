import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "C++ Programming Examples & Code Snippets | OutputTracer",
  description:
    "Explore runnable C++ code examples covering basics, loops, pointers, functions, OOP, and data structures. Test and trace each example in our online compiler.",
  alternates: {
    canonical: "/examples",
  },
  openGraph: {
    title: "C++ Programming Examples & Code Snippets | OutputTracer",
    description:
      "Explore runnable C++ code examples. Test, execute, and trace each example online.",
    url: "https://outputtracer.com/examples",
  },
};

export default function ExamplesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
