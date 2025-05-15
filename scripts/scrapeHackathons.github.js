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

// Status color mapping for visualizing hackathon statuses
const STATUS_COLORS = {
  'Open': 'rgb(34, 161, 150)', // Teal color for open hackathons
  'Upcoming': 'rgb(234, 93, 37)', // Orange color for upcoming hackathons
  'Ended': 'rgb(160, 160, 160)', // Gray for ended hackathons
  'Unknown': 'rgb(100, 100, 100)' // Dark gray for unknown status
};

const SOURCES = {
  devfolio: "https://devfolio.co/hackathons",
  devpost: "https://devpost.com/hackathons?status[]=upcoming&status[]=open", // Filter for upcoming and open hackathons only
  devpostAPI: "https://devpost.com/api/hackathons/search.json", // Direct API endpoint with .json suffix
  devpostFeaturedAPI: "https://devpost.com/api/featured_hackathons", // API for featured hackathons
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

  // Scrape Devpost using API approach
  try {
    console.log('Scraping Devpost hackathons using API...');
    const devpostHackathons = await scrapeDevpostWithAPI();
    allHackathons.push(...devpostHackathons);
    console.log(`✅ Added ${devpostHackathons.length} hackathons from Devpost API`);
  } catch (error) {
    console.error('Devpost API scraping failed:', error.message);
    await logError(error, 'devpost-api');
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

// Direct API approach for Devpost
async function scrapeDevpostWithAPI() {
  console.log('Scraping Devpost using available API endpoints...');
  
  // Try multiple API endpoints to maximize our chances of success
  let allHackathons = [];
  
  // First try the main search API
  
  // We'll try several approaches to maximize the chances of getting hackathon data
  const apiEndpoints = [];
  
  // 1. First approach: Main search API with filters for upcoming and open hackathons
  try {
    const mainParams = {
      order_by: 'recently_added',
      status: ['upcoming', 'open'], 
      page: 1,
      per_page: 100 
    };
    
    // Build query string
    let queryParts = [];
    for (const [key, value] of Object.entries(mainParams)) {
      if (Array.isArray(value)) {
        value.forEach(item => {
          queryParts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(item)}`);
        });
      } else {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }
    }
    
    const queryString = queryParts.join('&');
    const mainApiUrl = `${SOURCES.devpostAPI}?${queryString}`;
    apiEndpoints.push({
      url: mainApiUrl,
      name: 'Search API',
    });
  } catch (error) {
    console.error(`Error building main API URL: ${error.message}`);
  }
  
  // 2. Second approach: Featured hackathons API
  apiEndpoints.push({
    url: SOURCES.devpostFeaturedAPI,
    name: 'Featured API',
  });
  
  // 3. Third approach: Challenge type filter for online and in-person
  ['online', 'in-person'].forEach(challengeType => {
    const url = `${SOURCES.devpostFeaturedAPI}?challenge_type=${challengeType}`;
    apiEndpoints.push({
      url,
      name: `Featured ${challengeType} API`,
    });
  });
  
  // Fallback hackathons if API fails
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
    // Try each API endpoint in sequence until we get a result
    for (const endpoint of apiEndpoints) {
      console.log(`Trying Devpost ${endpoint.name}: ${endpoint.url}`);
      
      try {
        const { data } = await axios.get(endpoint.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
        
        console.log(`Successfully fetched data from Devpost ${endpoint.name}`);
        
        // Process data based on the endpoint type
        let hackathonsFromApi = [];
        
        // Search API returns {hackathons: [...]} format
        if (data && data.hackathons && Array.isArray(data.hackathons)) {
          hackathonsFromApi = data.hackathons;
          console.log(`Found ${hackathonsFromApi.length} hackathons in Search API response`);
        }
        // Featured API might return array directly or have different structure
        else if (Array.isArray(data)) {
          hackathonsFromApi = data;
          console.log(`Found ${hackathonsFromApi.length} hackathons in Featured API response`);
        }
        // Some other format we don't recognize
        else if (data && typeof data === 'object') {
          // Try to find any array property that might contain hackathons
          const arrayProps = Object.entries(data)
            .filter(([key, value]) => Array.isArray(value) && value.length > 0)
            .sort(([keyA, a], [keyB, b]) => b.length - a.length); // Sort by array size, largest first
          
          if (arrayProps.length > 0) {
            const [propName, hackathonArray] = arrayProps[0];
            hackathonsFromApi = hackathonArray;
            console.log(`Found ${hackathonsFromApi.length} hackathons in '${propName}' property`);
          } else {
            console.log('No hackathon arrays found in API response');
          }
        }
        
        // If we found some hackathons, process them
        if (hackathonsFromApi.length > 0) {
          // Process hackathons from the API
          const processedHackathons = hackathonsFromApi.map((apiHackathon, index) => {
            // Determine the ID - different APIs might have different formats
            const id = apiHackathon.id || 
                      apiHackathon.slug || 
                      `devpost-api-${endpoint.name.toLowerCase().replace(/\s+/g, '-')}-${index}-${Date.now()}`;
            
            // Extract title - try multiple possible property names
            const title = apiHackathon.title || 
                         apiHackathon.name || 
                         apiHackathon.challenge_title || 
                         `Hackathon #${index}`;
            
            // Extract description
            const desc = apiHackathon.description || 
                        apiHackathon.tagline || 
                        apiHackathon.short_description || 
                        apiHackathon.overview || 
                        "Visit website for details";
            
            // Extract link
            const link = apiHackathon.url || 
                        apiHackathon.permalink || 
                        apiHackathon.website || 
                        apiHackathon.challenge_url || 
                        `https://devpost.com/hackathons`;
            
            // Extract date information - different APIs use different property names
            const submissionPeriod = apiHackathon.submission_period || "";
            const startDate = apiHackathon.starts_at || apiHackathon.start_date || apiHackathon.submission_start_date || "";
            const endDate = apiHackathon.ends_at || apiHackathon.end_date || apiHackathon.submission_end_date || "";
            let dateText = "";
            
            if (startDate && endDate) {
              dateText = `${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}`;
            } else if (endDate) {
              dateText = `Ends ${new Date(endDate).toLocaleDateString()}`;
            } else if (submissionPeriod) {
              dateText = submissionPeriod;
            } else {
              dateText = "Check website for dates";
            }
            
            // Determine status from various possible properties
            let status = "Unknown";
            if (apiHackathon.status) {
              status = apiHackathon.status.charAt(0).toUpperCase() + apiHackathon.status.slice(1);
            } else if (submissionPeriod && submissionPeriod.toLowerCase().includes('upcoming')) {
              status = "Upcoming";
            } else if (submissionPeriod && submissionPeriod.toLowerCase().includes('open')) {
              status = "Open";
            } else if (submissionPeriod && submissionPeriod.toLowerCase().includes('ended')) {
              status = "Ended";
            }
            
            // Skip any ended hackathons since we're only interested in upcoming and open ones
            if (status.toLowerCase() === "ended") {
              return null;
            }
            
            // Extract location and mode
            const location = apiHackathon.location || 
                            apiHackathon.displayed_location || 
                            apiHackathon.venue || 
                            "Global";
                            
            const isOnline = apiHackathon.online_only || 
                            (location && location.toLowerCase().includes('online')) || 
                            (apiHackathon.challenge_type && apiHackathon.challenge_type.includes('online'));
                            
            const mode = isOnline ? "Online" : "In-person";
            
            // Extract prize information
            const prizeAmount = apiHackathon.prize_amount || 
                             apiHackathon.total_prizes || 
                             apiHackathon.prize_total || 
                             "";
                             
            const prize = prizeAmount ? `$${prizeAmount}` : "";
            
            // Extract participants count
            const participants = apiHackathon.registrations_count?.toString() || 
                              apiHackathon.participants_count?.toString() || 
                              apiHackathon.registrations?.toString() || 
                              "";
            
            // Extract tags/categories
            const themes = Array.isArray(apiHackathon.themes) ? apiHackathon.themes : [];
            const technologies = Array.isArray(apiHackathon.technologies) ? apiHackathon.technologies : [];
            const categories = Array.isArray(apiHackathon.categories) ? apiHackathon.categories : [];
            const sectorTags = [...themes, ...technologies, ...categories].filter(Boolean);
            
            return {
              id,
              title,
              desc,
              date: dateText,
              mode,
              location,
              status,
              prize,
              participants,
              sectorTags: sectorTags.length > 0 ? sectorTags : ['Technology'],
              organiser: "Devpost",
              link
            };
          }).filter(Boolean); // Filter out any nulls (ended hackathons)
          
          // Add the processed hackathons to our collection
          allHackathons.push(...processedHackathons);
          console.log(`Added ${processedHackathons.length} hackathons from ${endpoint.name}`);
        }
      } catch (endpointError) {
        console.error(`Error with ${endpoint.name}: ${endpointError.message}`);
      }
    }
    
    // After trying all endpoints, check if we got any hackathons
    if (allHackathons.length > 0) {
      // Remove duplicates by URL
      const uniqueHackathons = [];
      const urls = new Set();
      
      for (const hackathon of allHackathons) {
        if (!urls.has(hackathon.link)) {
          urls.add(hackathon.link);
          uniqueHackathons.push(hackathon);
        }
      }
      
      console.log(`Found ${uniqueHackathons.length} unique hackathons across all Devpost API endpoints`);
      return uniqueHackathons;
    }
    
    // If no hackathons found from any API, fall back to HTML scraping
    console.log('No hackathons found from any API endpoints, falling back to HTML scraping...');
    return await scrapeDevpostWithAxios();
    
  } catch (error) {
    console.error(`Devpost API scraping failed: ${error.message}`);
    console.error(error.stack);
    await logError(error, 'devpost-api');
    
    // Fall back to HTML scraping if API fails
    console.log('Falling back to HTML scraping due to error...');
    return await scrapeDevpostWithAxios();
  }
}

// Axios/Cheerio approach for Devpost (fallback)
async function scrapeDevpostWithAxios() {
  console.log(`Fallback: Scraping ${SOURCES.devpost} with Axios/Cheerio...`);
  
  // Define the maximum number of pages to scrape
  const MAX_PAGES = 10; // Increased to capture more hackathons
  const MAX_HACKATHONS_PER_PAGE = 50; // Cap on hackathons per page to avoid memory issues
  
  // Simple approach: hardcode a few recent hackathons if Devpost scraping fails
  // This is a fallback to ensure we have some content for this source
  const fallbackHackathons = [
    {
      id: `devpost-fallback-1`,
      title: "No hackathon found",
      desc: "No hackathon found",
      date: "",
      mode: "Online",
      location: "Global",
      status: "Upcoming", 
      prize: "",
      participants: "",
      sectorTags: ['Technology'],
      organiser: "",
      link: ""
    },
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
            
            // Extract whatever information we can from card
            const title = $el.text().trim() || cardElement.find('h3, h2, h4, .title').first().text().trim();
            const desc = cardElement.find('p, .description, .summary').first().text().trim();
            const link = cardElement.find('a').attr('href') || `https://devpost.com/hackathons`;
            
            // Extract date text if available
            const dateElement = cardElement.find('.date, .time, .timeframe');
            const dateText = dateElement.length > 0 ? dateElement.text().trim() : "Check website for dates";
            
            // Extract status - since we're on a page filtered for upcoming and open hackathons
            let status = "Unknown";
            
            // Look for status indicators in the HTML
            const statusText = cardElement.text().toLowerCase();
            const statusElement = cardElement.find('.status, .badge, .state, .submission-status');
            const statusElementText = statusElement.length > 0 ? statusElement.text().toLowerCase().trim() : "";
            
            // Check date text for status indicators
            if (dateText.toLowerCase().includes('open')) {
              status = "Open";
            } else if (dateText.toLowerCase().includes('upcoming') || 
                     dateText.toLowerCase().includes('coming soon') || 
                     dateText.toLowerCase().includes('starts ')) {
              status = "Upcoming";
            }
            
            // Check status element
            if (status === "Unknown" && statusElementText) {
              if (statusElementText.includes('open')) {
                status = "Open";
              } else if (statusElementText.includes('upcoming') || 
                       statusElementText.includes('soon')) {
                status = "Upcoming";
              }
            }
            
            // As a fallback since we know we're on the upcoming/open page
            if (status === "Unknown") {
              // Check if we have dates that suggest it's upcoming
              if (dateText.match(/start.*\d{1,2}[/-]\d{1,2}/) || 
                  dateText.includes('soon')) {
                status = "Upcoming";
              } else {
                // Default to "Open" since we're on a filtered page
                status = "Open";
              }  
            }
            
            // Additional status check from legacy code
            const statusEl = cardElement.find('[class*="status"], [class*="Status"], .tag, .badge').first();
            if (statusEl.length && status === "Unknown") {
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
                date: dateText,
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
