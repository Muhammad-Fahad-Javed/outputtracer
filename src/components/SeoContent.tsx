import React from "react";
import Link from "next/link";

export default function SeoContent() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-16 sm:px-8 text-black border-t border-[#EAEAEA]">
      <header className="mb-12">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-black mb-4">
          Write, Run &amp; Trace C++ Code Online
        </h1>
        <p className="text-lg text-[#555555] max-w-3xl leading-relaxed">
          OutputTracer is an interactive browser-based C++ development environment and execution visualizer. 
          Compile standard C++17 code, provide real-time interactive input, debug output logic, and inspect variable mutations step by step.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        <div className="border border-[#EAEAEA] rounded-lg p-6 bg-[#FAFAFA]">
          <h2 className="text-xl font-bold mb-3 text-black">1. Write &amp; Run C++ Online</h2>
          <p className="text-sm text-[#555555] leading-relaxed">
            Full C++17 support with interactive terminal emulation (xterm.js) and standard input (stdin). Run algorithms, multi-file projects, and standard library programs instantly without installing toolchains locally.
          </p>
        </div>

        <div className="border border-[#EAEAEA] rounded-lg p-6 bg-[#FAFAFA]">
          <h2 className="text-xl font-bold mb-3 text-black">2. Step-by-Step Code Tracing</h2>
          <p className="text-sm text-[#555555] leading-relaxed">
            Unlike basic compilers that only show terminal output, OutputTracer captures a dry-run execution timeline. Watch variable assignments, loop states, pointer arithmetic, and recursive stack frames update at every line.
          </p>
        </div>

        <div className="border border-[#EAEAEA] rounded-lg p-6 bg-[#FAFAFA]">
          <h2 className="text-xl font-bold mb-3 text-black">3. Practice Output Prediction</h2>
          <p className="text-sm text-[#555555] leading-relaxed">
            Sharpen mental execution models with over 200 curated output prediction challenges. Test pointer dereferencing, class hierarchies, order of operations, and tricky recursion before verifying your answers.
          </p>
        </div>
      </div>

      <div className="prose prose-sm sm:prose-base max-w-none text-[#333333] space-y-10">
        <div>
          <h2 className="text-2xl font-bold mb-4 text-black">Why Choose OutputTracer Over Ordinary Online Compilers?</h2>
          <p className="text-[#444444] leading-relaxed mb-4">
            Traditional online compilers act like remote black-boxes: you supply source code, click run, and receive the stdout buffer. When unexpected output or infinite loops occur, diagnosing the bug requires inserting dozens of print statements.
          </p>
          <p className="text-[#444444] leading-relaxed">
            OutputTracer is built around <strong>cognitive execution tracing</strong>. By decomposing your C++ execution into an inspectable timeline, students, instructors, and developers can verify hypothesis behavior immediately.
          </p>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-4 text-black">How to Run &amp; Trace C++ Code Online</h2>
          <ol className="list-decimal pl-6 space-y-2 text-[#444444]">
            <li><strong>Write or Paste Code:</strong> Use the editor above to compose your C++ code. Multi-file headers (.h) and source files (.cpp) are fully supported.</li>
            <li><strong>Provide Inputs:</strong> For programs utilizing <code className="bg-[#F0F0F0] px-1.5 py-0.5 rounded text-black font-mono text-xs">std::cin</code> or <code className="bg-[#F0F0F0] px-1.5 py-0.5 rounded text-black font-mono text-xs">scanf</code>, supply values in the Standard Input panel or interact directly in the terminal.</li>
            <li><strong>Execute or Trace:</strong> Click <em>Run</em> (green play button or <kbd className="bg-[#F0F0F0] px-1.5 py-0.5 rounded text-xs font-mono">F5</kbd>) for live console interaction, or click <em>Trace</em> to view step-by-step state changes.</li>
            <li><strong>Inspect Variable States:</strong> Review the Dry Run timeline to inspect how variables, conditionals, and iterations evolve from entry to termination.</li>
          </ol>
        </div>

        <hr className="my-10 border-[#EAEAEA]" />

        <div>
          <h2 className="text-2xl font-bold mb-6 text-black">Frequently Asked Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-[#EAEAEA] p-5 rounded-md">
              <h3 className="text-base font-bold mb-2 text-black">What is an online C++ compiler?</h3>
              <p className="text-sm text-[#555555] leading-relaxed">
                An online C++ compiler runs source code on a remote server environment and delivers compilation errors, standard output, and execution logs directly to your web browser without local configuration.
              </p>
            </div>
            <div className="border border-[#EAEAEA] p-5 rounded-md">
              <h3 className="text-base font-bold mb-2 text-black">Is OutputTracer free to use?</h3>
              <p className="text-sm text-[#555555] leading-relaxed">
                Yes. All core compilation, execution tracing, and practice problems are completely free without requiring credit cards or paid tiers.
              </p>
            </div>
            <div className="border border-[#EAEAEA] p-5 rounded-md">
              <h3 className="text-base font-bold mb-2 text-black">What C++ standard is supported?</h3>
              <p className="text-sm text-[#555555] leading-relaxed">
                OutputTracer compiles code using standard modern C++17 with full support for the standard template library (STL), strings, vectors, maps, and algorithms.
              </p>
            </div>
            <div className="border border-[#EAEAEA] p-5 rounded-md">
              <h3 className="text-base font-bold mb-2 text-black">How does execution tracing work?</h3>
              <p className="text-sm text-[#555555] leading-relaxed">
                The tracer analyzes control-flow changes, loop counter increments, and memory references to reconstruct a sequential breakdown of each program step.
              </p>
            </div>
          </div>
        </div>

        <div className="pt-6 border-t border-[#EAEAEA]">
          <h2 className="text-xl font-bold mb-4 text-black">Explore C++ Learning Resources</h2>
          <div className="flex flex-wrap gap-4">
            <Link href="/examples" className="inline-flex items-center px-4 py-2 border border-[#DCDCDC] rounded text-sm font-medium hover:bg-[#F7F7F7] transition-colors">
              Browse C++ Code Examples &rarr;
            </Link>
            <Link href="/practice" className="inline-flex items-center px-4 py-2 border border-[#DCDCDC] rounded text-sm font-medium hover:bg-[#F7F7F7] transition-colors">
              C++ Output Prediction Questions &rarr;
            </Link>
            <Link href="/learn" className="inline-flex items-center px-4 py-2 border border-[#DCDCDC] rounded text-sm font-medium hover:bg-[#F7F7F7] transition-colors">
              Tracing Concepts Guide &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* JSON-LD FAQ Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What is a C++ online compiler?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "A browser-based C++ compiler allows you to write, compile, and execute C++ code directly in your web browser without installing any software."
                }
              },
              {
                "@type": "Question",
                "name": "Can I run C++ code online for free?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes, OutputTracer is a completely free online C++ compiler."
                }
              },
              {
                "@type": "Question",
                "name": "Do I need to install C++?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "No, an online compiler allows you to compile C++ without installing a local compiler."
                }
              },
              {
                "@type": "Question",
                "name": "Who can use OutputTracer?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Students, beginners, developers, and programmers can all use OutputTracer to write and test C++ code."
                }
              },
              {
                "@type": "Question",
                "name": "Can I provide input to my C++ program?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "Yes, you can provide input values via the standard input (stdin) panel or use the interactive terminal."
                }
              },
              {
                "@type": "Question",
                "name": "Which C++ version does OutputTracer support?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text": "OutputTracer supports C++17."
                }
              }
            ]
          })
        }}
      />
    </section>
  );
}
