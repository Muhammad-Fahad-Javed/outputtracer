import type { Metadata } from "next";

// The classroom hub and all classroom sub-routes require authentication to be
// useful. Keep the entire /classroom subtree out of the search index so that
// crawlers do not waste crawl budget on login walls or user-specific dashboards.
// Individual classroom pages are also excluded via robots.ts Disallow rules.
export const metadata: Metadata = {
  title: "Classroom | OutputTracer",
  robots: {
    index: false,
    follow: false,
  },
};

export default function ClassroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
