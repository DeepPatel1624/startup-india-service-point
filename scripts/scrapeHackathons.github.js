// CommonJS version specifically for GitHub Actions
const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

// Multiple sources for hackathons
const SOURCES = {
  devfolio: "https://devfolio.co/hackathons",
  devpost: "https://devpost.com/hackathons",
  mlh: "https://mlh.io/seasons/2025/events"
};

async function scrapeHackathons() {
  console.log(`🔍 Starting hackathon scraping from multiple sources`);
  const allHackathons = [];
  
  // Load scrape statistics
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
  
  // Increment total scrapes counter
  stats.totalScrapes++;
  stats.lastScrapeTime = new Date().toISOString();
  console.log(`This is scrape #${stats.totalScrapes} since tracking began`);
  
  // Try to scrape with Puppeteer first
  try {
    console.log('Attempting to scrape Devfolio with Puppeteer...');
    const devfolioHackathons = await scrapeDevfolioWithPuppeteer();
    allHackathons.push(...devfolioHackathons);
  } catch (error) {
    console.log('Puppeteer approach failed, falling back to alternative methods:', error.message);
    // Try alternative scraping methods
    try {
      // Try a more basic HTTP request approach for Devfolio
      const devfolioHackathons = await scrapeDevfolioWithAxios();
      allHackathons.push(...devfolioHackathons);
    } catch (devfolioError) {
      console.error('Alternative Devfolio scraping failed:', devfolioError.message);
    }
  }
  
  // Try scraping Devpost as a fallback source
  try {
    console.log('Scraping Devpost hackathons...');
    const devpostHackathons = await scrapeDevpostWithAxios();
    allHackathons.push(...devpostHackathons);
  } catch (devpostError) {
    console.error('Devpost scraping failed:', devpostError.message);
  }
  
  // If we still don't have any hackathons, add some placeholder data
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
    
    // Record the count of hackathons found in this scrape
    stats.hackathonsCounts.push({
      timestamp: stats.lastScrapeTime,
      count: allHackathons.length,
      sources: {
        devfolio: allHackathons.filter(h => h.organiser === "Devfolio").length,
        devpost: allHackathons.filter(h => h.organiser === "Devpost").length,
        placeholder: allHackathons.filter(h => h.organiser === "System").length
      }
    });
    
    // Keep only the last 100 scrape records to avoid the file growing too large
    if (stats.hackathonsCounts.length > 100) {
      stats.hackathonsCounts = stats.hackathonsCounts.slice(-100);
    }
    
    // Save updated stats
    await fs.writeJson(statsPath, stats, { spaces: 2 });
    console.log(`📊 Scrape statistics updated. Total scrapes: ${stats.totalScrapes}`);
  } catch (saveError) {
    console.error('Error saving data:', saveError);
  }
}

// Puppeteer approach for Devfolio
async function scrapeDevfolioWithPuppeteer() {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security', '--disable-features=IsolateOrigins']
    });
    
    console.log('Browser launched successfully');
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');
    
    // Try to avoid detection
    await page.evaluateOnNewDocument(() => {
      // Overwrite the 'webdriver' property to prevent detection
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    
    console.log(`Navigating to ${SOURCES.devfolio}...`);
    await page.goto(SOURCES.devfolio, { 
      waitUntil: "networkidle2",
      timeout: 60000
    });
    
    // Instead of using waitForTimeout which may not be available in all Puppeteer versions,
    // use a promise-based delay function that works everywhere
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Take a screenshot for debugging
    const screenshotPath = path.join(process.cwd(), "debug-screenshot.png");
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);
    
    // Extract any visible hackathon data regardless of exact selectors
    const hackathons = await page.evaluate(() => {
      // First try the original selector
      let cards = document.querySelectorAll('[class*="HackathonCard"]');
      
      // If that doesn't work, try more generic approaches
      if (cards.length === 0) {
        // Try to find any card-like elements
        cards = document.querySelectorAll('div[class*="card"], div[class*="Card"], .card, article, .event');
      }
      
      console.log(`Found ${cards.length} potential hackathon elements`);
      
      // Generic extraction function
      return Array.from(cards).map((card, index) => {
        // Try to find title elements
        const titleEl = 
          card.querySelector('h1, h2, h3, .title, [class*="title"], [class*="Title"]') || 
          card.querySelector('strong') || 
          card.querySelector('b');
        
        // Try to find description elements
        const descEl = 
          card.querySelector('p, .description, [class*="description"], [class*="Description"]') || 
          card.querySelector('span:not(:empty):not(:has(*))'); // Non-empty spans without children
        
        // Try to find link elements
        const linkEl = card.querySelector('a') || card.closest('a');
        
        // Try to find date elements
        const dateEl = 
          card.querySelector('time') || 
          card.querySelector('[datetime], .date, [class*="date"], [class*="Date"]');
        
        return {
          id: linkEl?.href?.split('/')?.pop() || `devfolio-${index}-${Date.now()}`,
          title: titleEl?.innerText?.trim() || `Hackathon #${index + 1}`,
          desc: descEl?.innerText?.trim() || "Details available on website",
          date: dateEl?.innerText?.trim() || dateEl?.getAttribute('datetime') || "Check website for dates",
          mode: "Online",
          location: "India",
          sectorTags: ['Technology'],
          organiser: "Devfolio",
          link: linkEl?.href || SOURCES.devfolio
        };
      }).filter(item => 
        // Filter out items that don't seem like valid hackathons
        item.title.length > 3 && 
        item.title !== "Hackathon #1" && 
        !item.title.includes("undefined") && 
        !item.title.includes("null")
      );
    });
    
    console.log(`Extracted ${hackathons.length} hackathons with Puppeteer`);
    return hackathons;
    
  } finally {
    if (browser) {
      await browser.close();
      console.log('Browser closed');
    }
  }
}

// Axios/Cheerio approach for Devfolio
async function scrapeDevfolioWithAxios() {
  console.log(`Attempting to scrape ${SOURCES.devfolio} with Axios/Cheerio...`);
  
  try {
    const { data } = await axios.get(SOURCES.devfolio, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    console.log(`Loaded HTML content, size: ${data.length} bytes`);
    
    // Try various selectors that might contain hackathon cards
    const selectors = [
      '[class*="HackathonCard"]',
      '[class*="card"]', 
      '[class*="Card"]', 
      '.card', 
      'article', 
      '.event',
      'div > a', // Links directly under divs
      '.grid > div' // Grid items
    ];
    
    let hackathons = [];
    let foundElements = false;
    
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        console.log(`Found ${elements.length} elements with selector: ${selector}`);
        foundElements = true;
        
        elements.each((i, el) => {
          const $el = $(el);
          
          // Try to find title
          const titleEl = $el.find('h1, h2, h3, .title, [class*="title"], [class*="Title"]').first() || 
                          $el.find('strong, b').first();
          
          // Try to find description
          const descEl = $el.find('p, .description, [class*="description"], [class*="Description"]').first();
          
          // Try to find link
          const linkEl = $el.is('a') ? $el : $el.find('a').first();
          
          // Try to find date
          const dateEl = $el.find('time, [datetime], .date, [class*="date"], [class*="Date"]').first();
          
          const hackathon = {
            id: linkEl.attr('href')?.split('/')?.pop() || `cheerio-${i}-${Date.now()}`,
            title: titleEl.text().trim() || `Hackathon #${i + 1}`,
            desc: descEl.text().trim() || "Details available on website",
            date: dateEl.text().trim() || dateEl.attr('datetime') || "Check website for dates",
            mode: "Online",
            location: "India",
            sectorTags: ['Technology'],
            organiser: "Devfolio",
            link: linkEl.attr('href') ? new URL(linkEl.attr('href'), SOURCES.devfolio).href : SOURCES.devfolio
          };
          
          // Only add if it seems like a valid hackathon
          if (hackathon.title.length > 3 && 
              hackathon.title !== `Hackathon #${i + 1}` && 
              !hackathon.title.includes("undefined") && 
              !hackathon.title.includes("null")) {
            hackathons.push(hackathon);
          }
        });
        
        // If we found elements and extracted some hackathons, break the loop
        if (hackathons.length > 0) {
          break;
        }
      }
    }
    
    if (!foundElements) {
      console.log("Could not find any matching elements in the HTML");
    }
    
    console.log(`Extracted ${hackathons.length} hackathons with Axios/Cheerio`);
    return hackathons;
    
  } catch (error) {
    console.error(`Axios/Cheerio approach failed: ${error.message}`);
    return [];
  }
}

// Scrape Devpost as an alternative source
async function scrapeDevpostWithAxios() {
  console.log(`Attempting to scrape ${SOURCES.devpost} with Axios/Cheerio...`);
  
  try {
    const { data } = await axios.get(SOURCES.devpost, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(data);
    const hackathons = [];
    
    // Devpost typically has a .hackathon-card class or similar for its listings
    $('.hackathon-card, article, .challenge-listing').each((i, el) => {
      const $el = $(el);
      
      const title = $el.find('.title, h3, h4').first().text().trim();
      const desc = $el.find('.description, p').first().text().trim();
      const link = $el.find('a').attr('href');
      
      // Find date elements
      const dateText = $el.find('.date, time, .deadline').first().text().trim();
      
      // Additional data
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
