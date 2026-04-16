const express = require('express');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-apify-token, x-claude-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(express.json());

app.get('/', (req, res) => res.json({ status: 'Kreatus Proxy OK' }));

app.get('/apify/test', async (req, res) => {
  const token = req.headers['x-apify-token'];
  if (!token) return res.status(400).json({ error: 'Manjka Apify token' });
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me?token=${token}`);
    const d = await r.json();
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Zaženi Apify actor - z pravilnimi input formati za vsak scraper
app.post('/apify/run', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const { platform, keywords, count } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Apify token' });

  let actorId, input;

  if (platform === 'tiktok') {
    // clockworks~tiktok-scraper - glavni TikTok scraper
    actorId = 'clockworks~tiktok-scraper';
    input = {
      searchQueries: keywords,        // iskanje po ključnih besedah
      resultsPerPage: count || 10,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false
    };
  } else if (platform === 'instagram') {
    // apify~instagram-scraper - uradni Instagram scraper
    actorId = 'apify~instagram-scraper';
    input = {
      search: keywords[0] || '',
      searchType: 'hashtag',
      searchLimit: count || 10,
      resultsType: 'posts',
      resultsLimit: count || 10
    };
  }

  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const d = await r.json();
    if (d.error) return res.status(400).json({ error: d.error.message || 'Apify napaka' });
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/apify/run/:runId/status', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const { runId } = req.params;
  try {
    const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    const d = await r.json();
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/apify/dataset/:datasetId', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const { datasetId } = req.params;
  const limit = req.query.limit || 20;
  try {
    const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${limit}`);
    const d = await r.json();
    res.json(d);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude/keywords', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { prompt, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 300,
        messages: [{ role: 'user', content: `Iz tega opisa za stranko "${client}" izvleci 3 iskalne fraze za TikTok/Instagram. Vrni SAMO JSON array stringov v anglescini (brez slovenscine), brez backtick-ov: "${prompt}"` }]
      })
    });
    const d = await r.json();
    const text = d.content?.[0]?.text || '[]';
    try { res.json({ keywords: JSON.parse(text.trim()) }); }
    catch { res.json({ keywords: prompt.split(/[,]+/).map(s=>s.trim()).filter(Boolean).slice(0,3) }); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude/analyze', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { video, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1000,
        messages: [{ role: 'user', content: `Analiziraj ta ${video.platform} reel za agencijo Kreatus (stranka: ${client}):\n\nProfil: ${video.handle}\nOpis: ${video.description}\nOgledi: ${video.views}, Vsecki: ${video.likes}, Komentarji: ${video.comments}\n\nNapisi v slovenscini:\n1. ANALIZA VSEBINE\n2. ZAKAJ DELUJE\n3. KLJUCNI ELEMENTI ZA ADAPTACIJO\n\nKonkretno, kratko, uporabno za produkcijsko ekipo.` }]
      })
    });
    const d = await r.json();
    res.json({ analysis: d.content?.[0]?.text || 'Analiza ni uspela.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude/scenario', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { analysis, video, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1500,
        messages: [{ role: 'user', content: `Generiraj scenarij za stranko "${client}" navdihnjeno s tem ${video.platform} reelom (@${video.handle}).\n\nANALIZA:\n${analysis}\n\nStruktura:\nHOOK (0-3 sek):\nSREDINA (3-25 sek):\nZAKLJUCEK/CTA (25-30 sek):\nCAPTION:\nHASHTAGI:\nGLASBA/TON:\nSNEMALNI NAPOTKI:\n\nSlovenscina, konkretno.` }]
      })
    });
    const d = await r.json();
    res.json({ scenario: d.content?.[0]?.text || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/claude/analyze-all', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { videos, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });
  const summaries = videos.map(v => `@${v.handle} (${v.platform}): ${(v.description||'').substring(0,100)} | ${v.views} ogledov`).join('\n');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1800,
        messages: [{ role: 'user', content: `Analiziraj ${videos.length} videov in generiraj skupni scenarij za stranko "${client}":\n\n${summaries}\n\nSKUPNI VZORCI:\nFORMULA USPEHA:\n\nSCENARIJ:\nHOOK (0-3 sek):\nSREDINA (3-25 sek):\nCTA (25-30 sek):\nCAPTION:\nHASHTAGI:\nGLASBA/TON:\nSNEMALNI NAPOTKI:\n\nSlovenscina.` }]
      })
    });
    const d = await r.json();
    res.json({ scenario: d.content?.[0]?.text || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Kreatus proxy na portu ${PORT}`));
