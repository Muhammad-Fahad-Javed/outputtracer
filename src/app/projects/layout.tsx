import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "All Projects | OutputTracer",
  description: "Your personal projects, shared work and classroom assignments in C++, Python and 8086 Assembly.",
  robots: { index: false, follow: false },
};

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
