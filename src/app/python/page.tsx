import type { Metadata } from "next";
import PythonLab from "@/components/python/PythonLab";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Online Python Compiler | OutputTracer",
  description:
    "Write, run, and test Python code online with OutputTracer. Get quick results in your browser and practice programming without local setup.",
  alternates: {
    canonical: "/python",
  },
  openGraph: {
    title: "Online Python Compiler | OutputTracer",
    description:
      "Write, run, and test Python code online with OutputTracer. Practice programming in your browser without local setup.",
    siteName: "OutputTracer",
    type: "website",
    url: "https://outputtracer.com/python",
    images: [
      {
        url: "/brand/logo-tile.svg",
        width: 512,
        height: 512,
        alt: "OutputTracer Python 3 lab logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Online Python Compiler | OutputTracer",
    description:
      "Write, run, and test Python code online with OutputTracer. Practice programming in your browser without local setup.",
    images: ["/brand/logo-tile.svg"],
  },
};

export default function PythonPage() {
  return (
    <main className="flex h-screen w-full flex-col overflow-hidden bg-[#1E1E1E]">
      {/* Single primary heading; the lab UI is client-rendered. */}
      <h1 className="sr-only">Online Python Compiler</h1>
      <Header />
      <div className="flex-1 overflow-hidden">
        <PythonLab />
      </div>
    </main>
  );
}
