async function testCpp() {
  const cases = [
    {
      name: "Phase 3 Test 1: Basic Output",
      body: {
        files: {
          "main.cpp": `#include <iostream>
int main() {
    std::cout << "Hello, OutputTracer!" << std::endl;
    return 0;
}`,
        },
        stdin: "",
      },
    },
    {
      name: "Phase 3 Test 2: Input Handling",
      body: {
        files: {
          "main.cpp": `#include <iostream>
int main() {
    int a, b;
    if (std::cin >> a >> b) {
        std::cout << a << " + " << b << " = " << (a + b) << std::endl;
    }
    return 0;
}`,
        },
        stdin: "15 25\n",
      },
    },
    {
      name: "Phase 3 Test 3: Loops and Functions",
      body: {
        files: {
          "main.cpp": `#include <iostream>
int factorial(int n) {
    if (n <= 1) return 1;
    return n * factorial(n - 1);
}
int main() {
    for (int i = 1; i <= 5; ++i) {
        std::cout << i << "! = " << factorial(i) << std::endl;
    }
    return 0;
}`,
        },
        stdin: "",
      },
    },
    {
      name: "Phase 3 Test 4: Compilation Error",
      body: {
        files: {
          "main.cpp": `#include <iostream>
int main() {
    std::cout << "Missing semicolon"
    return 0;
}`,
        },
        stdin: "",
      },
    },
    {
      name: "Phase 3 Test 5: Runtime Error (Division by Zero / Crash)",
      body: {
        files: {
          "main.cpp": `#include <iostream>
int main() {
    std::cout << "About to divide by zero" << std::endl;
    volatile int zero = 0;
    volatile int crash = 10 / zero;
    std::cout << "Crash: " << crash << std::endl;
    return 0;
}`,
        },
        stdin: "",
      },
    },
  ];

  for (const tc of cases) {
    console.log(`\n=== Running: ${tc.name} ===`);
    try {
      const res = await fetch("http://localhost:3000/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tc.body),
      });
      const data = await res.json();
      console.log(`HTTP ${res.status}: status="${data.status}"`);
      if (data.output) console.log(`Output: ${JSON.stringify(data.output)}`);
      if (data.stderr) console.log(`Stderr: ${JSON.stringify(data.stderr)}`);
      if (data.message) console.log(`Message: ${JSON.stringify(data.message)}`);
      if (data.exitCode !== undefined) console.log(`ExitCode: ${data.exitCode}`);
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }
}

testCpp();
