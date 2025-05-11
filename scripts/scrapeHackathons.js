import { launch } from "puppeteer";
import { ensureDir, writeJson } from "fs-extra";
import { join } from "path";

const URL = "https://devfolio.co/hackathons";

async function scrapeDevfolioHackathons() {
  const browser = await launch();
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: "networkidle2" });
  await page.waitForSelector("main");

  const hackathons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('[class*="HackathonCard"]')).map(card => ({
      id: card.querySelector('a')?.href.split('/').pop(),
      title: card.querySelector('h1')?.innerText || "",
      desc: card.querySelector('p')?.innerText || "",
      date: card.querySelector('time')?.innerText || "TBD",
      mode: "Online",
      location: "India",
      sectorTags: [],
      organiser: "Devfolio",
      link: card.querySelector('a')?.href
    }));
  });

  await browser.close();

  const dataDir = join(process.cwd(), "data");
  await ensureDir(dataDir);
  await writeJson(join(dataDir, "hackathons.json"), hackathons, { spaces: 2 });
  console.log(`✅ ${hackathons.length} hackathons saved.`);
}

scrapeDevfolioHackathons().catch(console.error)