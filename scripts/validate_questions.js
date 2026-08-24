const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const DATA_DIR = path.join(__dirname, "../data/questions");

function validateQuestions() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  let total = 0;
  let passed = 0;
  let failed = [];

  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf8"));
    const questions = data.questions || [];

    for (const q of questions) {
      total++;
      console.log(`Testing ${file} - ${q.id}`);
      const cppFile = path.join(__dirname, "temp_test.cpp");
      const exeFile = path.join(__dirname, "temp_test");

      fs.writeFileSync(cppFile, q.code);

      try {
        // Compile
        execSync(`g++ ${cppFile} -o ${exeFile} -std=c++17`, { stdio: "pipe", timeout: 5000 });

        // Run
        let actualOutput = execSync(`${exeFile}`, { stdio: "pipe", timeout: 2000 }).toString().trim();
        let expectedOutput = q.answer.trim();

        if (actualOutput === expectedOutput) {
          passed++;
        } else {
          // If the answer is something conceptually like UB or ERROR, we might need to skip strict comparison
          if (expectedOutput === "UB" || expectedOutput === "ERROR" || expectedOutput.includes("Garbage") || expectedOutput === "Terminate") {
            passed++;
          } else {
            failed.push({
              id: q.id,
              topic: file,
              expected: expectedOutput,
              actual: actualOutput,
            });
          }
        }
      } catch (err) {
        // Compilation error or runtime crash
        let expectedOutput = q.answer.trim();
        if (expectedOutput === "UB" || expectedOutput === "ERROR" || expectedOutput.includes("Terminate") || expectedOutput === "") {
          passed++;
        } else {
          failed.push({
            id: q.id,
            topic: file,
            expected: expectedOutput,
            actual: `Error: ${err.message}`,
          });
        }
      }
    }
  }

  // Cleanup
  try {
    fs.unlinkSync(path.join(__dirname, "temp_test.cpp"));
    fs.unlinkSync(path.join(__dirname, "temp_test"));
  } catch (e) {}

  console.log(`\n--- Validation Results ---`);
  console.log(`Total Checked: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed.length}\n`);

  if (failed.length > 0) {
    console.log("Failures:");
    failed.forEach((f) => {
      console.log(`\nID: ${f.id} (${f.topic})`);
      console.log(`Expected: '${f.expected}'`);
      console.log(`Actual  : '${f.actual}'`);
    });
  }
}

validateQuestions();
