import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://outputtracer.dev"),
  title: "OutputTracer — Predict C++ Output. Trace Every Step.",
  description:
    "Paste your C++ code and predict what it will output. Understand execution step by step with a clear dry run.",
  openGraph: {
    title: "OutputTracer — Predict C++ Output. Trace Every Step.",
    description:
      "Paste your C++ code and predict what it will output. Understand execution step by step with a clear dry run.",
    siteName: "OutputTracer",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OutputTracer — Predict C++ Output. Trace Every Step.",
    description:
      "Paste your C++ code and predict what it will output. Understand execution step by step with a clear dry run.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-black">
        {children}
      </body>
    </html>
  );
}
