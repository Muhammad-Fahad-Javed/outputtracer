async function testPython() {
  const cases = [
    {
      name: "Phase 4 Test 1: Basic Output",
      body: { code: 'print("Hello, OutputTracer!")', stdin: "" },
    },
    {
      name: "Phase 4 Test 2: Input Handling",
      body: {
        code: `a = int(input())\nb = int(input())\nprint(f"{a} + {b} = {a + b}")`,
        stdin: "10\n20\n",
      },
    },
    {
      name: "Phase 4 Test 3: Loops and Lists",
      body: {
        code: `squares = [x**2 for x in range(1, 6)]\nprint(squares)`,
        stdin: "",
      },
    },
    {
      name: "Phase 4 Test 4: Syntax Error",
      body: {
        code: `print("Missing closing parenthesis"`,
        stdin: "",
      },
    },
    {
      name: "Phase 4 Test 5: Runtime Error (ZeroDivisionError)",
      body: {
        code: `print("Starting")\nx = 1 / 0\nprint("Done")`,
        stdin: "",
      },
    },
  ];

  for (const tc of cases) {
    console.log(`\n=== Running: ${tc.name} ===`);
    try {
      const res = await fetch("http://localhost:3000/api/python", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tc.body),
      });
      const data = await res.json();
      console.log(`HTTP ${res.status}:`, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error("Fetch error:", err);
    }
  }
}

testPython();
