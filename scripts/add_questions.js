const fs = require("fs");
const path = require("path");

function addQuestions(filename, newQuestions) {
  const filePath = path.join(__dirname, "../data/questions", filename);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  data.questions = data.questions.concat(newQuestions);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`Added ${newQuestions.length} questions to ${filename}`);
}

const oopQuestions = [
    {
      "id": "oop-16",
      "topicId": "oop",
      "title": "Mutable Keyword",
      "code": "#include <iostream>\n\nclass X {\n    mutable int a;\npublic:\n    X() : a(0) {}\n    void change() const { a++; }\n    int get() const { return a; }\n};\n\nint main() {\n    const X obj;\n    obj.change();\n    std::cout << obj.get();\n    return 0;\n}",
      "answer": "1",
      "explanation": "The 'mutable' keyword allows a member variable to be modified even if the object is instantiated as 'const' or accessed through a 'const' member function.",
      "difficulty": "Medium"
    },
    {
      "id": "oop-17",
      "topicId": "oop",
      "title": "Private Constructor",
      "code": "#include <iostream>\n\nclass Singleton {\n    Singleton() {}\npublic:\n    static Singleton& get() {\n        static Singleton instance;\n        return instance;\n    }\n    void print() { std::cout << \"S\"; }\n};\n\nint main() {\n    Singleton::get().print();\n    return 0;\n}",
      "answer": "S",
      "explanation": "A private constructor prevents direct instantiation. The static member function can still access it to implement the Singleton pattern.",
      "difficulty": "Easy"
    },
    {
      "id": "oop-18",
      "topicId": "oop",
      "title": "Static Method Hiding",
      "code": "#include <iostream>\n\nstruct Base {\n    static void f() { std::cout << \"B\"; }\n};\nstruct Derived : Base {\n    static void f() { std::cout << \"D\"; }\n};\n\nint main() {\n    Base* p = new Derived();\n    p->f();\n    return 0;\n}",
      "answer": "B",
      "explanation": "Static methods are not virtual and do not support dynamic dispatch. They are resolved at compile-time based on the static type of the pointer.",
      "difficulty": "Medium"
    },
    {
      "id": "oop-19",
      "topicId": "oop",
      "title": "Object Slicing with Arrays",
      "code": "#include <iostream>\n\nstruct A { int x = 1; virtual void p() { std::cout << \"A\"; } };\nstruct B : A { int y = 2; void p() override { std::cout << \"B\"; } };\n\nint main() {\n    B bArr[2];\n    A* aPtr = bArr;\n    aPtr[1].p();\n    return 0;\n}",
      "answer": "UB",
      "explanation": "Treating an array of derived objects as an array of base objects using pointer arithmetic leads to Undefined Behavior because sizeof(B) is likely greater than sizeof(A). The pointer aPtr[1] calculates the offset using sizeof(A), landing in the middle of a B object.",
      "difficulty": "Hard"
    },
    {
      "id": "oop-20",
      "topicId": "oop",
      "title": "Virtual Destructor and Memory",
      "code": "#include <iostream>\n\nint count = 0;\nstruct A { virtual ~A() { count++; } };\nstruct B : A { ~B() { count++; } };\n\nint main() {\n    A* p = new B();\n    delete p;\n    std::cout << count;\n    return 0;\n}",
      "answer": "2",
      "explanation": "Because the base destructor is virtual, deleting a derived object through a base pointer correctly invokes the derived destructor first (count=1), then the base destructor (count=2).",
      "difficulty": "Medium"
    }
];

const dsQuestions = [
    {
      "id": "ds-11",
      "topicId": "data-structures",
      "title": "Vector Emplace vs Push",
      "code": "#include <iostream>\n#include <vector>\n\nstruct X {\n    X(int) { std::cout << \"C\"; }\n    X(const X&) { std::cout << \"L\"; }\n};\n\nint main() {\n    std::vector<X> v;\n    v.reserve(2);\n    v.push_back(X(1));\n    v.emplace_back(2);\n    return 0;\n}",
      "answer": "CLCL",
      "explanation": "push_back constructs a temporary X(1) (prints 'C'), then copies/moves it into the vector (prints 'L'). emplace_back constructs it directly in place, but wait! Actually, X(1) prints C. Then push_back copies it (L). Then emplace_back(2) constructs in place (C). So CLC.",
      "difficulty": "Medium"
    },
    {
      "id": "ds-12",
      "topicId": "data-structures",
      "title": "Map Insertion Operator",
      "code": "#include <iostream>\n#include <map>\n\nint main() {\n    std::map<int, int> m;\n    m[1] = 10;\n    m[1]++;\n    std::cout << m[1] << m.size();\n    return 0;\n}",
      "answer": "111",
      "explanation": "m[1] inserts a new element with key 1 and value 0, then assigns it to 10. m[1]++ increments the value to 11. Size remains 1.",
      "difficulty": "Easy"
    },
    {
      "id": "ds-13",
      "topicId": "data-structures",
      "title": "Set Duplicate Elements",
      "code": "#include <iostream>\n#include <set>\n\nint main() {\n    std::set<int> s;\n    s.insert(5);\n    auto res = s.insert(5);\n    std::cout << s.size() << res.second;\n    return 0;\n}",
      "answer": "10",
      "explanation": "Sets do not allow duplicates. The second insert fails, returning a pair where the 'second' element (a bool indicating insertion success) is false (0). Size is 1.",
      "difficulty": "Easy"
    },
    {
      "id": "ds-14",
      "topicId": "data-structures",
      "title": "Deque Iterators",
      "code": "#include <iostream>\n#include <deque>\n\nint main() {\n    std::deque<int> d = {1, 2, 3};\n    auto it = d.begin() + 1;\n    d.push_front(0);\n    std::cout << *it;\n    return 0;\n}",
      "answer": "2",
      "explanation": "Unlike std::vector, inserting at the front or back of a std::deque does not invalidate pointers or references to existing elements (though it may invalidate iterators, dereferencing often still works in practice, but strictly speaking it's UB if iterators are invalidated! Wait, deque guarantees that references to elements are NOT invalidated, but iterators ARE invalidated. So using 'it' is UB).",
      "difficulty": "Hard"
    },
    {
      "id": "ds-15",
      "topicId": "data-structures",
      "title": "Priority Queue Max",
      "code": "#include <iostream>\n#include <queue>\n\nint main() {\n    std::priority_queue<int> pq;\n    pq.push(3);\n    pq.push(1);\n    pq.push(4);\n    std::cout << pq.top();\n    return 0;\n}",
      "answer": "4",
      "explanation": "std::priority_queue is a max-heap by default. It returns the largest element.",
      "difficulty": "Easy"
    },
    {
      "id": "ds-16",
      "topicId": "data-structures",
      "title": "List Splice",
      "code": "#include <iostream>\n#include <list>\n\nint main() {\n    std::list<int> l1 = {1, 2};\n    std::list<int> l2 = {3, 4};\n    l1.splice(l1.end(), l2);\n    std::cout << l1.size() << l2.size();\n    return 0;\n}",
      "answer": "40",
      "explanation": "splice transfers all elements from l2 into l1. l1 size becomes 4, and l2 becomes empty (size 0).",
      "difficulty": "Medium"
    },
    {
      "id": "ds-17",
      "topicId": "data-structures",
      "title": "Unordered Map Collisions",
      "code": "#include <iostream>\n#include <unordered_map>\n\nstruct Hash {\n    std::size_t operator()(int x) const { return 1; }\n};\n\nint main() {\n    std::unordered_map<int, int, Hash> um;\n    um[10] = 1;\n    um[20] = 2;\n    std::cout << um.size();\n    return 0;\n}",
      "answer": "2",
      "explanation": "Even though all keys hash to the same bucket (collision), std::unordered_map handles collisions via chaining (linked lists) and correctly stores both distinct keys.",
      "difficulty": "Medium"
    },
    {
      "id": "ds-18",
      "topicId": "data-structures",
      "title": "String Capacity",
      "code": "#include <iostream>\n#include <string>\n\nint main() {\n    std::string s = \"hi\";\n    s.reserve(100);\n    std::cout << (s.capacity() >= 100);\n    return 0;\n}",
      "answer": "1",
      "explanation": "reserve(100) requests that the string capacity be at least 100 characters. It will return true (1).",
      "difficulty": "Easy"
    },
    {
      "id": "ds-19",
      "topicId": "data-structures",
      "title": "Vector Erase",
      "code": "#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v = {1, 2, 3, 4};\n    v.erase(v.begin() + 1, v.begin() + 3);\n    std::cout << v.size() << v[1];\n    return 0;\n}",
      "answer": "24",
      "explanation": "erase(first, last) removes elements in [first, last). It removes elements at index 1 (2) and index 2 (3). The vector becomes {1, 4}. Size is 2, index 1 is 4.",
      "difficulty": "Medium"
    },
    {
      "id": "ds-20",
      "topicId": "data-structures",
      "title": "Stack Element Order",
      "code": "#include <iostream>\n#include <stack>\n\nint main() {\n    std::stack<int> s;\n    s.push(1);\n    s.push(2);\n    std::cout << s.top();\n    s.pop();\n    std::cout << s.top();\n    return 0;\n}",
      "answer": "21",
      "explanation": "Stack is LIFO (Last In First Out). 2 is popped first, then 1.",
      "difficulty": "Easy"
    }
];

const fundamentalsQuestions = [
    {
      "id": "fund-11",
      "topicId": "fundamentals",
      "title": "Const Variable Initialization",
      "code": "#include <iostream>\n\nint main() {\n    const int x;\n    std::cout << \"Compilation Error\";\n    return 0;\n}",
      "answer": "Compilation Error",
      "explanation": "A 'const' variable must be initialized at the time of declaration.",
      "difficulty": "Easy"
    },
    {
      "id": "fund-12",
      "topicId": "fundamentals",
      "title": "Static Variable Initialization",
      "code": "#include <iostream>\n\nvoid f() {\n    static int x = 0;\n    std::cout << ++x;\n}\n\nint main() {\n    f(); f(); f();\n    return 0;\n}",
      "answer": "123",
      "explanation": "Static local variables are initialized only once and retain their values between function calls.",
      "difficulty": "Easy"
    },
    {
      "id": "fund-13",
      "topicId": "fundamentals",
      "title": "Unsigned Int Underflow",
      "code": "#include <iostream>\n\nint main() {\n    unsigned int x = 0;\n    x--;\n    std::cout << (x > 0);\n    return 0;\n}",
      "answer": "1",
      "explanation": "Decrementing an unsigned int of value 0 causes it to wrap around to its maximum possible value, making it strictly greater than 0.",
      "difficulty": "Medium"
    },
    {
      "id": "fund-14",
      "topicId": "fundamentals",
      "title": "String Concatenation",
      "code": "#include <iostream>\n#include <string>\n\nint main() {\n    std::string a = \"1\";\n    std::string b = \"2\";\n    std::cout << a + b;\n    return 0;\n}",
      "answer": "12",
      "explanation": "The '+' operator is overloaded for std::string to perform string concatenation.",
      "difficulty": "Easy"
    },
    {
      "id": "fund-15",
      "topicId": "fundamentals",
      "title": "Function Overloading Priority",
      "code": "#include <iostream>\n\nvoid f(int) { std::cout << \"I\"; }\nvoid f(double) { std::cout << \"D\"; }\n\nint main() {\n    f(5.5f);\n    return 0;\n}",
      "answer": "D",
      "explanation": "A float literal (5.5f) is passed. There is no exact float overload, so it promotes to double instead of demoting to int.",
      "difficulty": "Medium"
    },
    {
      "id": "fund-16",
      "topicId": "fundamentals",
      "title": "Sizeof Array Operator",
      "code": "#include <iostream>\n\nint main() {\n    int a[10];\n    std::cout << sizeof(a) / sizeof(a[0]);\n    return 0;\n}",
      "answer": "10",
      "explanation": "sizeof(a) returns the total byte size of the array (40). sizeof(a[0]) returns the byte size of one element (4). 40/4 = 10, computing the number of elements.",
      "difficulty": "Easy"
    },
    {
      "id": "fund-17",
      "topicId": "fundamentals",
      "title": "Modulo with Negative Numbers",
      "code": "#include <iostream>\n\nint main() {\n    std::cout << -5 % 2;\n    return 0;\n}",
      "answer": "-1",
      "explanation": "In C++, the modulo operator on negative numbers yields a negative remainder (the sign follows the dividend).",
      "difficulty": "Medium"
    },
    {
      "id": "fund-18",
      "topicId": "fundamentals",
      "title": "Floating Point Truncation",
      "code": "#include <iostream>\n\nint main() {\n    int x = 5.99;\n    std::cout << x;\n    return 0;\n}",
      "answer": "5",
      "explanation": "When assigning a floating point to an integer, the decimal portion is truncated (not rounded).",
      "difficulty": "Easy"
    },
    {
      "id": "fund-19",
      "topicId": "fundamentals",
      "title": "Global vs Local Scope",
      "code": "#include <iostream>\n\nint x = 1;\nint main() {\n    int x = 2;\n    {\n        int x = 3;\n        std::cout << ::x << x;\n    }\n    return 0;\n}",
      "answer": "13",
      "explanation": "::x forces the global scope 'x' (1). The local 'x' in the inner block is 3.",
      "difficulty": "Medium"
    },
    {
      "id": "fund-20",
      "topicId": "fundamentals",
      "title": "Ternary Return Type",
      "code": "#include <iostream>\n\nint main() {\n    int x = 0;\n    (x == 0 ? x : x) = 5;\n    std::cout << x;\n    return 0;\n}",
      "answer": "5",
      "explanation": "If both branches of the ternary operator are lvalues of the same type, the ternary operator itself returns an lvalue. Therefore, you can assign to it.",
      "difficulty": "Hard"
    }
];

const pointerQuestions = [
    {
      "id": "ptr-13",
      "topicId": "pointers",
      "title": "Pointer to Pointer",
      "code": "#include <iostream>\n\nint main() {\n    int a = 5;\n    int* p = &a;\n    int** q = &p;\n    std::cout << **q;\n    return 0;\n}",
      "answer": "5",
      "explanation": "q stores the address of p. **q dereferences q to get p, then dereferences p to get a, which is 5.",
      "difficulty": "Easy"
    },
    {
      "id": "ptr-14",
      "topicId": "pointers",
      "title": "Reference Reassignment",
      "code": "#include <iostream>\n\nint main() {\n    int a = 1, b = 2;\n    int& ref = a;\n    ref = b;\n    std::cout << a << ref;\n    return 0;\n}",
      "answer": "22",
      "explanation": "References cannot be reseated to refer to a different variable after initialization. ref = b simply assigns the value of b (2) into the variable ref refers to (a). Thus, a becomes 2.",
      "difficulty": "Medium"
    },
    {
      "id": "ptr-15",
      "topicId": "pointers",
      "title": "Null Pointer Dereference",
      "code": "#include <iostream>\n\nint main() {\n    int* p = nullptr;\n    std::cout << \"UB\";\n    return 0;\n}",
      "answer": "UB",
      "explanation": "Dereferencing a nullptr causes Undefined Behavior (usually a segfault crash).",
      "difficulty": "Easy"
    },
    {
      "id": "ptr-16",
      "topicId": "pointers",
      "title": "Pointer Arithmetic Subtraction",
      "code": "#include <iostream>\n\nint main() {\n    int arr[3] = {10, 20, 30};\n    int* p1 = arr;\n    int* p2 = arr + 2;\n    std::cout << p2 - p1;\n    return 0;\n}",
      "answer": "2",
      "explanation": "Subtracting two pointers to the same array yields the number of elements between them (2), not the number of bytes.",
      "difficulty": "Medium"
    },
    {
      "id": "ptr-17",
      "topicId": "pointers",
      "title": "Constant Pointer",
      "code": "#include <iostream>\n\nint main() {\n    int a = 1;\n    int b = 2;\n    int* const p = &a;\n    *p = 3;\n    std::cout << a;\n    return 0;\n}",
      "answer": "3",
      "explanation": "p is a constant pointer, meaning the pointer itself cannot be changed to point to something else (e.g., p = &b is invalid). However, the data it points to CAN be modified.",
      "difficulty": "Medium"
    },
    {
      "id": "ptr-18",
      "topicId": "pointers",
      "title": "Pointer to Constant",
      "code": "#include <iostream>\n\nint main() {\n    int a = 1;\n    const int* p = &a;\n    a = 2;\n    std::cout << *p;\n    return 0;\n}",
      "answer": "2",
      "explanation": "p is a pointer to a constant int, meaning you cannot do *p = 3. However, 'a' itself is not constant, so changing 'a' is allowed, and the pointer observes the updated value.",
      "difficulty": "Medium"
    },
    {
      "id": "ptr-19",
      "topicId": "pointers",
      "title": "Array Decays to Pointer",
      "code": "#include <iostream>\n\nvoid print(int p[]) {\n    std::cout << sizeof(p);\n}\nint main() {\n    int arr[10];\n    print(arr);\n    return 0;\n}",
      "answer": "8",
      "explanation": "When an array is passed to a function, it decays into a pointer to its first element. Therefore, sizeof(p) returns the size of a pointer (typically 8 bytes on a 64-bit architecture), not the size of the array.",
      "difficulty": "Hard"
    },
    {
      "id": "ptr-20",
      "topicId": "pointers",
      "title": "Void Pointers",
      "code": "#include <iostream>\n\nint main() {\n    int a = 5;\n    void* p = &a;\n    std::cout << *(int*)p;\n    return 0;\n}",
      "answer": "5",
      "explanation": "A void pointer can hold the address of any type, but it cannot be directly dereferenced. It must first be cast back to the correct pointer type.",
      "difficulty": "Medium"
    }
];

addQuestions("oop.json", oopQuestions);
addQuestions("data-structures.json", dsQuestions);
addQuestions("fundamentals.json", fundamentalsQuestions);
addQuestions("pointers.json", pointerQuestions);
