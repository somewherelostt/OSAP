const fs = require('fs');
async function run() {
  const toolkits = ['gmail', 'github', 'notion', 'googlecalendar', 'slack', 'discord', 'twitter', 'linear'];
  const out = {};
  for(const t of toolkits) {
    try {
      const r = await fetch('https://backend.composio.dev/api/v3/tools?toolkit_slug=' + t + '&limit=100', {headers:{'x-api-key':'ak_9tRr__qJacSJCuoj_02z'}});
      const d = await r.json();
      out[t] = (d.items||d).map(i=>i.slug);
    } catch(e) {
      out[t] = [e.message];
    }
  }
  fs.writeFileSync('C:/Users/abuma/OneDrive/Desktop/Hackathon/harnoor/osap/out.json', JSON.stringify(out, null, 2));
}
run();
