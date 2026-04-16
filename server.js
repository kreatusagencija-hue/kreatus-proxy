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

// TIKTOK - clockworks~tiktok-scraper
// Podpira: hashtags, searchQueries, profiles, postURLs
// leastDiggs = minimalni likes (ne ogledi - Apify nima ogledi filtra)
app.post('/apify/tiktok', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const { hashtags, searchQueries, profiles, postURLs, count } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Apify token' });

  const input = {
    hashtags: hashtags || [],
    searchQueries: searchQueries || [],
    profiles: profiles || [],
    postURLs: postURLs || [],
    resultsPerPage: count || 20,
    leastDiggs: 0,
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
    const r = await fetch(`https://api.apify.com/v2/acts/clockworks~tiktok-scraper/runs?token=${token}`, {
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

// INSTAGRAM - apify~instagram-hashtag-scraper
// Podpira: hashtags, resultsType, resultsLimit
app.post('/apify/instagram', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const { hashtags, count } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Apify token' });

  const input = {
    hashtags: hashtags || [],
    resultsType: 'posts',
    resultsLimit: count || 20
  };

  try {
    const r = await fetch(`https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/runs?token=${token}`, {
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

// Preveri status runa
app.get('/apify/run/:runId/status', async (req, res) => {
  const token = req.headers['x-apify-token'];
  try {
    const r = await fetch(`https://api.apify.com/v2/actor-runs/${req.params.runId}?token=${token}`);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Pridobi rezultate
app.get('/apify/dataset/:datasetId', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const limit = req.query.limit || 50;
  try {
    const r = await fetch(`https://api.apify.com/v2/datasets/${req.params.datasetId}/items?token=${token}&limit=${limit}`);
    res.json(await r.json());
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Claude - generiranje ključnih besed iz prompta
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
        messages: [{ role: 'user', content: `Za TikTok/Instagram iskanje za stranko "${client}" izvleci iz opisa:
- 3 angleske hashtage (brez # znaka)
- 2 angleske iskalne fraze (keyword search)

Opis: "${prompt}"

Vrni SAMO JSON v tej obliki, brez razlage:
{"hashtags":["beseda1","beseda2","beseda3"],"searchQueries":["fraza1","fraza2"]}` }]
      })
    });
    const d = await r.json();
    const text = (d.content?.[0]?.text || '').trim();
    try {
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch {
      const words = prompt.split(/[,\s]+/).filter(w => w.length > 3).slice(0, 3);
      res.json({ hashtags: words, searchQueries: [prompt.substring(0, 50)] });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Claude - analiza videa
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
        messages: [{ role: 'user', content: `Analiziraj ta ${video.platform} reel za agencijo Kreatus, stranka: ${client}.

Profil: ${video.handle}
Opis: ${video.description}
Ogledi: ${video.views} | Likes: ${video.likes} | Komentarji: ${video.comments}

Napisi v slovenscini:
1. ANALIZA VSEBINE - kaj prikazuje, slog, ton, hook
2. ZAKAJ DELUJE - psihologija, struktura, timing
3. KLJUCNI ELEMENTI ZA ADAPTACIJO - kaj vzeti za nase vsebine

Bodi konkreten in kratek.` }]
      })
    });
    const d = await r.json();
    res.json({ analysis: d.content?.[0]?.text || 'Analiza ni uspela.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Claude - generiranje scenarija
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
        messages: [{ role: 'user', content: `Generiraj video scenarij za stranko "${client}" navdihnjeno s ${video.platform} reelom od @${video.handle}.

ANALIZA ORIGINALNEGA VIDEA:
${analysis}

Napisi scenarij v slovenscini:
HOOK (0-3 sek):
SREDINA (3-25 sek):
CTA (25-30 sek):
CAPTION:
HASHTAGI:
GLASBA/TON:
SNEMALNI NAPOTKI:` }]
      })
    });
    const d = await r.json();
    res.json({ scenario: d.content?.[0]?.text || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Claude - skupna analiza vec videov
app.post('/claude/analyze-all', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { videos, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });
  const summaries = videos.map(v =>
    `@${v.handle} (${v.platform}): ${(v.description || '').substring(0, 100)} | ${v.views} ogledov | ${v.likes} likes`
  ).join('\n');
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': token, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', max_tokens: 1800,
        messages: [{ role: 'user', content: `Analiziraj ${videos.length} videov in generiraj skupni scenarij za stranko "${client}":

${summaries}

Napisi v slovenscini:
SKUPNI VZORCI:
FORMULA USPEHA:
HOOK (0-3 sek):
SREDINA (3-25 sek):
CTA (25-30 sek):
CAPTION:
HASHTAGI:
GLASBA/TON:
SNEMALNI NAPOTKI:` }]
      })
    });
    const d = await r.json();
    res.json({ scenario: d.content?.[0]?.text || '' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => console.log(`Kreatus proxy na portu ${PORT}`));
