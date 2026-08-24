import fs from "fs/promises";
import path from "path";

export interface PracticeQuestion {
  id: string;
  topicId: string;
  title: string;
  code: string;
  answer: string;
  explanation: string;
  difficulty: "Easy" | "Medium" | "Hard";
}

export interface Topic {
  id: string;
  title: string;
  description: string;
  icon: string;
  questionCount: number;
}

const DATA_DIR = path.join(process.cwd(), "data", "questions");

/**
 * Get all available topics based on the JSON files in the data directory.
 */
export async function getTopics(): Promise<Topic[]> {
  try {
    const files = await fs.readdir(DATA_DIR);
    const topics: Topic[] = [];

    for (const file of files) {
      if (file.endsWith(".json")) {
        const filePath = path.join(DATA_DIR, file);
        const fileContents = await fs.readFile(filePath, "utf8");
        try {
          const data = JSON.parse(fileContents);
          if (data.topic) {
            topics.push({
              id: data.topic.id,
              title: data.topic.title,
              description: data.topic.description,
              icon: data.topic.icon || "Code",
              questionCount: data.questions?.length || 0,
            });
          }
        } catch (e) {
          console.error(`Error parsing ${file}:`, e);
        }
      }
    }

    // Sort by a predefined order or alphabetically
    return topics.sort((a, b) => a.title.localeCompare(b.title));
  } catch (error) {
    console.error("Failed to read topics directory:", error);
    return [];
  }
}

/**
 * Get a specific topic by its ID.
 */
export async function getTopicById(topicId: string): Promise<Topic | null> {
  const topics = await getTopics();
  return topics.find((t) => t.id === topicId) || null;
}

/**
 * Get all questions for a specific topic.
 */
export async function getQuestionsByTopic(topicId: string): Promise<PracticeQuestion[]> {
  try {
    const filePath = path.join(DATA_DIR, `${topicId}.json`);
    const fileContents = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(fileContents);
    return data.questions || [];
  } catch (error) {
    console.error(`Failed to read questions for topic ${topicId}:`, error);
    return [];
  }
}

/**
 * Get a specific question by topic ID and question ID.
 */
export async function getQuestion(topicId: string, questionId: string): Promise<PracticeQuestion | null> {
  const questions = await getQuestionsByTopic(topicId);
  return questions.find((q) => q.id === questionId) || null;
}
