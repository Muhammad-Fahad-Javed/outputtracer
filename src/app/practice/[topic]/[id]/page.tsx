import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getTopicById, getQuestion, getQuestionsByTopic, getTopics } from "@/lib/practice";
import { ArrowLeft } from "lucide-react";
import QuestionClient from "./QuestionClient";

export async function generateStaticParams() {
  const topics = await getTopics();
  const params = [];
  for (const topic of topics) {
    const questions = await getQuestionsByTopic(topic.id);
    for (const q of questions) {
      params.push({ topic: topic.id, id: q.id });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ topic: string; id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const [topic, question] = await Promise.all([
    getTopicById(resolvedParams.topic),
    getQuestion(resolvedParams.topic, resolvedParams.id),
  ]);

  if (!topic || !question) {
    return { title: "Question Not Found | OutputTracer" };
  }

  return {
    title: `${question.title} – ${topic.title} C++ Output Question | OutputTracer`,
    description: `Predict the output of this C++ program on ${topic.title}. Difficulty: ${question.difficulty}. Test and trace your answer on OutputTracer.`,
    alternates: {
      canonical: `/practice/${topic.id}/${question.id}`,
    },
    openGraph: {
      title: `${question.title} – ${topic.title} C++ Question`,
      description: `Predict the output of this C++ program on ${topic.title}. Test and trace on OutputTracer.`,
      url: `https://outputtracer.com/practice/${topic.id}/${question.id}`,
    },
  };
}

export default async function QuestionPage({
  params,
}: {
  params: Promise<{ topic: string; id: string }>;
}) {
  const resolvedParams = await params;
  const { topic: topicId, id: questionId } = resolvedParams;

  const [topic, questions, question] = await Promise.all([
    getTopicById(topicId),
    getQuestionsByTopic(topicId),
    getQuestion(topicId, questionId),
  ]);

  if (!topic || !question) {
    notFound();
  }

  // Find next question id for the "Next Question" button
  const currentIndex = questions.findIndex((q) => q.id === questionId);
  const nextQuestionId =
    currentIndex !== -1 && currentIndex < questions.length - 1
      ? questions[currentIndex + 1].id
      : null;
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
      },
      {
        "@type": "ListItem",
        "position": 4,
        "name": question.title,
        "item": `https://outputtracer.com/practice/${topic.id}/${question.id}`
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
      <main className="min-h-screen bg-[#FAFAFA] pb-20">
        <section className="mx-auto max-w-6xl px-5 pt-12 sm:px-8 sm:pt-16">
          <Link
            href={`/practice/${topic.id}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#666666] hover:text-black transition-colors"
          >
            <ArrowLeft size={16} />
            Back to {topic.title}
          </Link>

          <div className="mt-8">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {currentIndex + 1}. {question.title}
            </h1>
            <div className="mt-3 flex items-center gap-3">
              <span className="rounded-full bg-[#EAEAEA] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#666666]">
                {topic.title}
              </span>
              <span className={`text-[12px] font-semibold uppercase tracking-wider ${
                question.difficulty === "Easy" ? "text-green-600" :
                question.difficulty === "Medium" ? "text-yellow-600" :
                "text-red-600"
              }`}>
                {question.difficulty}
              </span>
            </div>
          </div>

          <QuestionClient
            question={question}
            nextQuestionId={nextQuestionId}
          />
        </section>
      </main>
      <Footer />
    </>
  );
}
