import type { Metadata } from "next";
import { AuthProvider } from "@/components/AuthProvider";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://outputtracer.com"),
  title: "Online C++ Compiler | OutputTracer",
  description:
    "Write and run C++ code online with OutputTracer. Trace execution step by step, inspect variables, debug programs, and practice C++ in your browser.",
  // NOTE: do not set `alternates.canonical` here. Next.js shallowly merges
  // metadata, so a root canonical is inherited by every route that does not
  // declare its own — and a relative canonical resolves against `metadataBase`
  // (not the current route), which made /assembly, /python, /learn/courses/*,
  // /login and others all claim to be duplicates of the homepage.
  // Each indexable route now declares its own self-referencing canonical.
  openGraph: {
    title: "Online C++ Compiler | OutputTracer",
    description:
      "Write and run C++ code online with OutputTracer. Trace execution step by step, inspect variables, debug programs, and practice C++ in your browser.",
    siteName: "OutputTracer",
    type: "website",
    url: "https://outputtracer.com",
    images: [
      {
        url: "/brand/logo-tile.svg",
        width: 512,
        height: 512,
        alt: "OutputTracer Online C++ Compiler and Tracer Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    images: ["/brand/logo-tile.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    google: "ArFSOkOn9GFsDDg6VLikwvgSxdnlDjj7-LGpTHOMR9Y",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              "name": "OutputTracer",
              "alternateName": "OutputTracer Online C++ Compiler",
              "url": "https://outputtracer.com/",
              "description": "Online C++ compiler, code runner, and step-by-step execution tracer."
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              "name": "OutputTracer",
              "url": "https://outputtracer.com/",
              "logo": "https://outputtracer.com/brand/logo-tile.svg"
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebApplication",
              "name": "OutputTracer Online C++ Compiler",
              "applicationCategory": "DeveloperApplication",
              "operatingSystem": "All modern browsers (Chrome, Firefox, Safari, Edge)",
              "browserRequirements": "Requires JavaScript. Supports standard C++17.",
              "url": "https://outputtracer.com/",
              "featureList": [
                "Write and run C++ code online",
                "Step-by-step execution tracing and timeline",
                "Interactive terminal with standard input/output",
                "Variable inspection and dry-run state tracking",
                "Curated output prediction practice questions"
              ]
            })
          }}
        />
      </head>
      <body className="antialiased bg-white text-black">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
