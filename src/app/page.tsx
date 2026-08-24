"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Predictor from "@/components/Predictor";
import Footer from "@/components/Footer";
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
    <>
      <Header />
      <main>
        <Hero />
        <Predictor files={files} setFiles={setFiles} />
      </main>
      <Footer />
    </>
  );
}
