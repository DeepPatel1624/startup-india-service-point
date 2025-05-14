// CommonJS version specifically for GitHub Actions
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const SOURCES = {
  devfolio: "https://devfolio.co/hackathons",
  devpost: "https://devpost.com/hackathons",
  mlh: "https://mlh.io/seasons/2025/events"
};

async function scrapeHackathons() {
  console.log(`🔍 Starting hackathon scraping from multiple sources`);
  const allHackathons = [];
  const statsPath = path.join(process.cwd(), "data", "scrape-stats.json");
  let stats = {
    totalScrapes: 0,
    lastScrapeTime: null,
    successfulScrapes: 0,
    failedScrapes: 0,
    hackathonsCounts: []
  };

  try {
    if (await fs.pathExists(statsPath)) {
      stats = await fs.readJson(statsPath);
    }
  } catch (error) {
    console.error('Error reading scrape stats:', error.message);
  }

  stats.totalScrapes++;
  stats.lastScrapeTime = new Date().toISOString();
  console.log(`This is scrape #${stats.totalScrapes} since tracking began`);

  // Scrape Devfolio
  try {
    console.log('Scraping Devfolio hackathons...');
    const devfolioHackathons = await scrapeDevfolioWithAxios();
    allHackathons.push(...devfolioHackathons);
  } catch (error) {
    console.error('Devfolio scraping failed:', error.message);
  }

  // Scrape Devpost
  try {
    console.log('Scraping Devpost hackathons...');
    const devpostHackathons = await scrapeDevpostWithAxios();
    allHackathons.push(...devpostHackathons);
  } catch (error) {
    console.error('Devpost scraping failed:', error.message);
  }

  // If no hackathons found, add placeholder
  if (allHackathons.length === 0) {
    console.log('No hackathons found from any source. Adding placeholder data.');
    allHackathons.push({
      id: 'placeholder',
      title: 'Sample Hackathon',
      desc: 'This is a placeholder entry because no hackathons were found during scraping.',
      date: new Date().toISOString().split('T')[0],
      mode: 'Online',
      location: 'India',
      sectorTags: ['Technology'],
      organiser: 'System',
      link: 'https://devfolio.co/hackathons'
    });
  }

  // Save all hackathons to a file
  try {
    const dataDir = path.join(process.cwd(), "data");
    await fs.ensureDir(dataDir);
    const filePath = path.join(dataDir, "hackathons.json");
    await fs.writeJson(filePath, allHackathons, { spaces: 2 });
    console.log(`✅ ${allHackathons.length} hackathons saved to ${filePath}`);

    // Update scrape statistics
    if (allHackathons.length > 0) {
      stats.successfulScrapes++;
    } else {
      stats.failedScrapes++;
    }

    stats.hackathonsCounts.push({
      timestamp: stats.lastScrapeTime,
      count: allHackathons.length,
      sources: {
        devfolio: allHackathons.filter(h => h.organiser === "Devfolio").length,
        devpost: allHackathons.filter(h => h.organiser === "Devpost").length,
        placeholder: allHackathons.filter(h => h.organiser === "System").length
      }
    });

    if (stats.hackathonsCounts.length > 100) {
      stats.hackathonsCounts = stats.hackathonsCounts.slice(-100);
    }

    await fs.writeJson(statsPath, stats, { spaces: 2 });
    console.log(`📊 Scrape statistics updated. Total scrapes: ${stats.totalScrapes}`);
  } catch (saveError) {
    console.error('Error saving data:', saveError);
  }
}

// Axios/Cheerio approach for Devfolio
async function scrapeDevfolioWithAxios() {
  console.log(`Scraping ${SOURCES.devfolio} with Axios/Cheerio...`);
  try {
    const { data } = await axios.get(SOURCES.devfolio, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    const $ = cheerio.load(data);
    const hackathons = [];
    $('[class*="HackathonCard"], [class*="card"], [class*="Card"], .card, article, .event').each((i, el) => {
      const $el = $(el);
      const title = $el.find('h1, h2, h3, .title, [class*="title"], [class*="Title"]').first().text().trim();
      const desc = $el.find('p, .description, [class*="description"], [class*="Description"]').first().text().trim();
      const linkEl = $el.is('a') ? $el : $el.find('a').first();
      const dateEl = $el.find('time, [datetime], .date, [class*="date"], [class*="Date"]').first();
      const link = linkEl.attr('href') ? new URL(linkEl.attr('href'), SOURCES.devfolio).href : SOURCES.devfolio;
      const hackathon = {
        id: link.split('/').pop() || `devfolio-${i}-${Date.now()}`,
        title: title || `Hackathon #${i + 1}`,
        desc: desc || "Details available on website",
        date: dateEl.text().trim() || dateEl.attr('datetime') || "Check website for dates",
        mode: "Online",
        location: "India",
        sectorTags: ['Technology'],
        organiser: "Devfolio",
        link
      };
      if (hackathon.title.length > 3 && !hackathon.title.includes("undefined") && !hackathon.title.includes("null")) {
        hackathons.push(hackathon);
      }
    });
    console.log(`Extracted ${hackathons.length} hackathons from Devfolio`);
    return hackathons;
  } catch (error) {
    console.error(`Devfolio scraping failed: ${error.message}`);
    return [];
  }
}

// Axios/Cheerio approach for Devpost
async function scrapeDevpostWithAxios() {
  console.log(`Scraping ${SOURCES.devpost} with Axios/Cheerio...`);
  try {
    const { data } = await axios.get(SOURCES.devpost, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    const $ = cheerio.load(data);
    const hackathons = [];
    $('.hackathon-card, article, .challenge-listing').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.title, h3, h4').first().text().trim();
      const desc = $el.find('.description, p').first().text().trim();
      const link = $el.find('a').attr('href');
      const dateText = $el.find('.date, time, .deadline').first().text().trim();
      const location = $el.find('.location, .venue').text().trim() || "Online";
      if (title && link) {
        hackathons.push({
          id: `devpost-${i}-${Date.now()}`,
          title: title,
          desc: desc || "Visit website for details",
          date: dateText || "Check website for dates",
          mode: location.toLowerCase().includes('online') ? "Online" : "In-person",
          location: location || "Global",
          sectorTags: ['Technology'],
          organiser: "Devpost",
          link: link.startsWith('http') ? link : `https://devpost.com${link}`
        });
      }
    });
    console.log(`Extracted ${hackathons.length} hackathons from Devpost`);
    return hackathons;
  } catch (error) {
    console.error(`Devpost scraping failed: ${error.message}`);
    return [];
  }
}

scrapeHackathons().catch(console.error);
