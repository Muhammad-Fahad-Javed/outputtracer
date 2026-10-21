import type { Metadata } from "next";

// Utility pages, not content: keep the whole /login subtree out of the index.
// These routes are not covered by a `robots.txt` Disallow, so this directive is
// the only thing preventing them from being indexed.
export const metadata: Metadata = {
  title: "Sign In | OutputTracer",
  description:
    "Sign in to your OutputTracer account to access the C++ and Python labs, practice questions, and courses.",
  robots: {
    index: false,
    follow: true,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
