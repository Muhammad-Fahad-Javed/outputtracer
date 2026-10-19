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
    siteName: "OutputTracer",
    type: "website",
    url: "https://outputtracer.com/examples",
    images: [
      {
        url: "/brand/logo-tile.svg",
        width: 512,
        height: 512,
        alt: "OutputTracer C++ example programs",
      },
    ],
  },
};

export default function ExamplesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
