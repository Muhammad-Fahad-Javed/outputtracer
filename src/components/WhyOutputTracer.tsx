const FEATURES = [
  { title: "Predict", description: "Know what your program will print." },
  { title: "Trace", description: "Follow execution step by step." },
  { title: "Learn", description: "Understand variables, conditions, loops, and functions." },
  { title: "Practice", description: "Use output questions to prepare for programming exams." },
];

export default function WhyOutputTracer() {
  return (
    <section className="border-t border-[#DCDCDC]">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          More Than an Output Checker
        </h2>

        <div className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="border-l-2 border-[#111111] pl-4">
              <h3 className="text-base font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#666666]">{f.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
