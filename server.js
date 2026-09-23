// Small static server plus one API route that reads Pinterest board RSS feeds.
// The browser can't fetch those feeds itself because of CORS, so this does it.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { normalizeBoard, parseFeed, feedUrl } = require('./lib/pinterest');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_MS = 10 * 60 * 1000;
const MAX_BOARDS = 20;

const DEFAULT_BOARDS = [
  'bcr8tive/nature-photography',
  'pin4ever/beautiful-nature-photography-and-images',
  'paulchongart/nature-landscape-photography',
  'mandydv98/nature-pictures',
  'iristhefinder/minimalist-nature-photography',
  'angeliny1/nature-photography',
  'cgproprints/landscape-photography-inspiration',
  'usemuzli/landscape-photography',
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

const cache = new Map();

async function fetchBoard(board) {
  const cached = cache.get(board);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.pins;

  const res = await fetch(feedUrl(board), {
    headers: { 'User-Agent': 'Mozilla/5.0 (nature-swipe)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Pinterest returned ${res.status}`);
  const pins = parseFeed(await res.text(), board);
  cache.set(board, { time: Date.now(), pins });
  return pins;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': MIME_TYPES['.json'], 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handlePins(url, res) {
  const requested = url.searchParams.get('boards');
  const raw = requested ? requested.split(',') : DEFAULT_BOARDS;
  const boards = [...new Set(raw.map(normalizeBoard).filter(Boolean))].slice(0, MAX_BOARDS);
  if (boards.length === 0) return sendJson(res, 400, { error: 'No valid boards given.' });

  const results = await Promise.allSettled(boards.map(fetchBoard));
  const seen = new Set();
  const pins = [];
  const errors = [];

  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      errors.push({ board: boards[i], error: result.reason.message });
      return;
    }
    if (result.value.length === 0) {
      errors.push({ board: boards[i], error: 'No pins found (is the board public?)' });
    }
    for (const pin of result.value) {
      if (seen.has(pin.id)) continue;
      seen.add(pin.id);
      pins.push(pin);
    }
  });

  sendJson(res, 200, { boards, pins, errors });
}

function serveStatic(url, res) {
  const pathname = decodeURIComponent(url.pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/pins') return await handlePins(url, res);
    if (url.pathname === '/api/default-boards') return sendJson(res, 200, { boards: DEFAULT_BOARDS });
    serveStatic(url, res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: 'Something went wrong.' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Nature Swipe running at http://localhost:${PORT}`));
}

module.exports = { server, DEFAULT_BOARDS };
