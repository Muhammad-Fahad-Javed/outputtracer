import { ExampleProgram, PredictionResult } from "@/types/predictor";

export const DEFAULT_CODE = `#include <iostream>
using namespace std;

int main() {
    int a = 10;
    int b = 20;

    cout << a + b;

    return 0;
}`;

export const examples: ExampleProgram[] = [
  {
    id: "basic-arithmetic",
    title: "Basic Arithmetic",
    category: "Variables",
    code: `#include <iostream>
using namespace std;

int main() {
    int a = 10;
    int b = 20;
    cout << a + b;

    return 0;
}`,
    expectedOutput: "30",
    dryRun: [
      { step: 1, statement: "int a = 10;", variables: "a = 10", output: "\u2014" },
      { step: 2, statement: "int b = 20;", variables: "a = 10, b = 20", output: "\u2014" },
      { step: 3, statement: "cout << a + b;", variables: "a = 10, b = 20", output: "30" },
    ],
  },
  {
    id: "if-else",
    title: "If / Else",
    category: "Conditions",
    code: `#include <iostream>
using namespace std;

int main() {
    int x = 10;

    if (x > 5)
        cout << "Yes";
    else
        cout << "No";

    return 0;
}`,
    expectedOutput: "Yes",
    dryRun: [
      { step: 1, statement: "int x = 10;", variables: "x = 10", output: "\u2014" },
      { step: 2, statement: "if (x > 5)", variables: "x = 10", output: "\u2014" },
      { step: 3, statement: 'cout << "Yes";', variables: "x = 10", output: "Yes" },
    ],
  },
  {
    id: "for-loop",
    title: "Loop",
    category: "Loops",
    code: `#include <iostream>
using namespace std;

int main() {
    for (int i = 1; i <= 3; i++)
        cout << i;

    return 0;
}`,
    expectedOutput: "123",
    dryRun: [
      { step: 1, statement: "int i = 1;", variables: "i = 1", output: "\u2014" },
      { step: 2, statement: "cout << i;  // i = 1", variables: "i = 1", output: "1" },
      { step: 3, statement: "i++;  // i = 2", variables: "i = 2", output: "\u2014" },
      { step: 4, statement: "cout << i;  // i = 2", variables: "i = 2", output: "2" },
      { step: 5, statement: "i++;  // i = 3", variables: "i = 3", output: "\u2014" },
      { step: 6, statement: "cout << i;  // i = 3", variables: "i = 3", output: "3" },
    ],
  },
  {
    id: "nested-loop",
    title: "Nested Loop",
    category: "Loops",
    code: `#include <iostream>
using namespace std;

int main() {
    for (int i = 1; i <= 2; i++) {
        for (int j = 1; j <= 2; j++) {
            cout << i << j << " ";
        }
    }

    return 0;
}`,
    expectedOutput: "11 12 21 22",
    dryRun: [
      { step: 1, statement: "i = 1, j = 1", variables: "i = 1, j = 1", output: "11 " },
      { step: 2, statement: "i = 1, j = 2", variables: "i = 1, j = 2", output: "12 " },
      { step: 3, statement: "i = 2, j = 1", variables: "i = 2, j = 1", output: "21 " },
      { step: 4, statement: "i = 2, j = 2", variables: "i = 2, j = 2", output: "22 " },
    ],
  },
  {
    id: "array-sum",
    title: "Array Sum",
    category: "Arrays",
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[4] = {2, 4, 6, 8};
    int sum = 0;

    for (int i = 0; i < 4; i++) {
        sum += arr[i];
    }

    cout << sum;

    return 0;
}`,
    expectedOutput: "20",
    dryRun: [
      { step: 1, statement: "int arr[4] = {2, 4, 6, 8};", variables: "arr = [2, 4, 6, 8]", output: "\u2014" },
      { step: 2, statement: "int sum = 0;", variables: "sum = 0", output: "\u2014" },
      { step: 3, statement: "sum += arr[0];", variables: "sum = 2", output: "\u2014" },
      { step: 4, statement: "sum += arr[1];", variables: "sum = 6", output: "\u2014" },
      { step: 5, statement: "sum += arr[2];", variables: "sum = 12", output: "\u2014" },
      { step: 6, statement: "sum += arr[3];", variables: "sum = 20", output: "\u2014" },
      { step: 7, statement: "cout << sum;", variables: "sum = 20", output: "20" },
    ],
  },
  {
    id: "string-concat",
    title: "String Concatenation",
    category: "Strings",
    code: `#include <iostream>
using namespace std;

int main() {
    string first = "Output";
    string second = "Tracer";

    cout << first + second;

    return 0;
}`,
    expectedOutput: "OutputTracer",
    dryRun: [
      { step: 1, statement: 'string first = "Output";', variables: 'first = "Output"', output: "\u2014" },
      { step: 2, statement: 'string second = "Tracer";', variables: 'first = "Output", second = "Tracer"', output: "\u2014" },
      { step: 3, statement: "cout << first + second;", variables: 'first = "Output", second = "Tracer"', output: "OutputTracer" },
    ],
  },
  {
    id: "function-call",
    title: "Function Call",
    category: "Functions",
    code: `#include <iostream>
using namespace std;

int square(int n) {
    return n * n;
}

int main() {
    cout << square(6);

    return 0;
}`,
    expectedOutput: "36",
    dryRun: [
      { step: 1, statement: "square(6) called", variables: "n = 6", output: "\u2014" },
      { step: 2, statement: "return n * n;", variables: "n = 6, result = 36", output: "\u2014" },
      { step: 3, statement: "cout << square(6);", variables: "result = 36", output: "36" },
    ],
  },
  {
    id: "pointer-basics",
    title: "Pointer Basics",
    category: "Pointers",
    code: `#include <iostream>
using namespace std;

int main() {
    int x = 15;
    int* p = &x;
    *p = *p + 5;

    cout << x;

    return 0;
}`,
    expectedOutput: "20",
    dryRun: [
      { step: 1, statement: "int x = 15;", variables: "x = 15", output: "\u2014" },
      { step: 2, statement: "int* p = &x;", variables: "x = 15, p -> x", output: "\u2014" },
      { step: 3, statement: "*p = *p + 5;", variables: "x = 20, p -> x", output: "\u2014" },
      { step: 4, statement: "cout << x;", variables: "x = 20", output: "20" },
    ],
  },
  {
    id: "recursion-factorial",
    title: "Recursive Factorial",
    category: "Recursion",
    code: `#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}

int main() {
    cout << factorial(4);

    return 0;
}`,
    expectedOutput: "24",
    dryRun: [
      { step: 1, statement: "factorial(4)", variables: "n = 4", output: "\u2014" },
      { step: 2, statement: "factorial(3)", variables: "n = 3", output: "\u2014" },
      { step: 3, statement: "factorial(2)", variables: "n = 2", output: "\u2014" },
      { step: 4, statement: "factorial(1) -> returns 1", variables: "n = 1", output: "\u2014" },
      { step: 5, statement: "unwind: 2 * 1 = 2", variables: "result = 2", output: "\u2014" },
      { step: 6, statement: "unwind: 3 * 2 = 6", variables: "result = 6", output: "\u2014" },
      { step: 7, statement: "unwind: 4 * 6 = 24", variables: "result = 24", output: "24" },
    ],
  },
  {
    id: "class-object",
    title: "Class & Object",
    category: "OOP",
    code: `#include <iostream>
using namespace std;

class Rectangle {
public:
    int width, height;
    int area() {
        return width * height;
    }
};

int main() {
    Rectangle r;
    r.width = 5;
    r.height = 4;

    cout << r.area();

    return 0;
}`,
    expectedOutput: "20",
    dryRun: [
      { step: 1, statement: "Rectangle r;", variables: "r created", output: "\u2014" },
      { step: 2, statement: "r.width = 5;", variables: "r.width = 5", output: "\u2014" },
      { step: 3, statement: "r.height = 4;", variables: "r.width = 5, r.height = 4", output: "\u2014" },
      { step: 4, statement: "cout << r.area();", variables: "r.width = 5, r.height = 4", output: "20" },
    ],
  },
];

const PENDING_EXAMPLE_KEY = "outputtracer:pending-example";

/**
 * Stores a code snippet (e.g. selected on the /examples page) so the
 * homepage predictor can pick it up after navigation. Purely client-side —
 * no backend or persistence beyond the current browser session.
 */
export function setPendingExample(code: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PENDING_EXAMPLE_KEY, code);
}

export function consumePendingExample(): string | null {
  if (typeof window === "undefined") return null;
  const code = window.localStorage.getItem(PENDING_EXAMPLE_KEY);
  if (code) window.localStorage.removeItem(PENDING_EXAMPLE_KEY);
  return code;
}

/**
 * Frontend-only mock predictor. Matches the given source against known
 * example programs (or the default starter snippet) and returns a canned
 * result. A real C++ execution engine will replace this later.
 */
export function mockPredict(code: string): PredictionResult {
  const normalized = code.replace(/\s+/g, " ").trim();

  const matched = examples.find(
    (ex) => ex.code.replace(/\s+/g, " ").trim() === normalized
  );

  if (matched) {
    return {
      status: "success",
      output: matched.expectedOutput,
      dryRun: matched.dryRun,
    };
  }

  if (normalized.replace(/\s+/g, " ") === DEFAULT_CODE.replace(/\s+/g, " ").trim()) {
    return {
      status: "success",
      output: "30",
      dryRun: examples[0].dryRun,
    };
  }

  // Very naive heuristic checks so arbitrary pasted code still gets a
  // plausible-looking mock response instead of always erroring.
  if (!normalized.includes("main")) {
    return {
      status: "error",
      error: {
        title: "COMPILATION ERROR",
        message: "error: 'main' function not found — every C++ program needs an entry point.",
      },
    };
  }

  const unmatchedVar = normalized.match(/cout\s*<<\s*([a-zA-Z_]\w*)/);
  if (unmatchedVar && !normalized.includes(`int ${unmatchedVar[1]}`) && !normalized.includes(`string ${unmatchedVar[1]}`)) {
    return {
      status: "error",
      error: {
        title: "COMPILATION ERROR",
        message: `error: '${unmatchedVar[1]}' was not declared in this scope`,
      },
    };
  }

  return {
    status: "success",
    output: "Output preview unavailable in this demo — try one of the example programs above.",
    dryRun: [
      { step: 1, statement: "Program parsed", variables: "\u2014", output: "\u2014" },
      { step: 2, statement: "Execution simulated", variables: "\u2014", output: "\u2014" },
    ],
  };
}
