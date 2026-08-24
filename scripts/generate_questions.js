/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * This script automates the generation of C++ practice questions using an LLM API.
 * 
 * Usage:
 * 1. npm install -D dotenv
 * 2. Set GEMINI_API_KEY (or OPENAI_API_KEY if modified) in a .env file.
 * 3. Run: node scripts/generate_questions.js <topicId> <count>
 * 
 * Example: node scripts/generate_questions.js pointers 50
 */

const fs = require("fs/promises");
const path = require("path");

const TOPIC_ID = process.argv[2];
const COUNT = parseInt(process.argv[3] || "10", 10);

if (!TOPIC_ID) {
  console.error("Please provide a topic ID (e.g. basic-syntax, pointers, oop, stl)");
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, "..", "data", "questions");

const PROMPT = `
You are a C++ expert. Generate ${COUNT} unique C++ output prediction practice questions for the topic: "${TOPIC_ID}".
Each question must be a short C++ program that compiles and prints something deterministic.
Do not use undefined behavior or compiler-specific hacks.
Format your response STRICTLY as a JSON array of objects with this schema:
[
  {
    "id": "[generate a unique short string like 'ptr-04']",
    "topicId": "${TOPIC_ID}",
    "title": "Short descriptive title",
    "code": "#include <iostream>\\n... int main() { ... }",
    "answer": "The exact string printed to stdout",
    "explanation": "A 1-2 sentence explanation of why this is the output",
    "difficulty": "Easy" | "Medium" | "Hard"
  }
]
Return ONLY valid JSON.
`;

async function main() {
  console.log(`Generating ${COUNT} questions for topic: ${TOPIC_ID}...`);
  console.log("To fully implement this, uncomment the API call block and add your API key.");

  // =========================================================================
  // IMPLEMENT YOUR LLM CALL HERE
  // =========================================================================
  // 
  // const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=" + process.env.GEMINI_API_KEY, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json" },
  //   body: JSON.stringify({
  //     contents: [{ parts: [{ text: PROMPT }] }]
  //   })
  // });
  // const jsonResult = await response.json();
  // const rawJson = jsonResult.candidates[0].content.parts[0].text;
  // const newQuestions = JSON.parse(rawJson.replace(/```json/g, '').replace(/```/g, ''));
  //
  // =========================================================================

  // For demonstration, we're just reading the existing file and saving it back
  try {
    const filePath = path.join(DATA_DIR, `${TOPIC_ID}.json`);
    const fileContents = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(fileContents);
    
    console.log(`Currently there are ${data.questions.length} questions in ${TOPIC_ID}.json.`);
    
    // data.questions.push(...newQuestions);
    // await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    
    console.log("Success! Generated questions would be appended here.");
  } catch (err) {
    console.error("Error reading or writing topic file. Ensure the topic JSON exists first.", err.message);
  }
}

main();
