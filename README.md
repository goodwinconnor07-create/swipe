# Nature Swipe

Swipe right or left on nature photos pulled from public Pinterest boards. Right swipes are saved to a Liked gallery.

## Use it online

It's hosted on GitHub Pages at https://goodwinconnor07-create.github.io/swipe/

## Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

```sh
npm start
```

Then open http://localhost:3000. Set `PORT` to use a different port.

## How to use it

- **Swipe right** (or press →, or tap 🔥) to like a photo.
- **Swipe left** (or press ←, or tap ❌) to pass.
- **↩️ Undo** (or press Backspace) brings back the last photo.
- **Liked** shows every photo you've liked. Tap one to see it full screen.
- **Boards** lets you add or remove Pinterest boards. Paste a link like `https://www.pinterest.com/user/board-name/`.

Photos you've already swiped won't show up again. Use "Show seen photos again" on the Boards tab to start over.

Your likes, boards and seen photos are saved in your browser's local storage, so they stay on that device.

## How it gets photos

Every public Pinterest board has an RSS feed at `https://www.pinterest.com/<user>/<board>.rss`. The server (`server.js`) fetches those feeds, pulls out the images, and hands them to the page as JSON at `/api/pins`. It does this on the server because browsers block the page from reading Pinterest directly (CORS). Feeds are cached for 10 minutes.

Each feed only has a board's most recent 25 or so pins, so adding more boards gives you more photos to swipe.

### On GitHub Pages

GitHub Pages only hosts files, so it can't run `server.js`. Instead, the photos are saved in `pins.json`, and the page reads that file when it can't reach the server. The boards it uses are listed in `boards.json`.

A GitHub Action (`.github/workflows/update-pins.yml`) refreshes `pins.json` every day, and whenever `boards.json` changes. You can also run it by hand from the Actions tab, or run `npm run fetch-pins` locally and commit the result.

To add a board to the hosted version, add it to `boards.json`. Adding boards from the Boards tab only works with `npm start`.

## Project layout

```
index.html          The app page
app.js, styles.css  The app's script and styles
boards.json         Pinterest boards to pull photos from
pins.json           Saved photos for GitHub Pages (generated)
server.js           Local server with a live /api/pins route
lib/pinterest.js    Board link parsing, RSS parsing and fetching
scripts/            fetch-pins.js, which writes pins.json
test/               Tests, run with `npm test`
```
