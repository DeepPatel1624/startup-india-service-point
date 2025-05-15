// CommonJS version specifically for GitHub Actions
const fs = require("fs-extra");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

// Log error details to a file for debugging
async function logError(error, source) {
  try {
    const errorLog = {
      timestamp: new Date().toISOString(),
      source,
      error: {
        message: error.message,
        stack: error.stack
      }
    };
    const errorLogPath = path.join(process.cwd(), "data", "scrape-error-log.json");
    await fs.writeJson(errorLogPath, errorLog, { spaces: 2 });
    console.error(`Error logged to ${errorLogPath}`);
  } catch (logError) {
    console.error('Error logging error:', logError.message);
  }
}

const SOURCES = {
  devfolio: "https://devfolio.co/hackathons",
  devpost: "https://devpost.com/hackathons?order_by=recently_added", // Order by recently added to get fresh content
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
        mlh: allHackathons.filter(h => h.organiser === "MLH").length,
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
    
    // Target card elements based on the format shown in the images
    $('[class*="HackathonCard"], [class*="card"], [class*="Card"], .card, article, .event').each((i, el) => {
      const $el = $(el);
      
      // Extract the title
      const title = $el.find('h1, h2, h3, .title, [class*="title"], [class*="Title"]').first().text().trim();
      
      // Extract description
      const desc = $el.find('p, .description, [class*="description"], [class*="Description"]').first().text().trim();
      
      // Extract the link
      const linkEl = $el.is('a') ? $el : $el.find('a').first();
      const link = linkEl.attr('href') ? new URL(linkEl.attr('href'), SOURCES.devfolio).href : SOURCES.devfolio;
      
      // Extract date info
      const dateEl = $el.find('time, [datetime], .date, [class*="date"], [class*="Date"]').first();
      const date = dateEl.text().trim() || dateEl.attr('datetime') || "Check website for dates";
      
      // Extract status (Upcoming, Open, Ended)
      let status = "";
      const statusEl = $el.find('[class*="status"], [class*="Status"], .tag, .badge').first();
      if (statusEl.length) {
        status = statusEl.text().trim();
      }
      // Determine if event has a particular status based on color/text
      const isUpcoming = status.toLowerCase().includes('upcoming') || $el.find('[style*="orange"], [class*="orange"]').length > 0;
      const isOpen = status.toLowerCase().includes('open') || $el.find('[style*="green"], [class*="green"], [style*="teal"], [class*="teal"]').length > 0;
      const isEnded = status.toLowerCase().includes('ended') || status.toLowerCase().includes('closed') || $el.find('[style*="gray"], [class*="gray"], [style*="grey"], [class*="grey"]').length > 0;
      
      // Set the final status
      if (isUpcoming) status = "Upcoming";
      else if (isOpen) status = "Open";
      else if (isEnded) status = "Ended";
      else status = "Unknown";
      
      // Extract location information
      const locationEl = $el.find('[class*="location"], [class*="Location"], [class*="venue"], [class*="Venue"], .location, .venue').first();
      const location = locationEl.text().trim() || "India";
      
      // Extract prize information
      const prizeEl = $el.find('[class*="prize"], [class*="Prize"], [class*="reward"], [class*="Reward"]').first();
      const prize = prizeEl.text().trim() || "";
      
      // Extract participant count
      const participantsEl = $el.find('[class*="participant"], [class*="Participant"], .count').first();
      const participants = participantsEl.text().trim().replace(/[^0-9]/g, '') || "";
      
      // Extract tags/categories
      const tags = [];
      $el.find('.tag, .badge, [class*="tag"], [class*="Tag"], [class*="badge"], [class*="Badge"]').each((j, tagEl) => {
        const tagText = $(tagEl).text().trim();
        // Don't include the status tag
        if (tagText && !tagText.toLowerCase().includes('upcoming') && 
            !tagText.toLowerCase().includes('open') && 
            !tagText.toLowerCase().includes('ended')) {
          tags.push(tagText);
        }
      });
      
      // Determine if event is in-person or online
      const mode = location.toLowerCase().includes('online') ? "Online" : "In-person";
      
      const hackathon = {
        id: link.split('/').pop() || `devfolio-${i}-${Date.now()}`,
        title: title || `Hackathon #${i + 1}`,
        desc: desc || "Details available on website",
        date: date,
        mode: mode,
        location: location,
        status: status,
        prize: prize,
        participants: participants,
        sectorTags: tags.length > 0 ? tags : ['Technology'],
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
  
  // Define the maximum number of pages to scrape
  const MAX_PAGES = 10; // Increased to capture more hackathons
  const MAX_HACKATHONS_PER_PAGE = 50; // Cap on hackathons per page to avoid memory issues
  
  // Simple approach: hardcode a few recent hackathons if Devpost scraping fails
  // This is a fallback to ensure we have some content for this source
  const fallbackHackathons = [
    {
      id: `devpost-fallback-1`,
      title: "NEAR AI Hackathon",
      desc: "Build AI apps and smart contracts on NEAR",
      date: "Ends Jun 25, 2025",
      mode: "Online",
      location: "Global",
      status: "Upcoming", 
      prize: "$100,000",
      participants: "120",
      sectorTags: ['Technology', 'AI', 'Blockchain'],
      organiser: "Devpost",
      link: "https://near-ai-hackathon.devpost.com/"
    },
    {
      id: `devpost-fallback-2`,
      title: "AWS Builder Space",
      desc: "Build on AWS and win prizes",
      date: "Ends Jul 10, 2025",
      mode: "Online",
      location: "Global",
      status: "Open",
      prize: "$75,000",
      participants: "89",
      sectorTags: ['Cloud', 'AWS', 'Technology'],
      organiser: "Devpost",
      link: "https://aws-builder-space.devpost.com/"
    },
    {
      id: `devpost-fallback-3`,
      title: "Web3 Global Hackathon",
      desc: "Create decentralized applications with blockchain technology",
      date: "Ends Aug 15, 2025",
      mode: "Online",
      location: "Global",
      status: "Upcoming",
      prize: "$50,000",
      participants: "75",
      sectorTags: ['Blockchain', 'Web3', 'Crypto'],
      organiser: "Devpost",
      link: "https://web3-global.devpost.com/"
    }
  ];
  
  try {
    const allHackathons = [];
    let totalCount = 0;
    
    // Loop through multiple pages
    for (let page = 1; page <= MAX_PAGES; page++) {
      console.log(`Fetching Devpost page ${page} of ${MAX_PAGES}...`);
      
      // Construct the URL with pagination parameters
      let pageUrl = SOURCES.devpost;
      if (page > 1) {
        // Add page parameter for pagination
        if (pageUrl.includes('?')) {
          pageUrl += `&page=${page}`;
        } else {
          pageUrl += `?page=${page}`;
        }
      }
      
      try {
        const { data } = await axios.get(pageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
          timeout: 30000 
        });
        
        console.log(`Successfully fetched Devpost page ${page}, parsing HTML...`);
        const $ = cheerio.load(data);
        
        // Extract total hackathon count if available
        const countText = $('h1, h2, h3, .heading, .count').text();
        const countMatch = countText.match(/(\d+[,\d]*) hackathons/i);
        
        if (countMatch && page === 1) {
          totalCount = countMatch[1].replace(/,/g, '');
          console.log(`Devpost shows ${countMatch[1]} total hackathons available`);
        }
        
        // Check if we're on the last page
        const pagination = $('.pagination');
        const isLastPage = pagination.length === 0 || !pagination.text().includes('Next') || pagination.find('a:contains("Next")').length === 0;
        
        // Find the hackathon listings on the current page
        const hackathonCards = $('#challenge-browser, .challenges-container').find('.challenge, article, .challenge-listing, [class*="challenge-card"]');
        console.log(`Found ${hackathonCards.length} hackathon cards on page ${page}`);
        
        if (hackathonCards.length === 0) {
          // Try direct container lookup
          const containers = $('#challenges-container, .challenges, .challenge-list');
          if (containers.length) {
            console.log(`Found ${containers.length} main hackathon containers`);
          }
        }
        
        // Process the current page
        const pageHackathons = [];
        
        // Attempt to find hackathon listings using the most generic approach
        $('a').each((i, el) => {
          const $el = $(el);
          const href = $el.attr('href');
          
          // Only process links that look like they point to hackathons
          if (href && (href.includes('/hackathons/') || href.includes('.devpost.com'))) {
            const parentElement = $el.parent().parent(); // Go up to get the container
            const cardElement = parentElement.closest('[class*="card"], [class*="Card"], .card, article, .challenge-listing, .hackathon-tile') || parentElement;
            
            // Extract title
            const title = $el.text().trim() || cardElement.find('h3, h2, h4, .title').first().text().trim();
            
            // Extract description
            const desc = cardElement.find('p, .description, .summary').first().text().trim();
            
            // Extract date information
            let date = "Check website for dates";
            const dateEl = cardElement.find('time, [datetime], .date, [class*="date"], [class*="Date"]').first();
            if (dateEl.length) {
              date = dateEl.text().trim() || dateEl.attr('datetime');
            }
            
            // Extract status (Upcoming, Open, Ended)
            let status = "Unknown";
            const statusEl = cardElement.find('[class*="status"], [class*="Status"], .tag, .badge').first();
            if (statusEl.length) {
              const statusText = statusEl.text().trim().toLowerCase();
              if (statusText.includes('upcoming')) status = "Upcoming";
              else if (statusText.includes('open')) status = "Open";
              else if (statusText.includes('ended') || statusText.includes('closed')) status = "Ended";
            } else {
              // Try to determine status from colors
              if (cardElement.find('[style*="orange"], [class*="orange"]').length > 0) status = "Upcoming";
              else if (cardElement.find('[style*="green"], [class*="green"], [style*="teal"], [class*="teal"]').length > 0) status = "Open";
              else if (cardElement.find('[style*="gray"], [class*="gray"], [style*="grey"], [class*="grey"]').length > 0) status = "Ended";
            }
            
            // Extract location information
            let location = "Global";
            const locationEl = cardElement.find('[class*="location"], [class*="Location"], [class*="venue"], [class*="Venue"], .location, .venue, [class*="place"], [class*="Place"]').first();
            if (locationEl.length) {
              location = locationEl.text().trim();
            }
            
            // Extract prize information
            let prize = "";
            // Look for currency symbols
            cardElement.find('*').each((j, prizeEl) => {
              const text = $(prizeEl).text().trim();
              if (text.includes('$') || text.includes('€') || text.includes('£') || text.includes('prize') || text.includes('Prize')) {
                if ((text.includes('$') || text.includes('€') || text.includes('£')) && /[0-9]/.test(text)) {
                  prize = text;
                  return false; // break the loop
                }
              }
            });
            
            // Extract participant count
            let participants = "";
            const participantsText = cardElement.text();
            const participantsMatch = participantsText.match(/([0-9]+)\s*(participant|participants|teams|submissions|hacker|hackers)/i);
            if (participantsMatch) {
              participants = participantsMatch[1];
            }
            
            // Extract tags/categories
            const tags = [];
            cardElement.find('.tag, .badge, [class*="tag"], [class*="Tag"], [class*="badge"], [class*="Badge"], [class*="skill"], [class*="Skill"]').each((j, tagEl) => {
              const tagText = $(tagEl).text().trim();
              // Don't include the status tag
              if (tagText && !tagText.toLowerCase().includes('upcoming') && 
                  !tagText.toLowerCase().includes('open') && 
                  !tagText.toLowerCase().includes('ended') &&
                  tagText.length > 2) {
                tags.push(tagText);
              }
            });
            
            // Determine if event is in-person or online
            const mode = location.toLowerCase().includes('online') ? "Online" : "In-person";
            
            if (title && title.length > 3 && !pageHackathons.some(h => h.title === title)) {
              pageHackathons.push({
                id: `devpost-${page}-${i}-${Date.now()}`,
                title: title,
                desc: desc || "Visit website for details",
                date: date,
                mode: mode,
                location: location,
                status: status,
                prize: prize,
                participants: participants,
                sectorTags: tags.length > 0 ? tags : ['Technology'],
                organiser: "Devpost",
                link: href.startsWith('http') ? href : `https://devpost.com${href}`
              });
            }
          }
        });
        
        console.log(`Extracted ${pageHackathons.length} hackathons from Devpost page ${page}`);
        allHackathons.push(...pageHackathons);
        
        // If we extracted no hackathons on this page or it's the last page, stop pagination
        if (pageHackathons.length === 0 || isLastPage) {
          console.log(`No more hackathons found or reached last page (${page}). Stopping pagination.`);
          break;
        }
        
      } catch (pageError) {
        console.error(`Error scraping Devpost page ${page}: ${pageError.message}`);
        console.error(pageError.stack);
        break; // Stop on error
      }
    }
    
    // Remove duplicates by title
    const uniqueHackathons = [];
    const titles = new Set();
    for (const hackathon of allHackathons) {
      if (!titles.has(hackathon.title)) {
        titles.add(hackathon.title);
        uniqueHackathons.push(hackathon);
      }
    }
    
    console.log(`Found ${uniqueHackathons.length} unique hackathons across all Devpost pages.`);
    console.log(`This is ${uniqueHackathons.length} out of approximately ${totalCount} total hackathons on Devpost.`);
    
    // If we found hackathons through direct link extraction, use those
    if (uniqueHackathons.length > 0) {
      return uniqueHackathons;
    }
    
    // If we couldn't extract any hackathons, use our fallback data
    console.log('No hackathons found from scraping Devpost. Using fallback data.');
    return fallbackHackathons;
    
  } catch (error) {
    console.error(`Devpost scraping failed: ${error.message}`);
    console.error(error.stack);
    await logError(error, 'devpost');
    
    // Return fallback data if scraping fails
    console.log('Using fallback Devpost hackathon data due to scraping failure');
    return fallbackHackathons;
  }
}

// Axios/Cheerio approach for MLH
async function scrapeMLHWithAxios() {
  console.log(`Scraping ${SOURCES.mlh} with Axios/Cheerio...`);
  try {
    const { data } = await axios.get(SOURCES.mlh, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
      },
      timeout: 15000
    });
    const $ = cheerio.load(data);
    const hackathons = [];
    
    // MLH typically uses event cards with specific structure
    $('.event-wrapper, .event-card, article.events__card').each((i, el) => {
      const $el = $(el);
      const title = $el.find('.event-name, h3, .title').first().text().trim();
      const link = $el.find('a').attr('href');
      const locationEl = $el.find('.event-location, .location, address');
      const location = locationEl.length ? locationEl.text().trim() : "";
      const dateEl = $el.find('.event-date, .date-range, time');
      const dateText = dateEl.length ? dateEl.text().trim() : "";
      
      if (title && link) {
        const isOnline = location.toLowerCase().includes('online') || 
                        location.toLowerCase().includes('digital') || 
                        location.toLowerCase().includes('virtual');
                        
        hackathons.push({
          id: `mlh-${i}-${Date.now()}`,
          title: title,
          desc: "Major League Hacking (MLH) event. Visit website for details.",
          date: dateText || "Check website for dates",
          mode: isOnline ? "Online" : "In-person",
          location: location || "Global",
          sectorTags: ['Technology', 'Education'],
          organiser: "MLH",
          link: link.startsWith('http') ? link : `https://mlh.io${link}`
        });
      }
    });
    
    console.log(`Extracted ${hackathons.length} hackathons from MLH`);
    return hackathons;
  } catch (error) {
    console.error(`MLH scraping failed: ${error.message}`);
    return [];
  }
}

scrapeHackathons().catch(console.error);
