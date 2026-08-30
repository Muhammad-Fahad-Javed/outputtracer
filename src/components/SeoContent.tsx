import React from "react";

export default function SeoContent() {
  return (
    <section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 text-black">
      <div className="prose prose-sm sm:prose-base max-w-none prose-headings:font-semibold prose-a:text-blue-600">
        <h2 className="text-xl sm:text-2xl font-bold mt-8 mb-4">Free C++ Online Compiler</h2>
        <p className="mb-6 text-[#444444] leading-relaxed">
          OutputTracer is a fast and easy-to-use C++ online compiler that lets you write, compile, and run C++ programs directly in your browser. No local compiler installation is required to use the browser-based environment.
        </p>

        <h2 className="text-xl sm:text-2xl font-bold mt-8 mb-4">Run C++ Code Online</h2>
        <p className="mb-6 text-[#444444] leading-relaxed">
          Write and test C++ programs online. OutputTracer supports standard input and output, allowing you to provide program input values and interact with your code instantly.
        </p>

        <h2 className="text-xl sm:text-2xl font-bold mt-8 mb-4">C++ Compiler for Students</h2>
        <p className="mb-4 text-[#444444] leading-relaxed">
          OutputTracer can be useful for:
        </p>
        <ul className="list-disc pl-6 mb-6 text-[#444444] space-y-1">
          <li>C++ programming practice</li>
          <li>beginner programming</li>
          <li>OOP exercises</li>
          <li>arrays</li>
          <li>pointers</li>
          <li>functions</li>
          <li>recursion</li>
          <li>algorithms</li>
          <li>programming assignments</li>
        </ul>

        <h2 className="text-xl sm:text-2xl font-bold mt-8 mb-4">How to Run C++ Code Online</h2>
        <ol className="list-decimal pl-6 mb-8 text-[#444444] space-y-1">
          <li>Open OutputTracer.</li>
          <li>Write or paste C++ code.</li>
          <li>Provide program input via stdin or the interactive terminal.</li>
          <li>Compile/run the program.</li>
          <li>View the result.</li>
        </ol>

        <hr className="my-10 border-[#DCDCDC]" />

        <h2 className="text-2xl sm:text-3xl font-bold mb-6">Frequently Asked Questions</h2>
        
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-2">What is a C++ online compiler?</h3>
            <p className="text-[#444444]">A browser-based C++ compiler allows you to write, compile, and execute C++ code directly in your web browser without installing any software.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Can I run C++ code online for free?</h3>
            <p className="text-[#444444]">Yes, OutputTracer is a completely free online C++ compiler.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Do I need to install C++?</h3>
            <p className="text-[#444444]">No, an online compiler allows you to compile C++ without installing a local compiler.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Who can use OutputTracer?</h3>
            <p className="text-[#444444]">Students, beginners, developers, and programmers can all use OutputTracer to write and test C++ code.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Can I provide input to my C++ program?</h3>
            <p className="text-[#444444]">Yes, you can provide input values via the standard input (stdin) panel or use the interactive terminal.</p>
          </div>
          
          <div>
            <h3 className="text-lg font-semibold mb-2">Which C++ version does OutputTracer support?</h3>
            <p className="text-[#444444]">OutputTracer supports C++17.</p>
          </div>
        </div>
        
        <hr className="my-10 border-[#DCDCDC]" />

        <nav className="mt-8 mb-8">
          <h3 className="text-xl sm:text-2xl font-bold mb-4">Learn More C++</h3>
          <ul className="list-disc pl-6 space-y-2 text-[#444444]">
            <li><a href="/examples" className="text-blue-600 hover:underline">C++ Programming Examples</a></li>
            <li><a href="/practice" className="text-blue-600 hover:underline">C++ Output Prediction Practice</a></li>
            <li><a href="/learn" className="text-blue-600 hover:underline">Learn C++ OutputTracer</a></li>
            <li><a href="/" className="text-blue-600 hover:underline">Back to C++ Online Compiler</a></li>
          </ul>
        </nav>
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
