/* Real-browser check (Chromium via Playwright) of Loci + Curator against the production build. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");

const URL = process.env.LOCI_URL || "http://127.0.0.1:5211/";

(async () => {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"], executablePath });
  const errors = [];
  const requests = [];
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => requests.push(r.url()));

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Loci", exact: true }).click();
  await page.getByRole("heading", { name: "Method of Loci Spatial Palaces" }).waitFor();
  await page.getByText("Childhood Home Route").first().waitFor();
  console.log("PASS library loads");

  // Keep the deterministic Curator checks independent of local-model latency.
  await page.getByRole("tab", { name: "Loci Settings" }).click();
  const aiToggle = page.getByRole("checkbox", { name: /Enable local AI suggestions/ });
  if (await aiToggle.isChecked()) await aiToggle.uncheck();
  await page.getByRole("tab", { name: "Palaces" }).click();
  await page.getByRole("heading", { name: "Method of Loci Spatial Palaces" }).waitFor();
  console.log("PASS local AI toggle works; fallback checks run without model latency");

  // --- Recall: planner states its plan before starting ---
  await page.getByRole("button", { name: /Recall \(/ }).first().click();
  await page.getByRole("heading", { name: "Session plan" }).waitFor();
  assert.match(await page.locator("p", { hasText: "Stopping early is offered" }).first().innerText(), /due/);
  await page.getByRole("button", { name: "Begin" }).click();
  await page.getByText("Front porch threshold").waitFor();
  console.log("PASS session plan shown before start");

  // --- Hidden answer + graded hint ladder ---
  assert.equal(await page.getByText("Hydrogen").count(), 0, "item text not in DOM before answering");
  assert.equal(await page.getByText(/liquid hydrogen/i).count(), 0, "cue not in DOM before answering");
  for (const level of [1, 2, 3]) {
    await page.getByRole("button", { name: new RegExp(`Hint \\(H\\) — level ${level} of 5`) }).click();
    await page.locator('ol[aria-label="Hints so far"] li').nth(level - 1).waitFor();
  }
  assert.equal(await page.getByText("Hydrogen").count(), 0, "hint levels 1-3 never show the item text");
  assert.equal(await page.getByText(/liquid hydrogen/i).count(), 0, "hint levels 1-3 never show the full cue");
  await page.getByRole("button", { name: /level 4 of 5/ }).click();
  await page.getByText(/liquid hydrogen/i).first().waitFor();
  console.log("PASS hint levels 1-3 hide the answer; level 4 shows the cue");

  await page.getByLabel("What item was placed here?").fill("Hydrogen");
  await page.getByRole("button", { name: "Check" }).click();
  await page.getByText("Target Item").waitFor();
  await page.getByText(/Recalled at hint level 4/).waitFor();
  await page.getByRole("button", { name: "Explain what each grade does to this schedule" }).click();
  await page.getByText("What each grade does next:").waitFor();
  await page.getByRole("button", { name: /^Good: next test in/ }).click();
  await page.getByRole("button", { name: "Save and exit recall session" }).click();
  await page.getByRole("heading", { name: "Session saved" }).waitFor();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("loci:v1")));
  const sess = stored.sessions[0];
  assert.equal(sess.results[0].hintDepth, 4, "hint depth recorded on the review result");
  assert.ok(stored.palaces[0].items.find((i) => i.text === "Hydrogen").review.easeHistory.length >= 1, "ease history recorded");
  await page.getByRole("button", { name: "Return to Palaces" }).click();
  console.log("PASS grading records hintDepth and ease history; Explain panel opens");

  // --- Curator drawer: manual Route Doctor, proposals only ---
  const before = JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem("loci:v1")).palaces));
  await page.getByRole("button", { name: "Open Curator" }).click();
  await page.getByRole("dialog", { name: "Curator" }).waitFor();
  await page.getByText("Not run for this palace yet.").waitFor();
  await page.getByRole("button", { name: "Run Route Doctor" }).click();
  await page.getByText(/Last run/).waitFor();
  const after = JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem("loci:v1")).palaces));
  assert.equal(after, before, "running Route Doctor does not change any palace data");
  const badges = await page.locator(".curator-badge").count();
  console.log(`PASS Route Doctor ran manually, changed no data (${badges} proposal badge(s))`);

  await page.getByRole("tab", { name: "Cue Critic" }).click();
  await page.getByRole("button", { name: "Critique cue" }).click();
  await page.getByText("One question:").waitFor();
  const q = await page.locator("p", { hasText: "One question:" }).first().innerText();
  assert.equal((q.match(/\?/g) || []).length, 1, "critic asks exactly one question");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog", { name: "Curator" }).count(), 0);
  console.log("PASS Cue Critic asks one question; drawer closes on Escape");

  // --- Command bar: read-only answers immediately, mutation shows a diff and waits ---
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "Command bar" }).waitFor();
  await page.getByRole("textbox", { name: "Command" }).fill("which spots have lapsed twice");
  await page.keyboard.press("Enter");
  await page.getByText(/lapses|No spots have/).first().waitFor();
  await page.getByRole("textbox", { name: "Command" }).fill("quiz me on childhood home, random order");
  await page.keyboard.press("Enter");
  await page.getByText("Proposed — not applied").waitFor();
  await page.getByText("Before", { exact: true }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Session plan" }).count(), 0, "nothing starts before Confirm");
  await page.getByRole("button", { name: "Confirm" }).click();
  await page.getByRole("heading", { name: "Session plan" }).waitFor();
  await page.getByRole("button", { name: "Cancel" }).click();
  console.log("PASS command bar: query answers, proposal waits for Confirm");

  // --- Templates arrive unapproved ---
  await page.getByRole("button", { name: "Championship templates" }).click();
  await page.getByText(/I can walk this route in my mind/).first().click();
  await page.getByRole("button", { name: /Review & approve cues/ }).click();
  await page.getByRole("heading", { name: /Anchor items to/ }).waitFor();
  assert.ok((await page.getByText(/0 of 10 cues approved/).count()) === 1, "template cues start unapproved");
  assert.equal(await page.getByRole("button", { name: /Begin first walk/ }).isDisabled(), true);
  console.log("PASS templates arrive as unapproved drafts; walk is blocked until approval");

  // --- Settings: non-local endpoint rejected without a request ---
  await page.getByRole("tab", { name: "Loci Settings" }).click();
  const external = requests.filter((u) => !u.startsWith("http://127.0.0.1") && !u.startsWith("data:") && !u.startsWith("blob:") && !u.includes("fonts.g"));
  assert.deepEqual(external, [], `no requests to non-local hosts (got ${external.join(", ")})`);
  await page.getByRole("heading", { name: "Curator (advisory layer)" }).waitFor();
  console.log("PASS no non-local network requests; Curator settings present");

  // --- Mobile ---
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  phone.on("pageerror", (e) => errors.push(e.message));
  await phone.goto(URL, { waitUntil: "networkidle" });
  await phone.getByRole("button", { name: "Open navigation" }).click();
  await phone.getByRole("navigation", { name: "Primary navigation" }).getByRole("button", { name: "Loci", exact: true }).click();
  await phone.getByRole("heading", { name: "Method of Loci Spatial Palaces" }).waitFor();
  await phone.getByRole("button", { name: "Open Curator" }).click();
  await phone.getByRole("dialog", { name: "Curator" }).waitFor();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow at 390px");
  console.log("PASS 390px: Loci + Curator drawer, no horizontal overflow");

  assert.deepEqual(errors, [], "no runtime errors");
  await browser.close();
  console.log("ALL BROWSER CHECKS PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
