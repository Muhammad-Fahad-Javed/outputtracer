const TOPICS = [
  "Variables",
  "Operators",
  "If / Else",
  "Loops",
  "Nested Loops",
  "Arrays",
  "Strings",
  "Functions",
  "Pointers",
  "References",
  "Recursion",
  "Classes",
  "Objects",
  "Inheritance",
  "Polymorphism",
];

export default function Topics() {
  return (
    <section className="border-t border-[#DCDCDC] bg-[#FAFAFA]">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">C++ Topics Covered</h2>
        <div className="mt-8 flex flex-wrap gap-2.5">
          {TOPICS.map((topic) => (
            <span
              key={topic}
              className="rounded-sm border border-[#DCDCDC] bg-white px-3.5 py-2 text-sm text-[#000000]"
            >
              {topic}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
