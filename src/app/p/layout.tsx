import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Project Workspace | OutputTracer",
  description: "A collaborative coding workspace with shared files and a private program console.",
  robots: { index: false, follow: false },
};

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  return children;
}
