const https = require('https');
const fs = require('fs');
const path = require('path');

function getApiKey() {
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (!fs.existsSync(envPath)) return null;
    const env = fs.readFileSync(envPath, 'utf8');
    const match = env.match(/COMPOSIO_API_KEY=(.*)/);
    return match ? match[1].trim() : null;
  } catch (e) {
    return null;
  }
}

function fetchTools(toolkit) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('COMPOSIO_API_KEY not found in .env');
    return;
  }

  const options = {
    hostname: 'backend.composio.dev',
    path: `/api/v3/tools?toolkit_slug=${toolkit}&limit=100`,
    method: 'GET',
    headers: { 'x-api-key': apiKey }
  };
  
  https.request(options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        let json = JSON.parse(data);
        let items = json.items || json.tools || (Array.isArray(json) ? json : []);
        console.log(`${toolkit}:`, items.map(i => typeof i === 'string' ? i : i.slug).join(', '));
      } catch (e) {
        console.log(`Error fetching ${toolkit}:`, e.message);
      }
    });
  }).on('error', e => console.log(`Error ${toolkit}:`, e.message)).end();
}

fetchTools('github');
fetchTools('notion');
fetchTools('googlecalendar');
