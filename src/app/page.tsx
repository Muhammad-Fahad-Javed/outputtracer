"use client";

import { useState, useEffect, useRef } from "react";
import Predictor from "@/components/Predictor";
import SeoContent from "@/components/SeoContent";
import { DEFAULT_CODE } from "@/lib/examples";

export default function Home() {
  const [files, setFiles] = useState<Record<string, string>>({
    "main.cpp": DEFAULT_CODE,
  });
  const hydrated = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      const practiceCode = localStorage.getItem("outputtracer_practice_code");
      if (practiceCode) {
        setFiles({ "main.cpp": practiceCode });
        localStorage.removeItem("outputtracer_practice_code");
      } else {
        const saved = localStorage.getItem("outputtracer:playground");
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as Record<string, string>;
            if (
              parsed &&
              typeof parsed === "object" &&
              Object.keys(parsed).length > 0 &&
              Object.values(parsed).every((value) => typeof value === "string")
            ) {
              setFiles(parsed);
            }
          } catch {
            // Ignore a damaged local copy and keep the starter file.
          }
        }
      }
      hydrated.current = true;
    });
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    localStorage.setItem("outputtracer:playground", JSON.stringify(files));
  }, [files]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-white">
      <Predictor files={files} setFiles={setFiles} />
      {/* Hidden SEO content for crawlers */}
      <div className="hidden">
        <SeoContent />
      </div>
    </div>
  );
}
