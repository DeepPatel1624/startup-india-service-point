const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs-extra");
const path = require("path");

const URL = "https://www.startupindia.gov.in/content/sih/en/startup-schemes.html";

async function scrapeSchemes() {
  const { data } = await axios.get(URL);
  const $ = cheerio.load(data);
  const schemes = [];

  $('.feature-card').each((_, el) => {
    const title = $(el).find('h3').text().trim();
    const desc = $(el).find('p').text().trim();
    const link = $(el).find('a').attr('href');
    schemes.push({
      id: title.replace(/\s+/g, '-').toLowerCase(),
      title, desc,
      eligibility: null,
      deadline: null,
      sectorTags: [],
      region: 'All-India',
      organiser: 'Startup India',
      link
    });
  });

  const dataDir = path.join(process.cwd(), "data");
  await fs.ensureDir(dataDir);
  await fs.writeJson(path.join(dataDir, "schemes.json"), schemes, { spaces: 2 });
  console.log(`✅ ${schemes.length} schemes saved.`);
}

scrapeSchemes().catch(console.error);