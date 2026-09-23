// Fetches every board in boards.json and writes the pins to pins.json.
// GitHub Pages can't run the server, so the hosted app reads this file instead.
// Run with `npm run fetch-pins`. A GitHub Action also runs it once a day.

const fs = require('fs');
const path = require('path');
const { normalizeBoard, fetchBoards } = require('../lib/pinterest');

const ROOT = path.join(__dirname, '..');
const OUTPUT = path.join(ROOT, 'pins.json');

async function main() {
  const boards = require(path.join(ROOT, 'boards.json')).map(normalizeBoard).filter(Boolean);
  const { pins, errors } = await fetchBoards(boards);

  errors.forEach((e) => console.warn(`${e.board}: ${e.error}`));
  if (pins.length === 0) {
    // Keep the old file rather than replacing it with an empty one.
    console.error('No pins fetched, leaving pins.json unchanged.');
    process.exit(1);
  }

  const output = { updated: new Date().toISOString(), boards, pins, errors };
  fs.writeFileSync(OUTPUT, JSON.stringify(output, null, 2) + '\n');
  console.log(`Wrote ${pins.length} pins from ${boards.length} boards to pins.json`);
}

main();
