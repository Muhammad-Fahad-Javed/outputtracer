"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import Predictor from "@/components/Predictor";
import Footer from "@/components/Footer";
import { DEFAULT_CODE } from "@/lib/examples";

export default function Home() {
  const [files, setFiles] = useState<Record<string, string>>({
    "main.cpp": DEFAULT_CODE,
  });

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
