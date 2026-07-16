// Dev utility: screenshots the running app (server must be up on :3000 with
// the demo seed loaded). Usage: npx tsx scripts/screenshots.mts [outDir]
import { chromium } from "playwright";
import { createSessionToken } from "../src/auth/session.js";
import { config } from "../src/config.js";

const OUT = process.argv[2] ?? "./screenshots";
const executablePath = process.env.CHROMIUM_PATH; // optional override
const browser = await chromium.launch(executablePath ? { executablePath } : {});

const anon = await browser.newContext({ viewport: { width: 1280, height: 860 } });
let page = await anon.newPage();
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/1-landing.png`, fullPage: true });
await page.goto("http://localhost:3000/app", { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/2-login.png` });
await anon.close();

const token = createSessionToken(1, config().SESSION_SIGNING_KEY);
const authed = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
await authed.addCookies([
  { name: "meridian_session", value: token, domain: "localhost", path: "/" },
]);
page = await authed.newPage();
await page.goto("http://localhost:3000/app", { waitUntil: "networkidle" });
await page.waitForSelector("#holdings tbody tr");
await page.screenshot({ path: `${OUT}/3-dashboard.png`, fullPage: true });

await page.click("text=Nifty -3%, crude +5%");
await page.waitForSelector("#scenario-result table");
await page.screenshot({ path: `${OUT}/4-scenario.png`, fullPage: true });

await page.goto("http://localhost:3000/app/briefs/1", { waitUntil: "networkidle" });
await page.screenshot({ path: `${OUT}/5-brief.png`, fullPage: true });

await browser.close();
console.log("screenshots written to", OUT);
