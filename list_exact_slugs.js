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

async function getTools(toolkit) {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.error('COMPOSIO_API_KEY not found in .env');
    return [];
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'backend.composio.dev',
      path: `/api/v3/tools?toolkit_slug=${toolkit}&limit=100`,
      method: 'GET',
      headers: {
        'x-api-key': apiKey
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const tools = json.items || json.tools || (Array.isArray(json) ? json : []);
          resolve(tools.map(t => t.slug));
        } catch (e) {
          resolve([]);
        }
      });
    });
    req.on('error', () => resolve([]));
    req.end();
  });
}

(async () => {
  const github = await getTools('github');
  const googlecalendar = await getTools('googlecalendar');
  const notion = await getTools('notion');
  
  console.log('--- GITHUB ---');
  console.log(github.join('\n'));
  console.log('--- CALENDAR ---');
  console.log(googlecalendar.join('\n'));
  console.log('--- NOTION ---');
  console.log(notion.join('\n'));
})();
