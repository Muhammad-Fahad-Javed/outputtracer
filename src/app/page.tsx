"use client";

import { useState, useEffect } from "react";
import Predictor from "@/components/Predictor";
import SeoContent from "@/components/SeoContent";
import { DEFAULT_CODE } from "@/lib/examples";

export default function Home() {
  const [files, setFiles] = useState<Record<string, string>>({
    "main.cpp": DEFAULT_CODE,
  });

  useEffect(() => {
    const practiceCode = localStorage.getItem("outputtracer_practice_code");
    if (practiceCode) {
      setFiles({ "main.cpp": practiceCode });
      localStorage.removeItem("outputtracer_practice_code");
    }
  }, []);

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
