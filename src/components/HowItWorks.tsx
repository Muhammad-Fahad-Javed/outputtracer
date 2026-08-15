const STEPS = [
  {
    number: "01",
    title: "Paste Your Code",
    description: "Enter or paste your C++ program into the editor.",
  },
  {
    number: "02",
    title: "Predict Output",
    description: "OutputTracer analyzes the program and determines the expected output.",
  },
  {
    number: "03",
    title: "Trace Every Step",
    description: "Understand variables, conditions, loops, and output through the dry run.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t border-[#DCDCDC] bg-[#FAFAFA]">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How It Works</h2>

        <div className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((step) => (
            <div key={step.number}>
              <span className="font-mono text-sm text-[#999999]">{step.number}</span>
              <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#666666]">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
