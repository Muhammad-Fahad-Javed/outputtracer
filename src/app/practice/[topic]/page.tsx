import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getTopicById, getQuestionsByTopic, getTopics } from "@/lib/practice";
import { ChevronRight, ArrowLeft } from "lucide-react";

export async function generateStaticParams() {
  const topics = await getTopics();
  return topics.map((t) => ({ topic: t.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const topic = await getTopicById(resolvedParams.topic);
  if (!topic) {
    return { title: "Topic Not Found | OutputTracer" };
  }
  return {
    title: `${topic.title} C++ Practice Questions | OutputTracer`,
    description: `Solve ${topic.title} C++ output prediction questions. ${topic.description} Test your dry-run and tracing accuracy online.`,
    alternates: {
      canonical: `/practice/${topic.id}`,
    },
    openGraph: {
      title: `${topic.title} C++ Practice Questions | OutputTracer`,
      description: `Practice ${topic.title} output prediction questions online with OutputTracer.`,
      url: `https://outputtracer.com/practice/${topic.id}`,
    },
  };
}

export default async function TopicPage({ params }: { params: Promise<{ topic: string }> }) {
  const resolvedParams = await params;
  const topicId = resolvedParams.topic;
  const [topic, questions] = await Promise.all([
    getTopicById(topicId),
    getQuestionsByTopic(topicId),
  ]);

  if (!topic) {
    notFound();
  }

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://outputtracer.com"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Practice",
        "item": "https://outputtracer.com/practice"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": topic.title,
        "item": `https://outputtracer.com/practice/${topic.id}`
      }
    ]
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <Header />
      <main className="min-h-screen pb-20">
        <section className="mx-auto max-w-4xl px-5 pt-12 sm:px-8 sm:pt-16">
          <Link
            href="/practice"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#666666] hover:text-black transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Topics
          </Link>

          <div className="mt-8">
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              {topic.title}
            </h1>
            <p className="mt-3 text-[15px] leading-relaxed text-[#666666]">
              {topic.description}
            </p>
          </div>

          <div className="mt-12 space-y-3">
            {questions.map((question, index) => (
              <Link
                key={question.id}
                href={`/practice/${topic.id}/${question.id}`}
                className="group flex items-center justify-between rounded-[8px] border border-[#EAEAEA] bg-white p-5 transition-all hover:border-[#DCDCDC] hover:shadow-sm"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F5F5F5] text-xs font-semibold text-[#666666]">
                    {index + 1}
                  </div>
                  <div>
                    <h3 className="text-[15px] font-medium text-black group-hover:underline">
                      {question.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-2">
                      <span className={`text-[11px] font-medium uppercase tracking-wider ${
                        question.difficulty === "Easy" ? "text-green-600" :
                        question.difficulty === "Medium" ? "text-yellow-600" :
                        "text-red-600"
                      }`}>
                        {question.difficulty}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-[#999999] group-hover:text-black transition-colors">
                  <ChevronRight size={18} />
                </div>
              </Link>
            ))}
          </div>
          
          {questions.length === 0 && (
            <div className="mt-8 rounded-md border border-dashed border-[#DCDCDC] px-6 py-12 text-center">
              <p className="text-sm text-[#999999]">
                No questions found for this topic.
              </p>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
