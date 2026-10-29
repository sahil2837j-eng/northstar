export interface HarnessTest {
  name?: string;
  args?: unknown[];
  argsExpr?: string;
  call?: unknown[];
  calls?: number;
  expected: unknown;
}

export interface CurriculumExercise {
  id: string;
  topic: string;
  title: string;
  fn: string;
  params: string;
  prompt: string;
  example: string;
  starter: string;
  tests: HarnessTest[];
  ref: string;
  anti: string[];
  hints: string[];
  difficulty: 1 | 2 | 3;
  reviewStatus: "generated" | "reviewed";
}

export const TOPICS: { id: string; name: string; order: number }[] = [
  { id: "vars", name: "Variables & assignment", order: 1 },
  { id: "cond", name: "Conditionals", order: 2 },
  { id: "loops", name: "Loops", order: 3 },
  { id: "funcs", name: "Functions", order: 4 },
  { id: "arrays", name: "Arrays", order: 5 },
  { id: "objects", name: "Objects", order: 6 },
  { id: "scope", name: "Scope & closures", order: 7 },
];

const starterFor = (fn: string, params: string) =>
  `function ${fn}(${params}) {\n  // write your answer here\n}\n`;

type Raw = [
  id: string,
  topic: string,
  fn: string,
  params: string,
  title: string,
  prompt: string,
  example: string,
  tests: HarnessTest[],
  ref: string,
  anti: string[],
  hints: string[],
  difficulty: 1 | 2 | 3,
  reviewStatus?: "generated" | "reviewed",
];

function make(r: Raw): CurriculumExercise {
  const [id, topic, fn, params, title, prompt, example, tests, ref, anti, hints, difficulty, rs] = r;
  return {
    id,
    topic,
    fn,
    params,
    title,
    prompt,
    example,
    tests,
    ref,
    anti,
    hints,
    difficulty,
    starter: starterFor(fn, params),
    reviewStatus: rs ?? "generated",
  };
}

const RAW: Raw[] = [
  /* ---------- variables & assignment ---------- */
  [
    "v1", "vars", "calculateTotal", "price, quantity",
    "calculateTotal",
    "Return the line total: price multiplied by quantity. Prices may be decimals.",
    "calculateTotal(19.99, 2) → 39.98",
    [
      { args: [10, 3], expected: 30 },
      { args: [19.99, 2], expected: 39.98 },
      { args: [0, 5], expected: 0 },
      { args: [12.5, 0], expected: 0 },
    ],
    "function calculateTotal(price, quantity) {\n  return price * quantity;\n}",
    ["function calculateTotal(price, quantity) {\n  return price + quantity;\n}",
     "function calculateTotal(price, quantity) {\n  return price * quantity * 100;\n}"],
    [
      "Two numbers come in, one number goes out: price × quantity.",
      "Arithmetic operator, no rounding needed.",
      "return price ___ quantity;",
      "areaOf(3, 4) is 12 because 3 × 4. Same shape here.",
    ],
    1,
  ],
  [
    "v2", "vars", "swapValues", "a, b",
    "swapValues",
    "Return the two values in the opposite order, as a two-item array: b first, a second.",
    "swapValues(1, 2) → [2, 1]",
    [
      { args: [1, 2], expected: [2, 1] },
      { args: ["x", "y"], expected: ["y", "x"] },
      { args: [null, 5], expected: [5, null] },
      { args: [true, false], expected: [false, true] },
    ],
    "function swapValues(a, b) {\n  return [b, a];\n}",
    ["function swapValues(a, b) {\n  return [a, b];\n}",
     "function swapValues(a, b) {\n  a = b;\n  return [a, b];\n}"],
    [
      "Build a new array where the first slot holds b and the second holds a.",
      "Array literal.",
      "return [___, ___];",
      "firstOf(['a','b']) returns 'a'; here you want the second one first.",
    ],
    1,
  ],
  [
    "v3", "vars", "minutesToClock", "totalMinutes",
    "minutesToClock",
    "Convert minutes since midnight into a 24-hour clock string \"H:MM\". Wrap past 1440 and handle negative input.",
    "minutesToClock(95) → \"1:35\"",
    [
      { args: [0], expected: "0:00" },
      { args: [95], expected: "1:35" },
      { args: [1439], expected: "23:59" },
      { args: [1500], expected: "1:00" },
      { args: [-30], expected: "23:30" },
    ],
    "function minutesToClock(totalMinutes) {\n  const m = ((totalMinutes % 1440) + 1440) % 1440;\n  const h = Math.floor(m / 60);\n  const mm = String(m % 60).padStart(2, \"0\");\n  return h + \":\" + mm;\n}",
    ["function minutesToClock(totalMinutes) {\n  return Math.floor(totalMinutes / 60) + \":\" + (totalMinutes % 60);\n}",
     "function minutesToClock(totalMinutes) {\n  const m = totalMinutes % 1440;\n  return Math.floor(m / 60) + \":\" + String(m % 60);\n}"],
    [
      "Split minutes into whole hours and the leftover minutes, inside a 24 hour wrap.",
      "Remainder operator plus String.padStart.",
      "const m = ((total ___ 1440) + 1440) ___ 1440;",
      "75 minutes is 1 hour and 15 minutes → \"1:15\". Now make the hours wrap.",
    ],
    2,
  ],
  [
    "v4", "vars", "makeStatusMessage", "name, count",
    "makeStatusMessage",
    "Return \"<name> has <count> item\" or \"<name> has <count> items\", using the singular only when count is exactly 1.",
    "makeStatusMessage(\"Ada\", 1) → \"Ada has 1 item\"",
    [
      { args: ["Ada", 1], expected: "Ada has 1 item" },
      { args: ["Ada", 3], expected: "Ada has 3 items" },
      { args: ["Linus", 0], expected: "Linus has 0 items" },
      { args: ["Grace", 100], expected: "Grace has 100 items" },
    ],
    "function makeStatusMessage(name, count) {\n  const noun = count === 1 ? \"item\" : \"items\";\n  return name + \" has \" + count + \" \" + noun;\n}",
    ["function makeStatusMessage(name, count) {\n  return name + \" has \" + count + \" item\";\n}",
     "function makeStatusMessage(name, count) {\n  return name + \" have \" + count + \" items\";\n}"],
    [
      "One word changes with the count; everything else is fixed text.",
      "Ternary on count === 1 choosing \"item\" vs \"items\".",
      "const noun = count === 1 ? \"____\" : \"____\";",
      "plural of 1 cat is \"1 cat\"; plural of 3 cats is \"3 cats\".",
    ],
    1,
  ],

  /* ---------- conditionals ---------- */
  [
    "c1", "cond", "gradeLabel", "score",
    "gradeLabel",
    "Return A for 90 and above, B for 80–89, C for 70–79, D for 60–69, otherwise F. Scores are whole numbers.",
    "gradeLabel(95) → \"A\"",
    [
      { args: [95], expected: "A" },
      { args: [90], expected: "A" },
      { args: [80], expected: "B" },
      { args: [70], expected: "C" },
      { args: [65], expected: "D" },
      { args: [59], expected: "F" },
    ],
    "function gradeLabel(score) {\n  if (score >= 90) return \"A\";\n  if (score >= 80) return \"B\";\n  if (score >= 70) return \"C\";\n  if (score >= 60) return \"D\";\n  return \"F\";\n}",
    ["function gradeLabel(score) {\n  if (score > 90) return \"A\";\n  return \"F\";\n}",
     "function gradeLabel(score) {\n  if (score >= 90) \"A\";\n  else if (score >= 80) \"B\";\n}"],
    [
      "Bands of ten, checked from the top down.",
      "Ordered if / else-if chain with early returns.",
      "if (score >= ___) return \"A\"; else if (score >= ___) return \"B\";",
      "92 is A and 92 is also above 80 — so test 90 first.",
    ],
    1,
  ],
  [
    "c2", "cond", "clampNumber", "value, min, max",
    "clampNumber",
    "Keep value inside the range: return it unchanged if it is between min and max, otherwise return the nearest bound.",
    "clampNumber(42, 0, 10) → 10",
    [
      { args: [5, 0, 10], expected: 5 },
      { args: [-3, 0, 10], expected: 0 },
      { args: [42, 0, 10], expected: 10 },
      { args: [7, 7, 7], expected: 7 },
      { args: [0.5, 0, 1], expected: 0.5 },
    ],
    "function clampNumber(value, min, max) {\n  if (value < min) return min;\n  if (value > max) return max;\n  return value;\n}",
    ["function clampNumber(value, min, max) {\n  return min;\n}",
     "function clampNumber(value, min, max) {\n  return Math.min(min, Math.max(max, value));\n}"],
    [
      "Pin a value to the edges of a range.",
      "Two comparisons, or Math.min with Math.max in the right order.",
      "if (value ___ min) return min; if (value ___ max) return max;",
      "A thermometer reading below zero reports 0, above 100 reports 100, in between reports itself.",
    ],
    1,
  ],
  [
    "c3", "cond", "shippingCost", "total",
    "shippingCost",
    "Orders of 100 or more ship free. Orders of 50 to 99.99 cost 5.95. Anything below 50 costs 9.95.",
    "shippingCost(120) → 0",
    [
      { args: [120], expected: 0 },
      { args: [100], expected: 0 },
      { args: [99.99], expected: 5.95 },
      { args: [50], expected: 5.95 },
      { args: [49.99], expected: 9.95 },
    ],
    "function shippingCost(total) {\n  if (total >= 100) return 0;\n  if (total >= 50) return 5.95;\n  return 9.95;\n}",
    ["function shippingCost(total) {\n  if (total > 100) return 0;\n  return 9.95;\n}",
     "function shippingCost(total) {\n  if (total >= 100) return 0;\n  else if (total <= 50) return 5.95;\n  return 9.95;\n}"],
    [
      "Three price bands, cheapest shipping at the top.",
      "Ordered thresholds, highest first.",
      "if (total >= ___) return 0; if (total >= ___) return 5.95;",
      "A lift has capacity 10 — at 10 it is full, so the boundary includes the number.",
    ],
    1,
  ],
  [
    "c4", "cond", "isStrongEnoughPassword", "password",
    "isStrongEnoughPassword",
    "Return true only when the password is at least 8 characters long, contains at least one letter, and at least one digit.",
    "isStrongEnoughPassword(\"Abcd1234\") → true",
    [
      { args: ["Abcd1234"], expected: true },
      { args: ["abc123"], expected: false },
      { args: ["abcdefgh"], expected: false },
      { args: ["12345678"], expected: false },
      { args: ["aB3x!"], expected: false },
    ],
    "function isStrongEnoughPassword(password) {\n  const hasLetter = /[a-z]/i.test(password);\n  const hasDigit = /[0-9]/.test(password);\n  return password.length >= 8 && hasLetter && hasDigit;\n}",
    ["function isStrongEnoughPassword(password) {\n  return password.length >= 8;\n}",
     "function isStrongEnoughPassword(password) {\n  return password.length > 8 && hasLetter && hasDigit;\n}"],
    [
      "Three separate conditions must all be true at once.",
      "&& with a length check and two regex tests.",
      "return password.length ___ 8 && /[a-z]/i.test(password) && /[0-9]/.test(password);",
      "A box opens only when all three keys turn; turning two is not enough.",
    ],
    2,
  ],

  /* ---------- loops ---------- */
  [
    "l1", "loops", "sumNumbers", "numbers",
    "sumNumbers",
    "Return the sum of the numbers in the array. An empty array sums to 0.",
    "sumNumbers([1, 2, 3]) → 6",
    [
      { args: [[1, 2, 3]], expected: 6 },
      { args: [[]], expected: 0 },
      { args: [[-4, 4]], expected: 0 },
      { args: [[0.1, 0.2]], expected: 0.3 },
      { args: [[100, 200, 300]], expected: 600 },
    ],
    "function sumNumbers(numbers) {\n  let total = 0;\n  for (const n of numbers) total += n;\n  return total;\n}",
    ["function sumNumbers(numbers) {\n  return numbers[0];\n}",
     "function sumNumbers(numbers) {\n  let total;\n  for (const n of numbers) total += n;\n  return total;\n}"],
    [
      "Walk the array once, adding each value into a running total.",
      "for…of with an accumulator initialised to 0.",
      "let total = ___; for (const n of ___) total ___ n;",
      "Running balance: start at 0, add each deposit, read it at the end.",
    ],
    1,
  ],
  [
    "l2", "loops", "countVowels", "text",
    "countVowels",
    "Count the vowels a, e, i, o, u in the text, ignoring case. Everything else is not a vowel.",
    "countVowels(\"Hello World\") → 3",
    [
      { args: ["Hello World"], expected: 3 },
      { args: [""], expected: 0 },
      { args: ["XYZ"], expected: 0 },
      { args: ["aeiouAEIOU"], expected: 10 },
      { args: ["NorthStar"], expected: 2 },
    ],
    "function countVowels(text) {\n  let count = 0;\n  const vowels = \"aeiou\";\n  const lower = text.toLowerCase();\n  for (let i = 0; i < lower.length; i++) {\n    if (vowels.includes(lower[i])) count++;\n  }\n  return count;\n}",
    ["function countVowels(text) {\n  return text.length;\n}",
     "function countVowels(text) {\n  let count = 0;\n  for (const ch of text) if (\"aeiou\".includes(ch)) count++;\n  return count;\n}"],
    [
      "Count only the letters in the vowel set, upper or lower case.",
      "toLowerCase plus String.includes, or a RegExp test.",
      "const lower = text.____(); if (vowels.____(lower[i])) count++;",
      "\"AE\" has two vowels because case does not matter.",
    ],
    1,
  ],
  [
    "l3", "loops", "findFirstNegative", "numbers",
    "findFirstNegative",
    "Return the first negative number in the array. If there is none, return null.",
    "findFirstNegative([3, -2, 5]) → -2",
    [
      { args: [[3, -2, 5]], expected: -2 },
      { args: [[1, 2]], expected: null },
      { args: [[-9]], expected: -9 },
      { args: [[]], expected: null },
      { args: [[0, -1, -2]], expected: -1 },
    ],
    "function findFirstNegative(numbers) {\n  for (const n of numbers) {\n    if (n < 0) return n;\n  }\n  return null;\n}",
    ["function findFirstNegative(numbers) {\n  return numbers.filter(n => n < 0)[0];\n}",
     "function findFirstNegative(numbers) {\n  let last = null;\n  for (const n of numbers) if (n < 0) last = n;\n  return last;\n}"],
    [
      "Scan left to right and stop at the first value below zero.",
      "Early return inside the loop, null after it.",
      "for (const n of ___) { if (n ___ 0) return n; } return ___;",
      "First matching seat in a row: you stop walking once you find it.",
    ],
    2,
  ],
  [
    "l4", "loops", "repeatText", "text, times",
    "repeatText",
    "Return the text repeated exactly times times. times of 0 returns an empty string.",
    "repeatText(\"ab\", 3) → \"ababab\"",
    [
      { args: ["ab", 3], expected: "ababab" },
      { args: ["x", 0], expected: "" },
      { args: ["-", 5], expected: "-----" },
      { args: ["", 4], expected: "" },
      { args: ["yo", 1], expected: "yo" },
    ],
    "function repeatText(text, times) {\n  let out = \"\";\n  for (let i = 0; i < times; i++) out += text;\n  return out;\n}",
    ["function repeatText(text, times) {\n  return text * times;\n}",
     "function repeatText(text, times) {\n  let out = text;\n  for (let i = 1; i < times; i++) out += text;\n  return out;\n}"],
    [
      "Append the text to an empty string, times times.",
      "A counted for loop with +=.",
      "let out = \"\"; for (let i = 0; i ___ times; i++) out ___ text;",
      "Three stamps on a page make the pattern three times over.",
    ],
    1,
  ],

  /* ---------- functions ---------- */
  [
    "f1", "funcs", "isEven", "n",
    "isEven",
    "Return true when n is an even integer, false otherwise. Negative numbers count too.",
    "isEven(-2) → true",
    [
      { args: [4], expected: true },
      { args: [-3], expected: false },
      { args: [-2], expected: true },
      { args: [0], expected: true },
      { args: [7], expected: false },
    ],
    "function isEven(n) {\n  return n % 2 === 0;\n}",
    ["function isEven(n) {\n  return n / 2 === Math.round(n / 2) && n > 0;\n}",
     "function isEven(n) {\n  return n % 2;\n}"],
    [
      "A number is even when dividing by two leaves no remainder.",
      "Remainder operator compared with 0.",
      "return n ___ 2 ___ 0;",
      "Pairs of socks: 4 divides into 2 pairs exactly, 5 leaves one out.",
    ],
    1,
  ],
  [
    "f2", "funcs", "rectangleArea", "width, height",
    "rectangleArea",
    "Return the area of a rectangle. Either side may be zero or a decimal.",
    "rectangleArea(3, 4) → 12",
    [
      { args: [3, 4], expected: 12 },
      { args: [0, 5], expected: 0 },
      { args: [2.5, 2], expected: 5 },
      { args: [-2, 3], expected: -6 },
    ],
    "function rectangleArea(width, height) {\n  return width * height;\n}",
    ["function rectangleArea(width, height) {\n  return 2 * (width + height);\n}",
     "function rectangleArea(width, height) {\n  return width + height;\n}"],
    [
      "Width times height, one line.",
      "Multiplication.",
      "return width ___ height;",
      "Carpet for a 3 m by 4 m room covers 12 square metres.",
    ],
    1,
  ],
  [
    "f3", "funcs", "applyTwice", "fn, value",
    "applyTwice",
    "Apply the function fn to value, then apply it again to that result, and return it.",
    "applyTwice(x => x + 1, 5) → 7",
    [
      { argsExpr: "[x => x + 1, 5]", expected: 7 },
      { argsExpr: "[x => x * 2, 3]", expected: 12 },
      { argsExpr: "[s => s + '!', 'hi']", expected: "hi!!" },
      { argsExpr: "[x => x + '0', 'a']", expected: "a00" },
    ],
    "function applyTwice(fn, value) {\n  return fn(fn(value));\n}",
    ["function applyTwice(fn, value) {\n  return fn(value);\n}",
     "function applyTwice(fn, value) {\n  return fn(value) + fn(value);\n}"],
    [
      "Feed the output of the first call straight into the second.",
      "Nested call: fn(fn(value)).",
      "return fn(____(value));",
      "twice(x => x * 3, 2) → first 6, then 18.",
    ],
    2,
  ],
  [
    "f4", "funcs", "makeFormatter", "prefix, suffix",
    "makeFormatter",
    "Return a function that takes one value and returns prefix + value + suffix.",
    "makeFormatter(\"#\", \"!\")(7) → \"#7!\"",
    [
      { args: ["[ ", " ]"], call: ["data"], expected: "[ data ]" },
      { args: ["#", "!"], call: [7], expected: "#7!" },
      { args: ["", " kg"], call: [12], expected: "12 kg" },
    ],
    "function makeFormatter(prefix, suffix) {\n  return function (value) {\n    return prefix + value + suffix;\n  };\n}",
    ["function makeFormatter(prefix, suffix) {\n  return prefix + value + suffix;\n}",
     "function makeFormatter(prefix, suffix) {\n  return function (value) {\n    return value;\n  };\n}"],
    [
      "Build a function that remembers the prefix and suffix you gave it.",
      "A returned function expression (closure).",
      "return function (value) { return ____ + value + ____; };",
      "A rubber stamp keeps its engraving; every page you press gets the same mark.",
    ],
    2,
  ],

  /* ---------- arrays ---------- */
  [
    "a1", "arrays", "filterEntriesByDate", "entries, dateKey",
    "filterEntriesByDate",
    "Return a new array holding only the entries whose date equals dateKey, keeping their original order. Do not mutate the input.",
    "filterEntriesByDate([{date:\"2026-01-02\",t:1},{date:\"2026-01-03\",t:2}], \"2026-01-02\") → [{date:\"2026-01-02\",t:1}]",
    [
      {
        args: [
          [
            { date: "2026-01-02", t: 1 },
            { date: "2026-01-03", t: 2 },
            { date: "2026-01-02", t: 3 },
          ],
          "2026-01-02",
        ],
        expected: [
          { date: "2026-01-02", t: 1 },
          { date: "2026-01-02", t: 3 },
        ],
      },
      { args: [[{ date: "2026-01-05", t: 9 }], "2026-01-06"], expected: [] },
      { args: [[], "2026-01-02"], expected: [] },
    ],
    "function filterEntriesByDate(entries, dateKey) {\n  const out = [];\n  for (const e of entries) {\n    if (e.date === dateKey) out.push(e);\n  }\n  return out;\n}",
    ["function filterEntriesByDate(entries, dateKey) {\n  return entries.filter(e => e.date !== dateKey);\n}",
     "function filterEntriesByDate(entries, dateKey) {\n  entries.forEach(e => { if (e.date === dateKey) return e; });\n  return [];\n}"],
    [
      "Keep only the items whose date matches, in the order they arrived.",
      "Array.prototype.filter.",
      "return entries.filter(e => e.____ === ____);",
      "filter([1,2,3], x => x > 1) keeps 2 and 3 and drops 1.",
    ],
    2,
  ],
  [
    "a2", "arrays", "getTitles", "items",
    "getTitles",
    "Return an array of the title values from the items, in the same order.",
    "getTitles([{title:\"a\"},{title:\"b\"}]) → [\"a\", \"b\"]",
    [
      { args: [[{ title: "a" }, { title: "b" }]], expected: ["a", "b"] },
      { args: [[]], expected: [] },
      { args: [[{ title: "run" }, { title: "read" }, { title: "rest" }]], expected: ["run", "read", "rest"] },
    ],
    "function getTitles(items) {\n  const out = [];\n  for (const it of items) out.push(it.title);\n  return out;\n}",
    ["function getTitles(items) {\n  return items.map(i => i.name);\n}",
     "function getTitles(items) {\n  return items.title;\n}"],
    [
      "Pull one property out of every item, producing a list of strings.",
      "Array.prototype.map.",
      "return items.map(it => it.____);",
      "Names from a list of people: one name each, same order.",
    ],
    1,
  ],
  [
    "a3", "arrays", "uniqueValues", "values",
    "uniqueValues",
    "Return the values with duplicates removed, keeping the first appearance of each.",
    "uniqueValues([1,2,1,3,2]) → [1,2,3]",
    [
      { args: [[1, 2, 1, 3, 2]], expected: [1, 2, 3] },
      { args: [["a", "a"]], expected: ["a"] },
      { args: [[]], expected: [] },
      { args: [[null, null, 1]], expected: [null, 1] },
      { args: [[{ k: 1 }, { k: 1 }]], expected: [{ k: 1 }, { k: 1 }] },
    ],
    "function uniqueValues(values) {\n  const seen = [];\n  for (const v of values) {\n    if (!seen.includes(v)) seen.push(v);\n  }\n  return seen;\n}",
    ["function uniqueValues(values) {\n  return values.reverse().filter((v, i) => values.indexOf(v) === i).reverse();\n}",
     "function uniqueValues(values) {\n  return values.filter((v, i) => values.indexOf(v) !== i);\n}"],
    [
      "Add a value only when you have not already added it.",
      "includes / indexOf inside a loop, or a Set with a first-seen order.",
      "if (!seen.____(v)) ____;",
      "A guest list: you write each name once, the first time you hear it.",
    ],
    2,
  ],
  [
    "a4", "arrays", "groupEntriesByDay", "entries",
    "groupEntriesByDay",
    "Group the entries into an object keyed by each entry's date. Each value is the array of entries for that date, in original order.",
    "groupEntriesByDay([{date:\"2026-01-02\",t:1},{date:\"2026-01-02\",t:2}]) → {\"2026-01-02\":[…, …]}",
    [
      {
        args: [[{ date: "2026-01-02", t: 1 }, { date: "2026-01-03", t: 2 }, { date: "2026-01-02", t: 3 }]],
        expected: {
          "2026-01-02": [{ date: "2026-01-02", t: 1 }, { date: "2026-01-02", t: 3 }],
          "2026-01-03": [{ date: "2026-01-03", t: 2 }],
        },
      },
      { args: [[]], expected: {} },
      {
        args: [[{ date: "2026-01-02", t: 1 }]],
        expected: { "2026-01-02": [{ date: "2026-01-02", t: 1 }] },
      },
    ],
    "function groupEntriesByDay(entries) {\n  const groups = {};\n  for (const e of entries) {\n    if (!groups[e.date]) groups[e.date] = [];\n    groups[e.date].push(e);\n  }\n  return groups;\n}",
    ["function groupEntriesByDay(entries) {\n  return entries;\n}",
     "function groupEntriesByDay(entries) {\n  const groups = {};\n  for (const e of entries) groups[e.date] = e;\n  return groups;\n}"],
    [
      "One bucket per date; push each entry into its bucket.",
      "Object as a map, initialise the array before pushing.",
      "if (!groups[____]) groups[____] = []; groups[____].push(e);",
      "Filing trays labelled by date: put each paper in its own tray, stacking.",
    ],
    3,
  ],

  /* ---------- objects ---------- */
  [
    "o1", "objects", "countByDomain", "entries",
    "countByDomain",
    "Count how many entries carry each domain. Entries without a domain are ignored.",
    "countByDomain([{domain:\"craft\"},{domain:\"craft\"}]) → {craft: 2}",
    [
      {
        args: [[{ domain: "craft" }, { domain: "craft" }, { domain: "health" }]],
        expected: { craft: 2, health: 1 },
      },
      { args: [[{ domain: "craft" }, { minutes: 5 }]], expected: { craft: 1 } },
      { args: [[]], expected: {} },
    ],
    "function countByDomain(entries) {\n  const counts = {};\n  for (const e of entries) {\n    if (!e.domain) continue;\n    counts[e.domain] = (counts[e.domain] || 0) + 1;\n  }\n  return counts;\n}",
    ["function countByDomain(entries) {\n  const counts = {};\n  for (const e of entries) counts[e.domain]++;\n  return counts;\n}",
     "function countByDomain(entries) {\n  return entries.length;\n}"],
    [
      "Tally by key, starting each key at zero.",
      "Accumulator pattern on an object: (counts[key] || 0) + 1.",
      "counts[e.domain] = (counts[____] || 0) + ____;",
      "Tally marks in a notebook: first mark opens the column, each later mark adds one.",
    ],
    2,
  ],
  [
    "o2", "objects", "mergeDefaults", "defaults, options",
    "mergeDefaults",
    "Return a new object containing every key from defaults and options. When a key appears in both, the options value wins.",
    "mergeDefaults({a:1,b:2},{b:9}) → {a:1,b:9}",
    [
      { args: [{ a: 1, b: 2 }, { b: 9, c: 3 }], expected: { a: 1, b: 9, c: 3 } },
      { args: [{ theme: "dark" }, {}], expected: { theme: "dark" } },
      { args: [{}, { lang: "en" }], expected: { lang: "en" } },
      { args: [{ a: 1, z: 3 }, { z: 4 }], expected: { a: 1, z: 4 } },
    ],
    "function mergeDefaults(defaults, options) {\n  const out = {};\n  for (const k of Object.keys(defaults)) out[k] = defaults[k];\n  for (const k of Object.keys(options)) out[k] = options[k];\n  return out;\n}",
    ["function mergeDefaults(defaults, options) {\n  return defaults;\n}",
     "function mergeDefaults(defaults, options) {\n  return Object.assign({}, options, defaults);\n}"],
    [
      "Start from the defaults, then let the caller's options overwrite.",
      "Object spread, or Object.assign({}, defaults, options).",
      "return { ...____, ...____ };",
      "A form with pre-filled answers: whatever the user typed replaces the pre-fill.",
    ],
    2,
  ],
  [
    "o3", "objects", "updateSetting", "settings, key, value",
    "updateSetting",
    "Return a new settings object with key set to value. Do not mutate the object you were given.",
    "updateSetting({theme:\"dark\"}, \"lang\", \"fr\") → {theme:\"dark\", lang:\"fr\"}",
    [
      { args: [{ theme: "dark", lang: "en" }, "lang", "fr"], expected: { theme: "dark", lang: "fr" } },
      { args: [{ theme: "dark" }, "compact", true], expected: { theme: "dark", compact: true } },
      { args: [{}, "a", 1], expected: { a: 1 } },
    ],
    "function updateSetting(settings, key, value) {\n  const out = {};\n  for (const k of Object.keys(settings)) out[k] = settings[k];\n  out[key] = value;\n  return out;\n}",
    ["function updateSetting(settings, key, value) {\n  settings[key] = value;\n  return settings;\n}",
     "function updateSetting(settings, key, value) {\n  return settings;\n}"],
    [
      "Copy first, change the copy — the original must stay untouched.",
      "Spread plus a computed key.",
      "return { ...____, [____]: ____ };",
      "Photocopy the form, then write on the copy.",
    ],
    2,
  ],
  [
    "o4", "objects", "summarizeEntries", "entries",
    "summarizeEntries",
    "Return { total, days, linked }: total entries, the number of distinct date values, and how many entries have a truthy goalId.",
    "summarizeEntries([{date:\"a\",goalId:\"g\"},{date:\"a\"}]) → {total:2, days:1, linked:1}",
    [
      {
        args: [[{ date: "2026-01-02", goalId: "g" }, { date: "2026-01-02" }, { date: "2026-01-03", goalId: "g2" }]],
        expected: { total: 3, days: 2, linked: 2 },
      },
      { args: [[]], expected: { total: 0, days: 0, linked: 0 } },
      {
        args: [[{ date: "x" }, { date: "x" }]],
        expected: { total: 2, days: 1, linked: 0 },
      },
    ],
    "function summarizeEntries(entries) {\n  const seenDates = [];\n  let linked = 0;\n  for (const e of entries) {\n    if (seenDates.indexOf(e.date) === -1) seenDates.push(e.date);\n    if (e.goalId) linked++;\n  }\n  return { total: entries.length, days: seenDates.length, linked: linked };\n}",
    ["function summarizeEntries(entries) {\n  return { total: entries.length, days: entries.length, linked: 0 };\n}",
     "function summarizeEntries(entries) {\n  return { total: entries.length, days: new Set(entries.map(e => e.date)).size };\n}"],
    [
      "Three counts in one object: length, distinct dates, entries with a goal.",
      "Set for distinct dates, a counter for links.",
      "const dates = new Set(entries.map(e => e.____)); return { total: ___, days: ___.size, linked };",
      "A month page: count the notes, count the days that have notes, count the starred ones.",
    ],
    3,
  ],

  /* ---------- scope & closures ---------- */
  [
    "s1", "scope", "makeCounter", "",
    "makeCounter",
    "Return a function that returns 1 on its first call, 2 on its second, and so on. Each call keeps its own growing state.",
    "const c = makeCounter(); c() → 1; c() → 2",
    [
      { args: [], calls: 1, expected: 1 },
      { args: [], calls: 3, expected: 3 },
      { args: [], calls: 5, expected: 5 },
    ],
    "function makeCounter() {\n  let n = 0;\n  return function () {\n    n += 1;\n    return n;\n  };\n}",
    ["function makeCounter() {\n  return function () {\n    return 1;\n  };\n}",
     "function makeCounter() {\n  let n = 0;\n  return function () {\n    return n;\n  };\n}"],
    [
      "The returned function must remember a number that lives between calls.",
      "Closure over a let variable declared before the return.",
      "let n = 0; return function () { n ___ 1; return n; };",
      "A till that starts at 0 and adds one coin per press — the count survives between presses.",
    ],
    3,
  ],
  [
    "s2", "scope", "createPrefixedLogger", "prefix",
    "createPrefixedLogger",
    "Return a function that takes a message and returns prefix + message, joined exactly, with no separator added.",
    "createPrefixedLogger(\"ERR: \")(\"disk full\") → \"ERR: disk full\"",
    [
      { args: ["ERR: "], call: ["disk full"], expected: "ERR: disk full" },
      { args: ["[run]"], call: ["done"], expected: "[run]done" },
      { args: [""], call: ["x"], expected: "x" },
    ],
    "function createPrefixedLogger(prefix) {\n  return function (message) {\n    return prefix + message;\n  };\n}",
    ["function createPrefixedLogger(prefix) {\n  return prefix;\n}",
     "function createPrefixedLogger(prefix) {\n  return function (message) { return message + prefix; };\n}"],
    [
      "A returned function that closes over the prefix you passed in.",
      "Closure returned from an outer function.",
      "return function (message) { return ____ + message; };",
      "A stamp reads its engraving from the handle, then prints it on every page.",
    ],
    2,
  ],
  [
    "s3", "scope", "makeLimiter", "limit",
    "makeLimiter",
    "Return a function that answers true for the first limit calls, then false forever after. Each call counts, even the later ones.",
    "const ok = makeLimiter(2); ok() → true; ok() → false",
    [
      { args: [2], calls: 1, expected: true },
      { args: [2], calls: 3, expected: false },
      { args: [0], calls: 1, expected: false },
      { args: [1], calls: 2, expected: false },
      { args: [4], calls: 4, expected: true },
    ],
    "function makeLimiter(limit) {\n  let used = 0;\n  return function () {\n    used += 1;\n    return used <= limit;\n  };\n}",
    ["function makeLimiter(limit) {\n  let used = 0;\n  return function () { return used < limit; };\n}",
     "function makeLimiter(limit) {\n  return function () { return true; };\n}"],
    [
      "Count the calls in a closed-over variable and compare with the limit.",
      "Closure with an increment before the comparison.",
      "used += 1; return used ___ limit;",
      "A ticket booth with 2 tickets: the third visitor is turned away.",
    ],
    3,
  ],
  [
    "s4", "scope", "makeSecretChecker", "secret",
    "makeSecretChecker",
    "Return a function that answers true only when the value it is given matches the secret, false otherwise.",
    "const ok = makeSecretChecker(\"moon\"); ok(\"moon\") → true",
    [
      { args: ["moon"], call: ["moon"], expected: true },
      { args: ["moon"], call: ["sun"], expected: false },
      { args: [""], call: [""], expected: true },
      { args: [42], call: ["42"], expected: false },
    ],
    "function makeSecretChecker(secret) {\n  return function (value) {\n    return value === secret;\n  };\n}",
    ["function makeSecretChecker(secret) {\n  return function (value) { return value == secret; };\n}",
     "function makeSecretChecker(secret) {\n  return secret;\n}"],
    [
      "Close over the secret and compare strictly with whatever is passed in.",
      "Closure plus ===.",
      "return function (value) { return value ____ secret; };",
      "A lock keeps its pin inside; only the matching key turns it.",
    ],
    2,
  ],
];

export const CURRICULUM: CurriculumExercise[] = RAW.map(make);

export function exerciseById(id?: string) {
  return CURRICULUM.find((e) => e.id === id);
}

export function exercisesInTopic(topic: string) {
  return CURRICULUM.filter((e) => e.topic === topic);
}

/** Placement: 5–8 questions spanning early → later topics, arrays + scope weighted. */
export const PLACEMENT_IDS = [
  "v1",
  "c1",
  "l1",
  "f3",
  "a3",
  "o1",
  "s1",
];

export function describeExercise(e: CurriculumExercise) {
  return `${e.topic}/${e.id} — ${e.title}`;
}


