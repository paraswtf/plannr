import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const OUT = "/tmp/plannr-shots";
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
page.on("pageerror", (e) => console.log("PAGE EXCEPTION:", e.message));

const times = async () => [
  await page.locator('input[type="time"]').first().inputValue(),
  await page.locator('input[type="time"]').nth(1).inputValue(),
];
const roomLabel = async () =>
  (await page.locator("aside").getByRole("button").nth(1).textContent())?.trim();

await page.goto(`${BASE}/timetable`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1200);

const cols = page.locator("[data-room-id]");
let box = await cols.nth(1).boundingBox();
let cx = box.x + box.width / 2;

// 1. sweep out a span
await page.mouse.move(cx, box.y + 64);
await page.mouse.down();
await page.mouse.move(cx, box.y + 165, { steps: 6 });
await page.mouse.up();
await page.waitForTimeout(700);
console.log("1. swept:", await times(), await roomLabel());

// 2. drag the middle across to the next room
box = await cols.nth(1).boundingBox();
const target = await cols.nth(2).boundingBox();
cx = box.x + box.width / 2;
await page.mouse.move(cx, box.y + 130);
await page.mouse.down();
await page.mouse.move(target.x + target.width / 2, target.y + 130, { steps: 12 });
await page.mouse.move(target.x + target.width / 2, target.y + 160, { steps: 4 });
await page.mouse.up();
await page.waitForTimeout(700);
console.log("2. after cross-room middle drag:", await times(), await roomLabel());
await page.screenshot({ path: `${OUT}/p2-cross-room.png` });

// 3. drag the top edge up
const now3 = await cols.nth(2).boundingBox();
const cx3 = now3.x + now3.width / 2;
const topEdge = await page.evaluate(() => {
  const block = document.querySelector('[data-room-id] div[class*="z-6"]');
  const r = block?.getBoundingClientRect();
  return r ? { top: r.top, bottom: r.bottom, left: r.left } : null;
});
console.log("   chosen block box:", JSON.stringify(topEdge));
if (topEdge) {
  await page.mouse.move(cx3, topEdge.top + 4);
  await page.mouse.down();
  await page.mouse.move(cx3, topEdge.top - 30, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  console.log("3. after top-edge drag:", await times());
}

// 4. move a booked block to another room
const blocks = page.locator("[data-room-id] button");
const count = await blocks.count();
console.log("4. booked blocks:", count);
if (count > 0) {
  const first = blocks.first();
  const label = (await first.textContent())?.trim().slice(0, 24);
  const bb = await first.boundingBox();
  const dest = await cols.nth(3).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 + 20, bb.y + bb.height / 2 + 20, { steps: 5 });
  await page.mouse.move(dest.x + dest.width / 2, bb.y + bb.height / 2 + 90, { steps: 10 });
  await page.screenshot({ path: `${OUT}/p4-dragging-event.png` });
  await page.mouse.up();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/p5-event-moved.png` });
  const after = await page.locator("[data-room-id] button").first().boundingBox();
  console.log(`   "${label}" was at y=${Math.round(bb.y)}, now y=${Math.round(after?.y ?? -1)}`);
}

// 5. book page still works
await page.goto(`${BASE}/book`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/p6-book.png` });
console.log("5. book page panel:", await times(), await roomLabel());

await browser.close();
