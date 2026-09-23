// Small static server plus an API route that reads Pinterest board RSS feeds live.
// The browser can't fetch those feeds itself because of CORS, so this does it.
// On GitHub Pages there's no server, so the app falls back to pins.json instead.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { normalizeBoard, fetchBoard, fetchBoards } = require('./lib/pinterest');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const CACHE_MS = 10 * 60 * 1000;
const MAX_BOARDS = 20;
const DEFAULT_BOARDS = require('./boards.json');

// Only these files are served, so the rest of the repo stays private.
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/pins.json': ['pins.json', 'application/json; charset=utf-8'],
};

const cache = new Map();

async function cachedFetchBoard(board) {
  const cached = cache.get(board);
  if (cached && Date.now() - cached.time < CACHE_MS) return cached.pins;
  const pins = await fetchBoard(board);
  cache.set(board, { time: Date.now(), pins });
  return pins;
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function handlePins(url, res) {
  const requested = url.searchParams.get('boards');
  const raw = requested ? requested.split(',') : DEFAULT_BOARDS;
  const boards = [...new Set(raw.map(normalizeBoard).filter(Boolean))].slice(0, MAX_BOARDS);
  if (boards.length === 0) return sendJson(res, 400, { error: 'No valid boards given.' });

  const { pins, errors } = await fetchBoards(boards, cachedFetchBoard);
  sendJson(res, 200, { boards, pins, errors });
}

function serveStatic(url, res) {
  const entry = STATIC_FILES[url.pathname];
  if (!entry) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  fs.readFile(path.join(ROOT, entry[0]), (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': entry[1] });
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
