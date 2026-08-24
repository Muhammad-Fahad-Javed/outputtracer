import type { Metadata } from "next";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getTopics } from "@/lib/practice";
import { Terminal, Crosshair, Box, Code2, Layers, Cpu } from "lucide-react";

export const metadata: Metadata = {
  title: "Practice — OutputTracer",
  description: "C++ output prediction practice questions categorized by topic.",
};

const ICON_MAP: Record<string, React.ElementType> = {
  Terminal,
  Crosshair,
  Box,
  Code2,
  Layers,
  Cpu,
};

export default async function PracticePage() {
  const topics = await getTopics();

  return (
    <>
      <Header />
      <main className="min-h-screen pb-20">
        <section className="mx-auto max-w-6xl px-5 pt-20 sm:px-8 sm:pt-28">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Practice Topics
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-[#666666]">
            Test your ability to trace C++ execution. Select a topic to view hand-crafted 
            questions, predict the output, and instantly check your understanding.
          </p>

          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topics.map((topic) => {
              const Icon = ICON_MAP[topic.icon] || Code2;
              return (
                <Link
                  key={topic.id}
                  href={`/practice/${topic.id}`}
                  className="group flex flex-col justify-between rounded-lg border border-[#EAEAEA] bg-white p-6 shadow-sm transition-all hover:border-[#DCDCDC] hover:shadow-md"
                >
                  <div>
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-[6px] bg-[#F5F5F5] text-[#333333]">
                      <Icon size={20} />
                    </div>
                    <h3 className="text-lg font-semibold tracking-tight text-black group-hover:underline">
                      {topic.title}
                    </h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-[#666666]">
                      {topic.description}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center justify-between border-t border-[#F0F0F0] pt-4">
                    <span className="text-xs font-medium text-[#888888]">
                      {topic.questionCount} Questions
                    </span>
                    <span className="text-xs font-medium text-black group-hover:underline">
                      Start Practice &rarr;
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {topics.length === 0 && (
            <div className="mt-10 rounded-md border border-dashed border-[#DCDCDC] px-6 py-12 text-center">
              <p className="text-sm text-[#999999]">
                No topics found. Run the generation script to populate the database.
              </p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
