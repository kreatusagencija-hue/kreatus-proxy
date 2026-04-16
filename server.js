const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));
const app = express();
const PORT = process.env.PORT || 3000;

// Tokeni iz Render Environment Variables
const APIFY_TOKEN = process.env.APIFY_TOKEN || '';
const CLAUDE_TOKEN = process.env.CLAUDE_TOKEN || '';

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});
app.use(express.json());

// Health check + vrne proxy URL info
app.get('/', (req, res) => res.json({ status: 'Kreatus Proxy OK' }));

// Tool dobi config samodejno - brez vpisovanja
app.get('/config', (req, res) => {
  if (!APIFY_TOKEN || !CLAUDE_TOKEN) {
    return res.status(500).json({ error: 'Tokeni niso nastavljeni na Render.' });
  }
  res.json({ ok: true });
});

app.post('/apify/tiktok', async (req, res) => {
  const { hashtags, searchQueries, profiles, postURLs, count } = req.body;
  if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_TOKEN ni nastavljen na Render' });

  const input = {
    hashtags: hashtags || [],
    searchQueries: searchQueries || [],
    profiles: profiles || [],
    postURLs: postURLs || [],
    resultsPerPage: count || 20,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSlideshowImages: false,
    shouldDownloadAvatars: false,
    shouldDownloadMusicCovers: false,
    downloadSubtitlesOptions: 'NEVER_DOWNLOAD_SUBTITLES',
    scrapeRelatedVideos: false,
    proxyCountryCode: 'None'
  };

  try {
    const r = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: `Apify: ${d.error.message}` });
    if (!d.data?.id) return res.status(400).json({ error: 'Apify ni vrnil run ID' });
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/apify/instagram', async (req, res) => {
  const { hashtags, count } = req.body;
  if (!APIFY_TOKEN) return res.status(500).json({ error: 'APIFY_TOKEN ni nastavljen na Render' });

  const input = {
    hashtags: hashtags || [],
    resultsType: 'posts',
    resultsLimit: count || 20
  };

  try {
    const r = await fetch(`https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/runs?token=${APIFY_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: `Apify: ${d.error.message}` });
    if (!d.data?.id) return res.status(400).json({ error: 'Apify ni vrnil run ID' });
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/apify/run/:runId/status', async (req, res) => {
  try {
    const r = await fetch(`https://api.apify.com/v2/actor-runs/${req.params.runId}?token=${APIFY_TOKEN}`);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/apify/dataset/:datasetId', async (req, res) => {
  const limit = req.query.limit || 50;
  try {
    const r = await fetch(`https://api.apify.com/v2/datasets/${req.params.datasetId}/items?token=${APIFY_TOKEN}&limit=${limit}`);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude/keywords', async (req, res) => {
  const { prompt, client } = req.body;
  if (!CLAUDE_TOKEN) return res.status(500).json({ error: 'CLAUDE_TOKEN ni nastavljen na Render' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_TOKEN, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 300,
        messages: [{ role: 'user', content: `Za TikTok/Instagram iskanje za stranko "${client}" izvleci iz opisa:\n- 3 angleske hashtage (brez # znaka)\n- 2 angleske iskalne fraze\n\nOpis: "${prompt}"\n\nVrni SAMO JSON brez razlage:\n{"hashtags":["beseda1","beseda2","beseda3"],"searchQueries":["fraza1","fraza2"]}` }]
      })
    });
    const d = await r.json();
    const text = (d.content?.[0]?.text || '').trim();
    try { res.json(JSON.parse(text)); }
    catch { res.json({ hashtags: prompt.split(/[,\s]+/).filter(w => w.length > 3).slice(0,3), searchQueries: [prompt.substring(0,50)] }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude/analyze', async (req, res) => {
  const { video, client } = req.body;
  if (!CLAUDE_TOKEN) return res.status(500).json({ error: 'CLAUDE_TOKEN ni nastavljen na Render' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_TOKEN, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        messages: [{ role: 'user', content: `Analiziraj ta ${video.platform} reel za stranko ${client}:\nProfil: ${video.handle}\nOpis: ${video.description}\nOgledi: ${video.views} | Likes: ${video.likes} | Komentarji: ${video.comments}\n\nNapisi v slovenscini:\n1. ANALIZA VSEBINE\n2. ZAKAJ DELUJE\n3. KLJUCNI ELEMENTI ZA ADAPTACIJO` }]
      })
    });
    const d = await r.json();
    res.json({ analysis: d.content?.[0]?.text || 'Analiza ni uspela.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude/scenario', async (req, res) => {
  const { analysis, video, client } = req.body;
  if (!CLAUDE_TOKEN) return res.status(500).json({ error: 'CLAUDE_TOKEN ni nastavljen na Render' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_TOKEN, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1500,
        messages: [{ role: 'user', content: `Generiraj scenarij za stranko "${client}" po vzoru @${video.handle} (${video.platform}).\n\nANALIZA:\n${analysis}\n\nStruktura v slovenscini:\nHOOK (0-3 sek):\nSREDINA (3-25 sek):\nCTA (25-30 sek):\nCAPTION:\nHASHTAGI:\nGLASBA:\nSNEMALNI NAPOTKI:` }]
      })
    });
    const d = await r.json();
    res.json({ scenario: d.content?.[0]?.text || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude/analyze-all', async (req, res) => {
  const { videos, client } = req.body;
  if (!CLAUDE_TOKEN) return res.status(500).json({ error: 'CLAUDE_TOKEN ni nastavljen na Render' });
  const s = videos.map(v => `@${v.handle} (${v.platform}): ${(v.description||'').substring(0,100)} | ${v.views} ogledov`).join('\n');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_TOKEN, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1800,
        messages: [{ role: 'user', content: `Za stranko "${client}" analiziraj ${videos.length} videov in generiraj skupni scenarij:\n\n${s}\n\nSKUPNI VZORCI:\nFORMULA USPEHA:\nHOOK (0-3 sek):\nSREDINA (3-25 sek):\nCTA (25-30 sek):\nCAPTION:\nHASHTAGI:\nGLASBA:\nSNEMALNI NAPOTKI:\n\nV slovenscini.` }]
      })
    });
    const d = await r.json();
    res.json({ scenario: d.content?.[0]?.text || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Kreatus proxy na portu ${PORT}`));
