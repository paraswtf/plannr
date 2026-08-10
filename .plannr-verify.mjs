import { chromium } from "@playwright/test";

const OUT = process.env.OUT ?? "/tmp/plannr-shots";
const BASE = "http://localhost:3000";

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1512, height: 950 },
  deviceScaleFactor: 2,
});
await context.addCookies([
  {
    name: "authjs.session-token",
    value: "claude-verify-token-0001",
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
  },
]);
const page = await context.newPage();
page.on("console", (m) => {
  if (m.type() === "error") console.log("PAGE ERROR:", m.text());
});
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));

// ── Timetable: drag out a span ──────────────────────────────────────────────
await page.goto(`${BASE}/timetable`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/1-timetable.png` });

const columns = page.locator("[data-room-id]");
const count = await columns.count();
console.log("room columns:", count);
const col = columns.nth(1);
const box = await col.boundingBox();
console.log("column box:", JSON.stringify(box));

// Drag from 1 hour down to 2h45m down the column (9:00 → 10:45 for an 8:00 start).
await page.mouse.move(box.x + box.width / 2, box.y + 60 + 4);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2, box.y + 120, { steps: 8 });
await page.mouse.move(box.x + box.width / 2, box.y + 165, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(900);
await page.screenshot({ path: `${OUT}/2-drag-drawer.png` });

const drawerVisible = await page.getByRole("dialog").isVisible().catch(() => false);
const startsValue = await page
  .locator('input[type="time"]')
  .first()
  .inputValue()
  .catch(() => "n/a");
const endsValue = await page
  .locator('input[type="time"]')
  .nth(1)
  .inputValue()
  .catch(() => "n/a");
console.log("drawer visible:", drawerVisible, "starts:", startsValue, "ends:", endsValue);

// ── Resize by dragging the bottom edge handle down 30 minutes ───────────────
const handleBox = await col.boundingBox();
// The pending block bottom edge sits at 165px-ish; grab it and pull down 30 min.
await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 178);
await page.mouse.down();
await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 210, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(600);
const endsAfterResize = await page
  .locator('input[type="time"]')
  .nth(1)
  .inputValue()
  .catch(() => "n/a");
console.log("ends after resize:", endsAfterResize);
await page.screenshot({ path: `${OUT}/3-resized.png` });

// ── Move the whole span sideways into the next room ────────────────────────
const target = await columns.nth(2).boundingBox();
await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 130);
await page.mouse.down();
await page.mouse.move(target.x + target.width / 2, target.y + 130, { steps: 10 });
await page.mouse.move(target.x + target.width / 2, target.y + 150, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/4-moved-room.png` });
const drawerRoom = await page
  .locator("aside")
  .getByRole("button")
  .nth(1)
  .textContent()
  .catch(() => "n/a");
const drawerStart = await page.locator('input[type="time"]').first().inputValue();
const drawerEnd = await page.locator('input[type="time"]').nth(1).inputValue();
console.log(
  "after cross-room move → room:",
  drawerRoom?.trim(),
  "start:",
  drawerStart,
  "end:",
  drawerEnd,
);

// ── Book a room page: calendar view ─────────────────────────────────────────
await page.goto(`${BASE}/book`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/5-book-rooms.png` });
await page.getByRole("radio", { name: "Calendar" }).click();
await page.waitForTimeout(600);
const bookCols = page.locator("[data-room-id]");
const bbox = await bookCols.nth(0).boundingBox();
await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + 90);
await page.mouse.down();
await page.mouse.move(bbox.x + bbox.width / 2, bbox.y + 150, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/6-book-calendar.png` });
const timeInputs = page.locator('input[type="time"]');
const times = [];
for (let i = 0; i < (await timeInputs.count()); i++) {
  times.push(await timeInputs.nth(i).inputValue());
}
console.log("book page times after calendar drag:", times);

// ── Move a booked block on the timetable ───────────────────────────────────
await page.goto(`${BASE}/timetable`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1200);
const blocks = page.locator("[data-room-id] button");
const blockCount = await blocks.count();
console.log("booked blocks:", blockCount);
if (blockCount > 0) {
  const first = blocks.first();
  const label = (await first.textContent())?.trim();
  const bb = await first.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 + 40, { steps: 8 });
  await page.screenshot({ path: `${OUT}/7-dragging-event.png` });
  await page.mouse.up();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/8-event-moved.png` });
  const moved = await blocks.first().boundingBox();
  console.log(`moved "${label}" from y=${bb.y} to y=${moved?.y}`);
}

await browser.close();
console.log("done");
