(() => {
  'use strict';

  const STORAGE = {
    boards: 'natureSwipe.boards',
    liked: 'natureSwipe.liked',
    seen: 'natureSwipe.seen',
  };
  const MAX_SEEN = 5000;
  const VISIBLE_CARDS = 3;
  const PRELOAD_AHEAD = 5;

  // ---- Storage (wrapped so private windows or blocked storage don't break the app)

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage full or unavailable. The app still works for this visit.
    }
  }

  // ---- State

  const state = {
    boards: load(STORAGE.boards, null), // null means "use the server defaults"
    defaultBoards: [],
    liked: load(STORAGE.liked, []),
    seen: new Set(load(STORAGE.seen, [])),
    queue: [],
    history: [],
    boardErrors: {},
    loading: false,
    boardsChanged: false,
  };

  // ---- Elements

  const $ = (id) => document.getElementById(id);
  const deck = $('deck');
  const cardTemplate = $('card-template');
  const statusBox = $('status');
  const statusText = $('status-text');
  const statusAction = $('status-action');
  const btnLike = $('btn-like');
  const btnNope = $('btn-nope');
  const btnUndo = $('btn-undo');
  const likedCount = $('liked-count');
  const likedGrid = $('liked-grid');
  const likedEmpty = $('liked-empty');
  const boardList = $('board-list');
  const boardInput = $('board-input');
  const boardError = $('board-error');

  // ---- Helpers

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // Mirrors normalizeBoard in lib/pinterest.js so bad input is caught before saving.
  function normalizeBoard(input) {
    let value = String(input || '').trim();
    value = value.replace(/^https?:\/\//i, '');
    value = value.replace(/^([a-z]{2,3}\.)?(www\.)?pinterest\.[a-z.]+\//i, '');
    value = value.replace(/\.rss$/i, '');
    value = value.replace(/[?#].*$/, '');
    value = value.replace(/^\/+|\/+$/g, '');
    return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.%-]+$/.test(value) ? value : null;
  }

  function activeBoards() {
    return state.boards || state.defaultBoards;
  }

  function saveSeen() {
    save(STORAGE.seen, [...state.seen].slice(-MAX_SEEN));
  }

  function setStatus(text, action) {
    if (!text) {
      statusBox.hidden = true;
      return;
    }
    statusBox.hidden = false;
    statusText.textContent = text;
    if (action) {
      statusAction.hidden = false;
      statusAction.textContent = action.label;
      statusAction.onclick = action.run;
    } else {
      statusAction.hidden = true;
      statusAction.onclick = null;
    }
  }

  function preload(pins) {
    pins.forEach((pin) => {
      const img = new Image();
      img.src = pin.image;
    });
  }

  // ---- Loading photos

  async function loadPins() {
    state.loading = true;
    state.boardsChanged = false;
    deck.replaceChildren();
    setStatus('Finding nature photos…');
    updateButtons();

    try {
      if (!state.defaultBoards.length) {
        const res = await fetch('/api/default-boards');
        state.defaultBoards = (await res.json()).boards;
      }
      const boards = activeBoards();
      if (!boards.length) {
        state.queue = [];
        state.loading = false;
        setStatus('No boards yet. Add a Pinterest board to start swiping.', {
          label: 'Add a board',
          run: () => showView('boards'),
        });
        renderBoards();
        return;
      }

      const res = await fetch(`/api/pins?boards=${encodeURIComponent(boards.join(','))}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      state.boardErrors = {};
      data.errors.forEach((e) => { state.boardErrors[e.board] = e.error; });
      renderBoards();

      state.queue = shuffle(data.pins.filter((pin) => !state.seen.has(pin.id)));
      state.history = [];
      state.loading = false;

      if (!data.pins.length) {
        setStatus('Couldn’t find any photos on these boards.', {
          label: 'Check boards',
          run: () => showView('boards'),
        });
      } else {
        renderDeck();
      }
    } catch (err) {
      console.error(err);
      state.loading = false;
      setStatus('Couldn’t load photos. Check your connection and try again.', {
        label: 'Try again',
        run: loadPins,
      });
    }
    updateButtons();
  }

  // ---- Deck rendering

  function createCard(pin) {
    const card = cardTemplate.content.firstElementChild.cloneNode(true);
    card.dataset.id = pin.id;
    const img = card.querySelector('img');
    img.src = pin.image;
    img.alt = pin.title || 'Nature photo';
    img.addEventListener('error', () => dropBrokenCard(pin.id), { once: true });
    card.querySelector('.card-title').textContent = pin.title || '';
    const link = card.querySelector('.card-link');
    if (pin.link) link.href = pin.link;
    else link.remove();
    return card;
  }

  function renderDeck() {
    const wanted = state.queue.slice(0, VISIBLE_CARDS);
    const existing = new Map([...deck.children].map((el) => [el.dataset.id, el]));

    // Remove cards that are no longer in the visible stack (but leave flying ones alone).
    existing.forEach((el, id) => {
      if (!el.classList.contains('is-leaving') && !wanted.some((p) => p.id === id)) el.remove();
    });

    // Insert in reverse so the first pin ends up on top (last in the DOM).
    for (let i = wanted.length - 1; i >= 0; i--) {
      const pin = wanted[i];
      let card = existing.get(pin.id);
      if (!card || card.classList.contains('is-leaving')) {
        card = createCard(pin);
      }
      card.dataset.depth = String(i);
      card.style.zIndex = String(VISIBLE_CARDS - i);
      deck.appendChild(card);
    }

    // Leaving cards should stay above everything while they animate out.
    deck.querySelectorAll('.is-leaving').forEach((el) => {
      el.style.zIndex = '10';
      deck.appendChild(el);
    });

    const top = topCard();
    if (top && !top.dataset.bound) bindDrag(top);

    preload(state.queue.slice(VISIBLE_CARDS, VISIBLE_CARDS + PRELOAD_AHEAD));

    if (!state.queue.length && !state.loading) {
      setStatus('You’ve seen every photo on your boards. Add more boards or start over.', {
        label: 'Start over',
        run: resetSeen,
      });
    } else {
      setStatus(null);
    }
    updateButtons();
  }

  function topCard() {
    const cards = [...deck.querySelectorAll('.card:not(.is-leaving)')];
    return cards.find((c) => c.dataset.depth === '0') || null;
  }

  function dropBrokenCard(id) {
    const index = state.queue.findIndex((p) => p.id === id);
    if (index === -1) return;
    state.queue.splice(index, 1);
    renderDeck();
  }

  // ---- Dragging

  function bindDrag(card) {
    card.dataset.bound = '1';
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dy = 0;
    let startTime = 0;
    let pointerId = null;

    const likeStamp = card.querySelector('.stamp-like');
    const nopeStamp = card.querySelector('.stamp-nope');

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('a')) return; // let the Pinterest link work
      if (card.classList.contains('is-leaving')) return;
      pointerId = e.pointerId;
      card.setPointerCapture(pointerId);
      startX = e.clientX;
      startY = e.clientY;
      dx = 0;
      dy = 0;
      startTime = performance.now();
      card.classList.add('is-dragging');
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      dx = e.clientX - startX;
      dy = e.clientY - startY;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      const strength = Math.min(Math.abs(dx) / 110, 1);
      likeStamp.style.opacity = dx > 0 ? strength : 0;
      nopeStamp.style.opacity = dx < 0 ? strength : 0;
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      pointerId = null;
      card.classList.remove('is-dragging');
      const elapsed = Math.max(performance.now() - startTime, 1);
      const velocity = Math.abs(dx) / elapsed; // px per ms
      const threshold = Math.min(card.offsetWidth * 0.3, 130);

      if (Math.abs(dx) > threshold || (velocity > 0.6 && Math.abs(dx) > 40)) {
        swipe(dx > 0 ? 'like' : 'nope', dy);
      } else {
        card.style.transform = '';
        likeStamp.style.opacity = 0;
        nopeStamp.style.opacity = 0;
      }
    }

    card.addEventListener('pointerdown', onDown);
    card.addEventListener('pointermove', onMove);
    card.addEventListener('pointerup', onUp);
    card.addEventListener('pointercancel', onUp);
  }

  // ---- Swiping

  function swipe(action, dy = 0) {
    const card = topCard();
    if (!card || state.loading) return;
    const pin = state.queue.shift();
    if (!pin) return;

    state.seen.add(pin.id);
    saveSeen();
    if (action === 'like' && !state.liked.some((p) => p.id === pin.id)) {
      state.liked.unshift({ ...pin, likedAt: Date.now() });
      save(STORAGE.liked, state.liked);
      renderLiked();
    }
    state.history.push({ pin, action });
    if (state.history.length > 50) state.history.shift();

    // Fly the card off screen.
    const direction = action === 'like' ? 1 : -1;
    const distance = window.innerWidth + card.offsetWidth;
    card.classList.add('is-leaving');
    card.querySelector(action === 'like' ? '.stamp-like' : '.stamp-nope').style.opacity = 1;
    card.style.transform = `translate(${direction * distance}px, ${dy}px) rotate(${direction * 30}deg)`;
    card.style.opacity = '0';
    card.addEventListener('transitionend', () => card.remove(), { once: true });
    setTimeout(() => card.remove(), 500); // in case transitionend doesn't fire

    renderDeck();
  }

  function undo() {
    const last = state.history.pop();
    if (!last) return;
    state.seen.delete(last.pin.id);
    saveSeen();
    if (last.action === 'like') {
      state.liked = state.liked.filter((p) => p.id !== last.pin.id);
      save(STORAGE.liked, state.liked);
      renderLiked();
    }
    state.queue.unshift(last.pin);
    deck.querySelectorAll('.is-leaving').forEach((el) => el.remove());
    renderDeck();
  }

  function resetSeen() {
    state.seen.clear();
    saveSeen();
    loadPins();
  }

  function updateButtons() {
    const canSwipe = !state.loading && state.queue.length > 0;
    btnLike.disabled = !canSwipe;
    btnNope.disabled = !canSwipe;
    btnUndo.disabled = state.history.length === 0;
  }

  // ---- Liked view

  function renderLiked() {
    likedCount.textContent = String(state.liked.length);
    likedEmpty.hidden = state.liked.length > 0;
    $('clear-liked').hidden = state.liked.length === 0;

    likedGrid.replaceChildren(...state.liked.map((pin) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = pin.link || pin.image;
      a.target = '_blank';
      a.rel = 'noopener';
      a.title = pin.title || '';
      const img = document.createElement('img');
      img.src = pin.image;
      img.alt = pin.title || 'Liked nature photo';
      img.loading = 'lazy';
      a.appendChild(img);

      const remove = document.createElement('button');
      remove.className = 'remove';
      remove.setAttribute('aria-label', 'Remove from liked');
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        state.liked = state.liked.filter((p) => p.id !== pin.id);
        save(STORAGE.liked, state.liked);
        renderLiked();
      });

      li.append(a, remove);
      return li;
    }));
  }

  // ---- Boards view

  function setBoards(boards) {
    state.boards = boards;
    save(STORAGE.boards, boards);
    state.boardsChanged = true;
    renderBoards();
  }

  function renderBoards() {
    const boards = activeBoards();
    boardList.replaceChildren(...boards.map((board) => {
      const li = document.createElement('li');
      const info = document.createElement('div');
      const a = document.createElement('a');
      a.href = `https://www.pinterest.com/${board}/`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = board;
      info.appendChild(a);
      if (state.boardErrors[board]) {
        const err = document.createElement('span');
        err.className = 'board-error';
        err.textContent = state.boardErrors[board];
        info.appendChild(err);
      }
      const remove = document.createElement('button');
      remove.setAttribute('aria-label', `Remove ${board}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        setBoards(activeBoards().filter((b) => b !== board));
      });
      li.append(info, remove);
      return li;
    }));
  }

  $('add-board').addEventListener('submit', (e) => {
    e.preventDefault();
    const board = normalizeBoard(boardInput.value);
    if (!board) {
      boardError.textContent = 'That doesn’t look like a board link. Try pinterest.com/user/board-name';
      boardError.hidden = false;
      return;
    }
    boardError.hidden = true;
    boardInput.value = '';
    if (!activeBoards().includes(board)) setBoards([...activeBoards(), board]);
  });

  $('reset-boards').addEventListener('click', () => {
    state.boards = null;
    try { localStorage.removeItem(STORAGE.boards); } catch { /* ignore */ }
    state.boardsChanged = true;
    renderBoards();
  });

  $('reset-seen').addEventListener('click', () => {
    resetSeen();
    showView('swipe');
  });

  $('clear-liked').addEventListener('click', () => {
    if (!confirm('Remove all liked photos?')) return;
    state.liked = [];
    save(STORAGE.liked, state.liked);
    renderLiked();
  });

  // ---- Tabs

  let currentView = 'swipe';

  function showView(name) {
    currentView = name;
    document.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.view === name;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('.view').forEach((view) => {
      view.classList.toggle('is-active', view.id === `view-${name}`);
    });
    if (name === 'swipe' && state.boardsChanged) loadPins();
  }

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => showView(tab.dataset.view));
  });

  // ---- Controls

  btnLike.addEventListener('click', () => swipe('like'));
  btnNope.addEventListener('click', () => swipe('nope'));
  btnUndo.addEventListener('click', undo);

  document.addEventListener('keydown', (e) => {
    if (currentView !== 'swipe') return;
    if (e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); swipe('like'); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); swipe('nope'); }
    else if (e.key === 'Backspace' || e.key === 'z') { e.preventDefault(); undo(); }
  });

  // ---- Start

  renderLiked();
  loadPins();
})();
