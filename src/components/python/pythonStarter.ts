export const PYTHON_FILE_EXTENSION = ".py";
export const PYTHON_DEFAULT_FILENAME = "main.py";
export const PYTHON_MONACO_LANGUAGE = "python"; // built into Monaco; CodeMirror: @codemirror/lang-python

export const PYTHON_STARTER = `# Python 3
def greet(name):
    return f"Hello, {name}!"

name = input("Your name: ")
print(greet(name))

total = 0
for i in range(1, 4):
    total += i
print("Sum:", total)
`;
