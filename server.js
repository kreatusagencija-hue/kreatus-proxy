const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => res.json({ status: 'Kreatus Proxy OK' }));

// Test Apify connection
app.get('/apify/test', async (req, res) => {
  const token = req.headers['x-apify-token'];
  if (!token) return res.status(400).json({ error: 'Manjka Apify token' });
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me?token=${token}`);
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Zaženi Apify actor
app.post('/apify/run', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const { actorId, input } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Apify token' });
  if (!actorId) return res.status(400).json({ error: 'Manjka actorId' });

  try {
    const r = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input)
    });
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Preveri status runa
app.get('/apify/run/:runId/status', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const { runId } = req.params;
  try {
    const r = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pridobi rezultate iz dataseta
app.get('/apify/dataset/:datasetId', async (req, res) => {
  const token = req.headers['x-apify-token'];
  const { datasetId } = req.params;
  const limit = req.query.limit || 20;
  try {
    const r = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=${limit}`);
    const d = await r.json();
    res.json(d);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Claude API proxy - keywords extraction
app.post('/claude/keywords', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { prompt, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Iz tega opisa za stranko "${client}" izvleci 5 iskanih ključnih besed za TikTok/Instagram iskanje. Vrni SAMO JSON array stringov, nič drugega, brez backtick-ov: "${prompt}"`
        }]
      })
    });
    const d = await r.json();
    const text = d.content?.[0]?.text || '[]';
    try {
      const keywords = JSON.parse(text.trim());
      res.json({ keywords });
    } catch {
      res.json({ keywords: prompt.split(/[,\s]+/).filter(w => w.length > 3).slice(0, 5) });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Claude API proxy - analiza videa
app.post('/claude/analyze', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { video, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Analiziraj ta ${video.platform} reel za agencijo Kreatus (stranka: ${client}):

Profil: ${video.handle}
Opis: ${video.description}
Ogledi: ${video.views}, Všečki: ${video.likes}, Komentarji: ${video.comments}

Napiši v slovenščini:
1. ANALIZA VSEBINE (kaj prikazuje, slog, ton, hook)
2. ZAKAJ DELUJE (psihologija, struktura, timing)
3. KLJUČNI ELEMENTI ZA ADAPTACIJO

Bodi konkreten, kratek, uporaben za produkcijsko ekipo.`
        }]
      })
    });
    const d = await r.json();
    res.json({ analysis: d.content?.[0]?.text || 'Analiza ni uspela.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Claude API proxy - generiranje scenarija
app.post('/claude/scenario', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { analysis, video, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{
          role: 'user',
          content: `Generiraj scenarij za stranko "${client}" navdihnjeno s tem ${video.platform} reelom (@${video.handle}).

ANALIZA ORIGINALNEGA VIDEA:
${analysis}

Napiši scenarij:
HOOK (0-3 sek): [besedilo/akcija]
SREDINA (3-25 sek): [kadri, akcije, besedilo]
ZAKLJUČEK/CTA (25-30 sek): [poziv k akciji]
CAPTION: [opis za objavo z emoji]
HASHTAGI: [8-10 relevantnih]
GLASBA/TON: [predlog žanra]
SNEMALNI NAPOTKI: [praktični nasveti za ekipo]

Slovenščina, konkretno in produkcijsko uporabno.`
        }]
      })
    });
    const d = await r.json();
    res.json({ scenario: d.content?.[0]?.text || 'Generiranje ni uspelo.' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Claude API proxy - skupna analiza več videov
app.post('/claude/analyze-all', async (req, res) => {
  const token = req.headers['x-claude-token'];
  const { videos, client } = req.body;
  if (!token) return res.status(400).json({ error: 'Manjka Claude token' });

  const summaries = videos.map(v =>
    `@${v.handle} (${v.platform}): ${v.description?.substring(0, 100)} | ${v.views} ogledov | ${v.likes} všečkov`
  ).join('\n');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': token,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1800,
        messages: [{
          role: 'user',
          content: `Analiziraj teh ${videos.length} videov in generiraj skupni scenarij za stranko "${client}":

${summaries}

Identificiraj vzorce in napiši:
SKUPNI VZORCI: [kaj deluje pri vseh]
FORMULA USPEHA: [ključni elementi]

SCENARIJ:
HOOK (0-3 sek):
SREDINA (3-25 sek):
CTA (25-30 sek):
CAPTION:
HASHTAGI:
GLASBA/TON:
SNEMALNI NAPOTKI:

Slovenščina, konkretno.`
        }]
      })
    });
    const d = await r.json();
    res.json({ scenario: d.content?.[0]?.text || '' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => console.log(`Kreatus proxy teče na portu ${PORT}`));
