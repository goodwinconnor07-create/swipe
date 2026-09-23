// Helpers for reading public Pinterest boards through their RSS feeds.
// Every public board exposes https://www.pinterest.com/<user>/<board>.rss

const BOARD_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.%-]+$/;

// Accepts "user/board", "pinterest.com/user/board" or a full board URL and
// returns "user/board", or null if it doesn't look like a board.
function normalizeBoard(input) {
  if (typeof input !== 'string') return null;
  let value = input.trim();
  value = value.replace(/^https?:\/\//i, '');
  value = value.replace(/^([a-z]{2,3}\.)?(www\.)?pinterest\.[a-z.]+\//i, '');
  value = value.replace(/\.rss$/i, '');
  value = value.replace(/[?#].*$/, '');
  value = value.replace(/^\/+|\/+$/g, '');
  return BOARD_PATTERN.test(value) ? value : null;
}

const ENTITIES = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function stripCdata(text) {
  return text.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1');
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return match ? decodeEntities(stripCdata(match[1].trim())) : '';
}

// Pinterest serves thumbnails at /236x/. The same image is available at
// /736x/, which looks much better on a full-size card.
function upgradeImage(url) {
  return url.replace(/i\.pinimg\.com\/\d+x\//, 'i.pinimg.com/736x/');
}

function parseFeed(xml, board) {
  const pins = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const item of items) {
    const description = tag(item, 'description');
    const img = description.match(/<img[^>]+src="([^"]+)"/i);
    if (!img) continue;

    const link = tag(item, 'link');
    const guid = tag(item, 'guid') || link;
    const idMatch = guid.match(/\/pin\/(\d+)/);
    // The description is the image markup followed by the pin's caption.
    const caption = decodeEntities(description.replace(/<[^>]*>/g, '')).trim();

    pins.push({
      id: idMatch ? idMatch[1] : guid,
      title: tag(item, 'title') || caption,
      image: upgradeImage(img[1]),
      link,
      board,
    });
  }
  return pins;
}

function feedUrl(board) {
  return `https://www.pinterest.com/${board}.rss`;
}

async function fetchBoard(board) {
  const res = await fetch(feedUrl(board), {
    headers: { 'User-Agent': 'Mozilla/5.0 (nature-swipe)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Pinterest returned ${res.status}`);
  return parseFeed(await res.text(), board);
}

// Fetches several boards at once and merges their pins, skipping duplicates.
// A board that fails is reported in `errors` instead of failing the whole call.
async function fetchBoards(boards, fetchOne = fetchBoard) {
  const results = await Promise.allSettled(boards.map((board) => fetchOne(board)));
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

  return { pins, errors };
}

module.exports = {
  normalizeBoard,
  decodeEntities,
  parseFeed,
  upgradeImage,
  feedUrl,
  fetchBoard,
  fetchBoards,
};
