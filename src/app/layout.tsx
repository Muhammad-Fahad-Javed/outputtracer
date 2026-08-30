import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://outputtracer.devs.surf"),
  title: "C++ Online Compiler – Run C++ Code Online | OutputTracer",
  description:
    "Run C++ code online with OutputTracer. A fast, free C++ online compiler and code runner for students, developers, and programming practice.",
  alternates: {
    canonical: "https://outputtracer.devs.surf",
  },
  openGraph: {
    title: "C++ Online Compiler | OutputTracer",
    description: "Write, compile, and run C++ code online with OutputTracer.",
    siteName: "OutputTracer",
    type: "website",
    url: "https://outputtracer.devs.surf",
  },
  twitter: {
    card: "summary_large_image",
    title: "C++ Online Compiler | OutputTracer",
    description: "Write, compile, and run C++ code online with OutputTracer.",
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
              "url": "https://outputtracer.devs.surf/"
            })
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              "name": "OutputTracer C++ Online Compiler",
              "applicationCategory": "DeveloperApplication",
              "operatingSystem": "Any",
              "offers": {
                "@type": "Offer",
                "price": "0",
                "priceCurrency": "USD"
              }
            })
          }}
        />
      </head>
      <body className="antialiased bg-white text-black">
        {children}
      </body>
    </html>
  );
}
