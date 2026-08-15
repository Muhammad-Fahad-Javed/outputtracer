"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

const FAQ_ITEMS = [
  {
    question: "What is a C++ output predictor?",
    answer:
      "It's a tool that analyzes a C++ program and tells you what it will print when run, without you needing to compile or execute it yourself.",
  },
  {
    question: "Can I use OutputTracer for exam preparation?",
    answer:
      "Yes. Predicting output by hand is a common exam skill, and OutputTracer lets you check your reasoning against a clear step-by-step trace.",
  },
  {
    question: "What is a C++ dry run?",
    answer:
      "A dry run is the process of manually tracing through code line by line, tracking how variables change, without actually running the program.",
  },
  {
    question: "Can OutputTracer explain loops?",
    answer:
      "Yes. The dry run table breaks down each iteration of a loop, showing how variables and output change on every pass.",
  },
  {
    question: "Can I trace arrays?",
    answer:
      "Yes. Array elements and index-based operations are shown clearly in the variables column as the program progresses.",
  },
  {
    question: "Can I trace pointers?",
    answer:
      "Yes. Pointer assignments and dereferences are shown in the dry run so you can see exactly which variable is being read or modified.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Frequently Asked Questions
      </h2>

      <div className="mt-8 divide-y divide-[#DCDCDC] border-t border-[#DCDCDC]">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={item.question}>
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between py-5 text-left"
              >
                <span className="pr-4 text-[15px] font-medium text-black">{item.question}</span>
                <Plus
                  size={18}
                  className={`shrink-0 text-[#666666] transition-transform duration-200 ${
                    isOpen ? "rotate-45" : ""
                  }`}
                />
              </button>
              {isOpen && (
                <p className="pb-5 pr-8 text-sm leading-relaxed text-[#666666]">{item.answer}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
