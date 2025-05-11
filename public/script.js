// DOM elements
const hackathonsTab = document.getElementById('tab-hackathons');
const schemesTab = document.getElementById('tab-schemes');
const statsTab = document.getElementById('tab-stats');
const hackathonsContainer = document.getElementById('hackathons-container');
const schemesContainer = document.getElementById('schemes-container');
const statsContainer = document.getElementById('stats-container');
const hackathonsGrid = document.getElementById('hackathons-grid');
const schemesGrid = document.getElementById('schemes-grid');
const searchInput = document.getElementById('search-input');
const searchButton = document.getElementById('search-button');
const filterSelect = document.getElementById('filter-select');
const lastUpdatedElement = document.getElementById('last-updated');

// Stats elements
const statTotalScrapes = document.getElementById('stat-total-scrapes');
const statSuccessfulScrapes = document.getElementById('stat-successful-scrapes');
const statFailedScrapes = document.getElementById('stat-failed-scrapes');
const statLastScrape = document.getElementById('stat-last-scrape');
const scrapeHistoryTable = document.getElementById('scrape-history-table').querySelector('tbody');
const hackathonsChart = document.getElementById('hackathons-chart');

// State management
let hackathons = [];
let schemes = [];
let scrapeStats = null;
let activeTab = 'hackathons';
let searchTerm = '';
let filterOption = 'all';
let hackathonsChartInstance = null;

// Initialize the dashboard
async function initDashboard() {
  try {
    // Fetch data in parallel
    const [hackathonsResponse, schemesResponse, statsResponse] = await Promise.all([
      fetch('/api/hackathons'),
      fetch('/api/schemes'),
      fetch('/api/stats')
    ]);

    // Process hackathons
    if (hackathonsResponse.ok) {
      hackathons = await hackathonsResponse.json();
      renderHackathons();
    } else {
      showError(hackathonsGrid, 'Failed to load hackathons');
    }

    // Process schemes
    if (schemesResponse.ok) {
      schemes = await schemesResponse.json();
      renderSchemes();
    } else {
      showError(schemesGrid, 'Failed to load schemes');
    }
    
    // Process statistics
    if (statsResponse.ok) {
      scrapeStats = await statsResponse.json();
      renderStats();
    } else {
      showError(statsContainer, 'Failed to load statistics');
    }

    // Update last updated time
    updateLastUpdated();
  } catch (error) {
    console.error('Error initializing dashboard:', error);
    showError(hackathonsGrid, 'Error loading data');
    showError(schemesGrid, 'Error loading data');
    showError(statsContainer, 'Error loading data');
  }
}

// Render hackathons
function renderHackathons() {
  const filteredHackathons = filterAndSortData(hackathons);
  hackathonsGrid.innerHTML = '';

  if (filteredHackathons.length === 0) {
    hackathonsGrid.innerHTML = '<div class="no-results">No hackathons found</div>';
    return;
  }

  filteredHackathons.forEach(hackathon => {
    const card = document.createElement('div');
    card.className = 'card';
    
    // Create tags array from sectorTags or default
    const tags = hackathon.sectorTags && hackathon.sectorTags.length > 0 
      ? hackathon.sectorTags 
      : ['Technology'];
      
    // Format date nicely if available
    const formattedDate = hackathon.date || 'TBD';
    
    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${hackathon.title}</h3>
      </div>
      <div class="card-body">
        <p class="card-text">${hackathon.desc || 'No description available'}</p>
        <div class="card-meta">
          <span><i class="far fa-calendar-alt"></i> ${formattedDate}</span>
          <span><i class="fas fa-map-marker-alt"></i> ${hackathon.location || 'Online'}</span>
        </div>
        <div class="card-meta">
          <span><i class="fas fa-building"></i> ${hackathon.organiser || 'Unknown'}</span>
        </div>
        <div class="card-tags">
          ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      </div>
      <div class="card-footer">
        <a href="${hackathon.link}" target="_blank" class="btn">View Details</a>
      </div>
    `;
    
    hackathonsGrid.appendChild(card);
  });
}

// Render schemes
function renderSchemes() {
  const filteredSchemes = filterAndSortData(schemes);
  schemesGrid.innerHTML = '';

  if (filteredSchemes.length === 0) {
    schemesGrid.innerHTML = '<div class="no-results">No schemes found</div>';
    return;
  }

  filteredSchemes.forEach(scheme => {
    const card = document.createElement('div');
    card.className = 'card';
    
    // Create tags array from sectorTags or default
    const tags = scheme.sectorTags && scheme.sectorTags.length > 0 
      ? scheme.sectorTags 
      : ['Government'];
    
    card.innerHTML = `
      <div class="card-header">
        <h3 class="card-title">${scheme.title}</h3>
      </div>
      <div class="card-body">
        <p class="card-text">${scheme.desc || 'No description available'}</p>
        <div class="card-meta">
          <span><i class="fas fa-check-circle"></i> Eligibility: ${scheme.eligibility || 'See details'}</span>
        </div>
        <div class="card-meta">
          <span><i class="far fa-calendar-alt"></i> Deadline: ${scheme.deadline || 'See details'}</span>
          <span><i class="fas fa-map-marker-alt"></i> ${scheme.region || 'All-India'}</span>
        </div>
        <div class="card-meta">
          <span><i class="fas fa-building"></i> ${scheme.organiser || 'Unknown'}</span>
        </div>
        <div class="card-tags">
          ${tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
        </div>
      </div>
      <div class="card-footer">
        <a href="${scheme.link}" target="_blank" class="btn">View Details</a>
      </div>
    `;
    
    schemesGrid.appendChild(card);
  });
}

// Filter and sort data based on search term and filter option
function filterAndSortData(data) {
  // Filter by search term
  let filtered = data;
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = data.filter(item => 
      item.title.toLowerCase().includes(term) || 
      (item.desc && item.desc.toLowerCase().includes(term))
    );
  }
  
  // Sort based on filter option
  if (filterOption === 'title') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else if (filterOption === 'date') {
    // Simple date sorting (this could be enhanced based on your date format)
    filtered.sort((a, b) => {
      // If no dates are available, keep original order
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      
      // Otherwise try to sort by date (most recent first)
      return b.date.localeCompare(a.date);
    });
  }
  
  return filtered;
}

// Show error message
function showError(container, message) {
  container.innerHTML = `
    <div class="error-message">
      <i class="fas fa-exclamation-circle"></i>
      <p>${message}</p>
    </div>
  `;
}

// Update last updated timestamp
function updateLastUpdated() {
  const now = new Date();
  lastUpdatedElement.textContent = now.toLocaleString();
}

// Render statistics
function renderStats() {
  if (!scrapeStats) return;
  
  // Update statistics values
  statTotalScrapes.textContent = scrapeStats.totalScrapes;
  statSuccessfulScrapes.textContent = scrapeStats.successfulScrapes;
  statFailedScrapes.textContent = scrapeStats.failedScrapes;
  
  // Format the last scrape time
  if (scrapeStats.lastScrapeTime) {
    const lastScrapeDate = new Date(scrapeStats.lastScrapeTime);
    statLastScrape.textContent = lastScrapeDate.toLocaleString();
  } else {
    statLastScrape.textContent = 'Never';
  }
  
  // Render scrape history table
  renderScrapeHistoryTable();
  
  // Render hackathons chart
  renderHackathonsChart();
}

// Render scrape history table
function renderScrapeHistoryTable() {
  // Clear existing rows
  scrapeHistoryTable.innerHTML = '';
  
  // Get the 10 most recent scrapes (or less if fewer are available)
  const recentScrapes = [...scrapeStats.hackathonsCounts]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 10);
  
  // Create table rows
  recentScrapes.forEach(scrape => {
    const row = document.createElement('tr');
    
    // Time column (formatted)
    const timeCell = document.createElement('td');
    const scrapeTime = new Date(scrape.timestamp);
    timeCell.textContent = scrapeTime.toLocaleString();
    row.appendChild(timeCell);
    
    // Total count
    const totalCell = document.createElement('td');
    totalCell.textContent = scrape.count;
    row.appendChild(totalCell);
    
    // Devfolio count
    const devfolioCell = document.createElement('td');
    devfolioCell.textContent = scrape.sources?.devfolio || 0;
    row.appendChild(devfolioCell);
    
    // Devpost count
    const devpostCell = document.createElement('td');
    devpostCell.textContent = scrape.sources?.devpost || 0;
    row.appendChild(devpostCell);
    
    // Other/placeholder count
    const otherCell = document.createElement('td');
    otherCell.textContent = scrape.sources?.placeholder || 0;
    row.appendChild(otherCell);
    
    scrapeHistoryTable.appendChild(row);
  });
}

// Render hackathons chart
function renderHackathonsChart() {
  if (!scrapeStats?.hackathonsCounts?.length) return;
  
  // Get the last 30 scrapes (or less if fewer are available)
  const chartData = [...scrapeStats.hackathonsCounts]
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-30);
  
  const labels = chartData.map(item => {
    const date = new Date(item.timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  });
  
  const data = {
    labels: labels,
    datasets: [
      {
        label: 'Total Hackathons',
        data: chartData.map(item => item.count),
        borderColor: '#4f46e5',
        backgroundColor: 'rgba(79, 70, 229, 0.1)',
        tension: 0.3,
        fill: true
      },
      {
        label: 'Devfolio',
        data: chartData.map(item => item.sources?.devfolio || 0),
        borderColor: '#0ea5e9',
        backgroundColor: 'rgba(14, 165, 233, 0.1)',
        hidden: false
      }
    ]
  };
  
  const config = {
    type: 'line',
    data: data,
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top',
        },
        tooltip: {
          mode: 'index',
          intersect: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0
          }
        }
      }
    }
  };
  
  // Destroy previous chart if it exists
  if (hackathonsChartInstance) {
    hackathonsChartInstance.destroy();
  }
  
  // Create new chart
  hackathonsChartInstance = new Chart(hackathonsChart, config);
}

// Event Listeners
hackathonsTab.addEventListener('click', () => {
  activeTab = 'hackathons';
  hackathonsTab.classList.add('active');
  schemesTab.classList.remove('active');
  statsTab.classList.remove('active');
  hackathonsContainer.classList.add('active');
  schemesContainer.classList.remove('active');
  statsContainer.classList.remove('active');
});

schemesTab.addEventListener('click', () => {
  activeTab = 'schemes';
  schemesTab.classList.add('active');
  hackathonsTab.classList.remove('active');
  statsTab.classList.remove('active');
  schemesContainer.classList.add('active');
  hackathonsContainer.classList.remove('active');
  statsContainer.classList.remove('active');
});

statsTab.addEventListener('click', () => {
  activeTab = 'stats';
  statsTab.classList.add('active');
  hackathonsTab.classList.remove('active');
  schemesTab.classList.remove('active');
  statsContainer.classList.add('active');
  hackathonsContainer.classList.remove('active');
  schemesContainer.classList.remove('active');
});

// Search functionality
function handleSearch() {
  searchTerm = searchInput.value.trim();
  if (activeTab === 'hackathons') {
    renderHackathons();
  } else {
    renderSchemes();
  }
}

searchButton.addEventListener('click', handleSearch);
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleSearch();
  }
});

// Filter functionality
filterSelect.addEventListener('change', () => {
  filterOption = filterSelect.value;
  if (activeTab === 'hackathons') {
    renderHackathons();
  } else {
    renderSchemes();
  }
});

// Initialize the dashboard when the page loads
document.addEventListener('DOMContentLoaded', initDashboard);
