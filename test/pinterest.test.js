const test = require('node:test');
const assert = require('node:assert');
const { normalizeBoard, decodeEntities, parseFeed, upgradeImage } = require('../lib/pinterest');

test('normalizeBoard accepts the usual ways of writing a board', () => {
  assert.strictEqual(normalizeBoard('user/board'), 'user/board');
  assert.strictEqual(normalizeBoard('https://www.pinterest.com/user/nature-pics/'), 'user/nature-pics');
  assert.strictEqual(normalizeBoard('pinterest.com/user/board.rss'), 'user/board');
  assert.strictEqual(normalizeBoard('https://uk.pinterest.co.uk/user/board/?utm=x'), 'user/board');
  assert.strictEqual(normalizeBoard('  user.name/my_board  '), 'user.name/my_board');
});

test('normalizeBoard rejects things that are not boards', () => {
  assert.strictEqual(normalizeBoard(''), null);
  assert.strictEqual(normalizeBoard('justauser'), null);
  assert.strictEqual(normalizeBoard('a/b/c'), null);
  assert.strictEqual(normalizeBoard('https://evil.com/user/board'), null);
  assert.strictEqual(normalizeBoard('../../etc'), null);
  assert.strictEqual(normalizeBoard(null), null);
});

test('decodeEntities handles named and numeric entities', () => {
  assert.strictEqual(decodeEntities('&lt;a href=&quot;x&quot;&gt; &amp; &#39;hi&#x27;'), '<a href="x"> & \'hi\'');
});

test('upgradeImage swaps thumbnails for the larger size', () => {
  assert.strictEqual(
    upgradeImage('https://i.pinimg.com/236x/ab/cd/ef/abc.jpg'),
    'https://i.pinimg.com/736x/ab/cd/ef/abc.jpg',
  );
});

test('parseFeed pulls pins out of a Pinterest RSS feed', () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?><rss version="2.0"><channel>
    <title>Nature</title>
    <item>
      <title>Misty forest</title>
      <link>https://www.pinterest.com/pin/111/</link>
      <description>&lt;a href=&quot;https://www.pinterest.com/pin/111/&quot;&gt;&lt;img src=&quot;https://i.pinimg.com/236x/aa/bb/cc/one.jpg&quot;&gt;&lt;/a&gt;Misty forest at dawn</description>
      <guid>https://www.pinterest.com/pin/111/</guid>
    </item>
    <item>
      <title></title>
      <link>https://www.pinterest.com/pin/222/</link>
      <description>&lt;img src=&quot;https://i.pinimg.com/236x/dd/ee/ff/two.jpg&quot;&gt;Lake &amp;amp; mountains</description>
      <guid>https://www.pinterest.com/pin/222/</guid>
    </item>
    <item>
      <title>No image here</title>
      <link>https://www.pinterest.com/pin/333/</link>
      <description>Just text</description>
      <guid>https://www.pinterest.com/pin/333/</guid>
    </item>
  </channel></rss>`;

  const pins = parseFeed(xml, 'user/nature');
  assert.strictEqual(pins.length, 2);
  assert.deepStrictEqual(pins[0], {
    id: '111',
    title: 'Misty forest',
    image: 'https://i.pinimg.com/736x/aa/bb/cc/one.jpg',
    link: 'https://www.pinterest.com/pin/111/',
    board: 'user/nature',
  });
  // Falls back to the caption when the title is empty.
  assert.strictEqual(pins[1].id, '222');
  assert.strictEqual(pins[1].title, 'Lake & mountains');
});
