'use strict';

/**
 * QuizNova - question bank.
 *
 * Single source of truth for the demo content. The setup script seeds these
 * rows into MySQL and the API serves them to the browser, so the EJS files
 * never have to carry inline data.
 */

/** RAPIDHUNT live coding assessment - 24 C questions. */
const rapidhunt = [
    {
        id: 1,
        prompt: '1. What is the output of printf("%d", 10 == 10); in C?',
        code: '#include<stdio.h>\nint main() {\n   printf("%d", 10 == 10);\n   return 0;\n}',
        options: ['1', '0', '10', 'Compiler Error'],
        correct: 'A',
    },
    {
        id: 2,
        prompt: '2. Predict the output of pointer increment:',
        code: '#include<stdio.h>\nint main() {\n   int arr[] = {10, 20, 30};\n   int *p = arr;\n   printf("%d", *p++);\n   return 0;\n}',
        options: ['10', '20', '11', 'Garbage Value'],
        correct: 'A',
    },
    {
        id: 3,
        prompt: '3. What will be the size of an empty struct in C?',
        code: '#include<stdio.h>\nstruct Empty {};\nint main() {\n   printf("%lu", sizeof(struct Empty));\n   return 0;\n}',
        options: ['0 bytes in C / 1 byte in C++', '4 bytes', '8 bytes', 'Compilation Error in C'],
        correct: 'D',
    },
    {
        id: 4,
        prompt: '4. What is the default return type of un-prototyped functions in C89?',
        code: '#include<stdio.h>\nmain() {\n   printf("Hello World");\n}',
        options: ['void', 'int', 'char', 'float'],
        correct: 'B',
    },
    {
        id: 5,
        prompt: '5. Evaluate the bitwise expression output:',
        code: '#include<stdio.h>\nint main() {\n   int a = 5, b = 9;\n   printf("%d", a ^ b);\n   return 0;\n}',
        options: ['12', '14', '1', '0'],
        correct: 'A',
    },
    {
        id: 6,
        prompt: '6. What does malloc return if memory allocation fails?',
        code: '#include<stdio.h>\n#include<stdlib.h>\nint main() {\n   int *ptr = (int*) malloc(0);\n   return 0;\n}',
        options: ['NULL', '0', 'Implementation-defined (NULL or non-null)', 'Segmentation Fault'],
        correct: 'C',
    },
    {
        id: 7,
        prompt: '7. Guess the output of switch case without break statements:',
        code: '#include<stdio.h>\nint main() {\n   int i = 2;\n   switch(i) {\n      case 1: printf("1 ");\n      case 2: printf("2 ");\n      case 3: printf("3 ");\n      default: printf("D");\n   }\n   return 0;\n}',
        options: ['2', '2 3 D', '2 3', 'Compilation error'],
        correct: 'B',
    },
    {
        id: 8,
        prompt: '8. What is the value of x after the post-increment loop?',
        code: '#include<stdio.h>\nint main() {\n   int x = 0;\n   while(x++ < 5);\n   printf("%d", x);\n   return 0;\n}',
        options: ['5', '6', '4', '0'],
        correct: 'B',
    },
    {
        id: 9,
        prompt: '9. Result of dividing integer by floating point constant:',
        code: '#include<stdio.h>\nint main() {\n   printf("%f", 5 / 2.0);\n   return 0;\n}',
        options: ['2.500000', '2.000000', '2', 'Runtime Error'],
        correct: 'A',
    },
    {
        id: 10,
        prompt: '10. Storage class specification behavior:',
        code: '#include<stdio.h>\nint main() {\n   static int x;\n   printf("%d", x);\n   return 0;\n}',
        options: ['0', 'Garbage value', 'Compiler error', '1'],
        correct: 'A',
    },
    {
        id: 11,
        prompt: '11. String literal modifications result:',
        code: '#include<stdio.h>\nint main() {\n   char *str = "Hello";\n   str[0] = \'h\';\n   printf("%s", str);\n   return 0;\n}',
        options: ['hello', 'Hello', 'Segmentation Fault / Undefined Behavior', 'Compile error'],
        correct: 'C',
    },
    {
        id: 12,
        prompt: '12. Macro expansion behavior:',
        code: '#include<stdio.h>\n#define SQUARE(x) x * x\nint main() {\n   printf("%d", SQUARE(2 + 3));\n   return 0;\n}',
        options: ['25', '11', '15', '10'],
        correct: 'B',
    },
    {
        id: 13,
        prompt: '13. Ternary operator precedence check:',
        code: '#include<stdio.h>\nint main() {\n   int a = 10, b = 20;\n   int c = a > b ? a : b;\n   printf("%d", c);\n   return 0;\n}',
        options: ['10', '20', '1', '0'],
        correct: 'B',
    },
    {
        id: 14,
        prompt: '14. Address operator with array name:',
        code: '#include<stdio.h>\nint main() {\n   int arr[5] = {1, 2, 3, 4, 5};\n   printf("%p %p", (void*)arr, (void*)&arr);\n   return 0;\n}',
        options: ['Same memory address printed', 'Different addresses', 'Compiler error', 'Null pointers'],
        correct: 'A',
    },
    {
        id: 15,
        prompt: '15. Const pointer vs pointer to const:',
        code: '#include<stdio.h>\nint main() {\n   int x = 5;\n   const int *ptr = &x;\n   // *ptr = 10;\n   printf("%d", *ptr);\n   return 0;\n}',
        options: ['5', '10', 'Garbage value', 'Compile error'],
        correct: 'A',
    },
    {
        id: 16,
        prompt: '16. Guess the output of recursive call:',
        code: '#include<stdio.h>\nvoid func(int n) {\n   if (n > 0) {\n      func(n - 1);\n      printf("%d ", n);\n   }\n}\nint main() { func(3); return 0; }',
        options: ['1 2 3', '3 2 1', '3 3 3', '0 1 2 3'],
        correct: 'A',
    },
    {
        id: 17,
        prompt: '17. Bitwise left shift result:',
        code: '#include<stdio.h>\nint main() {\n   int x = 1;\n   printf("%d", x << 3);\n   return 0;\n}',
        options: ['8', '3', '4', '16'],
        correct: 'A',
    },
    {
        id: 18,
        prompt: '18. Modulo operation on floating numbers in C:',
        code: '#include<stdio.h>\nint main() {\n   // float res = 5.2 % 2.0;\n   printf("Error Test");\n   return 0;\n}',
        options: ['Compile error (modulus % requires integers)', '1.2', '1.0', '0.2'],
        correct: 'A',
    },
    {
        id: 19,
        prompt: '19. Logical operator short-circuiting:',
        code: '#include<stdio.h>\nint main() {\n   int a = 0, b = 5;\n   if (a && ++b)\n      printf("True");\n   printf("%d", b);\n   return 0;\n}',
        options: ['5', '6', 'True5', '0'],
        correct: 'A',
    },
    {
        id: 20,
        prompt: '20. Global variable scope & shadowed local:',
        code: '#include<stdio.h>\nint x = 100;\nint main() {\n   int x = 10;\n   printf("%d", x);\n   return 0;\n}',
        options: ['10', '100', 'Compilation error', '0'],
        correct: 'A',
    },
    {
        id: 21,
        prompt: '21. Guess the output of the following program:',
        code: '#include<stdio.h>\nint main()\n{\n   int x = 10;\n   float y = 10.0;\n   if(x == y)\n      printf("x and y are equal");\n   else\n      printf("x and y are not equal");\n   return 0;\n}',
        options: ['x and y are not equal', 'x and y are equal', 'Run time error', 'Syntax error'],
        correct: 'B', // in standard C, int 10 is promoted to float 10.0 and compares equal
    },
    {
        id: 22,
        prompt: '22. Sizeof character literal in C:',
        code: '#include<stdio.h>\nint main() {\n   printf("%lu", sizeof(\'a\'));\n   return 0;\n}',
        options: ['4 bytes (int in C)', '1 byte', '2 bytes', '8 bytes'],
        correct: 'A',
    },
    {
        id: 23,
        prompt: '23. Void pointer dereferencing rules:',
        code: '#include<stdio.h>\nint main() {\n   int a = 10;\n   void *ptr = &a;\n   printf("%d", *(int*)ptr);\n   return 0;\n}',
        options: ['10', 'Compile error', 'Garbage value', '0'],
        correct: 'A',
    },
    {
        id: 24,
        prompt: '24. Enum default integer values assignment:',
        code: '#include<stdio.h>\nenum Days { MON=1, TUE, WED };\nint main() {\n   printf("%d", WED);\n   return 0;\n}',
        options: ['3', '2', '1', '0'],
        correct: 'A',
    },
];

/** Practice runner used by the assessment page (5 questions). */
const assessmentRunner = [
    {
        id: 1,
        prompt: 'Which of the following methods returns a single Promise that fulfills when all of the promises passed as an iterable have fulfilled?',
        code: null,
        options: ['Promise.all()', 'Promise.race()', 'Promise.any()', 'Promise.settled()'],
        correct: 'A',
    },
    {
        id: 2,
        prompt: 'Which queue implementation returns elements in First-In-First-Out order?',
        code: null,
        options: ['Stack', 'Queue', 'Heap', 'Hash Table'],
        correct: 'B',
    },
    {
        id: 3,
        prompt: 'What is the time complexity of a balanced binary search tree lookup?',
        code: null,
        options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
        correct: 'B',
    },
    {
        id: 4,
        prompt: 'Which HTTP status code means "Created successfully"?',
        code: null,
        options: ['200 OK', '201 Created', '204 No Content', '301 Moved Permanently'],
        correct: 'B',
    },
    {
        id: 5,
        prompt: 'In Big-O notation, which growth is the slowest for large inputs?',
        code: null,
        options: ['O(log n)', 'O(n)', 'O(n log n)', 'O(1)'],
        correct: 'D',
    },
];

/** Demo classes shown on the classes page. */
const classes = [
    {
        code: 'CS101',
        title: 'Introduction to Computer Science',
        department: 'Computer Science',
        instructor: 'Kakashi Hatake',
        status: 'ACTIVE',
        isLive: 1,
        schedule: 'Mon & Wed • 10:00 AM - 11:30 AM',
        description: 'Foundations of programming, data structures and algorithmic thinking.',
    },
    {
        code: 'MATH202',
        title: 'Calculus II: Derivatives & Integrals',
        department: 'Mathematics',
        instructor: 'Hiruzen Sarutobi',
        status: 'ACTIVE',
        isLive: 0,
        schedule: 'Tue & Thu • 1:00 PM - 2:30 PM',
        description: 'Advanced differentiation, integration techniques and series.',
    },
    {
        code: 'PHYS301',
        title: 'Quantum Wave Equations',
        department: 'Physics',
        instructor: 'Dr. Richard Feynman',
        status: 'ACTIVE',
        isLive: 0,
        schedule: 'Fri • 9:00 AM - 12:00 PM',
        description: 'Schrodinger equations, normalisation and quantum states.',
    },
    {
        code: 'ENG104',
        title: 'Modernism & Contemporary Literature',
        department: 'English',
        instructor: 'Sasuke Uchiha',
        status: 'ACTIVE',
        isLive: 0,
        schedule: 'Wed • 3:00 PM - 4:30 PM',
        description: 'From the early 20th century to the present day.',
    },
    {
        code: 'HIST201',
        title: 'World History: Ancient Civilisations',
        department: 'History',
        instructor: 'Minato Namikaze',
        status: 'COMPLETED',
        isLive: 0,
        schedule: 'Completed - Fall Semester',
        description: 'Monuments, empires and trade routes of the ancient world.',
    },
    {
        code: 'DES102',
        title: 'UI Color Theory & Gradients',
        department: 'Design',
        instructor: 'Jiraiya Sensei',
        status: 'ACTIVE',
        isLive: 0,
        schedule: 'Fri • 2:00 PM - 4:00 PM',
        description: 'Colour wheels, contrast ratios and gradient systems for interfaces.',
    },
];

/** Demo assessments shown on the assessment page. */
const assessments = [
    {
        slug: 'async-js-promises',
        title: 'Quiz #4: Async JS & Promises',
        subject: 'Computer Science',
        type: 'QUIZ',
        status: 'IN_PROGRESS',
        durationMinutes: 20,
        classCode: 'CS101',
        questions: assessmentRunner,
    },
    {
        slug: 'derivatives-integrals-midterm',
        title: 'Midterm Exam: Derivatives & Integrals',
        subject: 'Mathematics',
        type: 'MIDTERM',
        status: 'UPCOMING',
        durationMinutes: 45,
        classCode: 'MATH202',
        questions: assessmentRunner,
    },
    {
        slug: 'ui-color-theory',
        title: 'UI Color Theory & Gradients Test',
        subject: 'Graphic Design',
        type: 'QUIZ',
        status: 'UPCOMING',
        durationMinutes: 15,
        classCode: 'DES102',
        questions: assessmentRunner,
    },
    {
        slug: 'quantum-wave-equations',
        title: 'Quantum Wave Equations Quiz',
        subject: 'Physics',
        type: 'QUIZ',
        status: 'COMPLETED',
        durationMinutes: 20,
        classCode: 'PHYS301',
        questions: assessmentRunner,
    },
    {
        slug: 'modernism-analysis',
        title: 'Literature Essay: Modernism Analysis',
        subject: 'English',
        type: 'ASSIGNMENT',
        status: 'COMPLETED',
        durationMinutes: 60,
        classCode: 'ENG104',
        questions: assessmentRunner,
    },
];

/**
 * Demo attempts.
 *
 * They give the progress page (the mastery map) something to show right
 * after the setup: `user` is the username, `slug` the quiz, `daysAgo` how
 * long ago the attempt was submitted and `score` the percentage.
 */
const attempts = [
    { user: 'alex', slug: 'modernism-analysis', score: 92, correct: 23, total: 25, seconds: 3120, daysAgo: 6 },
    { user: 'alex', slug: 'derivatives-integrals-midterm', score: 78, correct: 14, total: 18, seconds: 1980, daysAgo: 5 },
    { user: 'alex', slug: 'async-js-promises', score: 84, correct: 21, total: 25, seconds: 1560, daysAgo: 4 },
    { user: 'alex', slug: 'quantum-wave-equations', score: 64, correct: 16, total: 25, seconds: 1740, daysAgo: 3 },
    { user: 'alex', slug: 'ui-color-theory', score: 88, correct: 22, total: 25, seconds: 1020, daysAgo: 2 },
    { user: 'alex', slug: 'derivatives-integrals-midterm', score: 86, correct: 16, total: 18, seconds: 1410, daysAgo: 1 },
    { user: 'alex', slug: 'rapidhunt-live-coding', score: 72, correct: 17, total: 24, seconds: 1680, daysAgo: 0 },

    { user: 'maria', slug: 'derivatives-integrals-midterm', score: 95, correct: 18, total: 18, seconds: 1620, daysAgo: 5 },
    { user: 'maria', slug: 'quantum-wave-equations', score: 89, correct: 22, total: 25, seconds: 1500, daysAgo: 3 },
    { user: 'maria', slug: 'modernism-analysis', score: 81, correct: 20, total: 25, seconds: 2760, daysAgo: 1 },
];

module.exports = {
    rapidhunt,
    assessmentRunner,
    classes,
    assessments,
    attempts,
};
