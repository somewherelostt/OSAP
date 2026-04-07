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

const apiKey = getApiKey();
if (!apiKey) {
  console.error('COMPOSIO_API_KEY not found in .env');
  process.exit(1);
}

const options = {
  hostname: 'backend.composio.dev',
  path: '/api/v3/tools?toolkit_slug=github&limit=50',
  method: 'GET',
  headers: {
    'x-api-key': apiKey
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      const tools = json.items || json.tools || json;
      if (!Array.isArray(tools)) {
        console.log("Could not find tools in response:", tools);
        return;
      }
      console.log("Found", tools.length, "GitHub tools.");
      tools.forEach(t => {
        const slug = typeof t === 'string' ? t : t.slug;
        const description = typeof t === 'string' ? '' : (t.description || '');
        if (slug.includes('create') || slug.includes('repo')) {
          console.log("-", slug, ":", description.substring(0, 50));
        }
      });
    } catch (e) {
      console.log("Error parsing JSON:", e.message);
      console.log("Raw data:", data.substring(0, 500));
    }
  });
});

req.on('error', (e) => {
  console.log("Request error:", e.message);
});

req.end();
