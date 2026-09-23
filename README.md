# Nature Swipe

Swipe right or left on nature photos pulled from public Pinterest boards. Right swipes are saved to a Liked gallery.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer. There's nothing to install.

```sh
npm start
```

Then open http://localhost:3000. Set `PORT` to use a different port.

## How to use it

- **Swipe right** (or press →, or tap the heart) to like a photo.
- **Swipe left** (or press ←, or tap the ✕) to pass.
- **Undo** (or press Backspace) brings back the last photo.
- **Liked** shows every photo you've liked. Tap one to open it on Pinterest.
- **Boards** lets you add or remove Pinterest boards. Paste a link like `https://www.pinterest.com/user/board-name/`.

Photos you've already swiped won't show up again. Use "Show seen photos again" on the Boards tab to start over.

Your likes, boards and seen photos are saved in your browser's local storage, so they stay on that device.

## How it gets photos

Every public Pinterest board has an RSS feed at `https://www.pinterest.com/<user>/<board>.rss`. The server (`server.js`) fetches those feeds, pulls out the images, and hands them to the page as JSON at `/api/pins`. It does this on the server because browsers block the page from reading Pinterest directly (CORS). Feeds are cached for 10 minutes.

Each feed only has a board's most recent 25 or so pins, so adding more boards gives you more photos to swipe.

## Project layout

```
server.js           Static file server and /api/pins route
lib/pinterest.js    Board link parsing and RSS feed parsing
public/             The app (HTML, CSS, JS)
test/               Tests, run with `npm test`
```
