import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/hooks/useTheme";

export const metadata: Metadata = {
  title: "Private Chat",
  description: "A private, secure space for two.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script src="https://accounts.google.com/gsi/client" async defer></script>
      </head>
      <body className="h-full mobile-vh-fix">
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
