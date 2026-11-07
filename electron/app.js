// Kapple Music Native Interface (Lightweight, Bit-Perfect Lossless ALAC)
(() => {
  'use strict';

  const bridge = window.kappleBridge;
  const api = bridge?.api || (async (method, path, body) => {
    const res = await fetch(`https://127.0.0.1:20025${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  });

  // State
  let currentTrack = null;
  let currentQueue = [];
  let currentIndex = -1;
  let isPlaying = false;
  let trackDurationMs = 0;
  let lyricsList = [];
  let activeLyricIdx = -1;
  let pollInterval = null;

  // DOM Elements
  const authView = document.getElementById('auth-view');
  const mainView = document.getElementById('main-view');
  const authForm = document.getElementById('auth-form');
  const authEmail = document.getElementById('auth-email');
  const authPassword = document.getElementById('auth-password');
  const authRemember = document.getElementById('auth-remember');
  const authSubmit = document.getElementById('auth-submit');
  const auth2FA = document.getElementById('auth-2fa');
  const authCode = document.getElementById('auth-code');
  const authCodeSubmit = document.getElementById('auth-code-submit');
  const authError = document.getElementById('auth-error');

  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  const npArt = document.getElementById('np-art');
  const npTitle = document.getElementById('np-title');
  const npArtist = document.getElementById('np-artist');
  const npBadge = document.getElementById('np-badge');
  const btnPlay = document.getElementById('btn-play');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const posTime = document.getElementById('pos-time');
  const durTime = document.getElementById('dur-time');
  const seekSlider = document.getElementById('seek-slider');
  const volSlider = document.getElementById('vol-slider');

  const btnLyrics = document.getElementById('btn-lyrics');
  const lyricsDrawer = document.getElementById('lyrics-drawer');
  const lyricsLines = document.getElementById('lyrics-lines');
  const btnLyricsClose = document.getElementById('btn-lyrics-close');

  const searchBar = document.getElementById('search-bar');
  const btnDetailBack = document.getElementById('btn-detail-back');
  const btnDetailPlay = document.getElementById('btn-detail-play');
  const btnSignout = document.getElementById('btn-signout');

  // Format mm:ss
  function formatTime(sec) {
    if (!sec || isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }

  // Format artwork URL
  function artworkUrl(url, size = 300) {
    if (!url) return 'assets/tray-icon.png';
    return url.replace('{w}', size).replace('{h}', size).replace('{f}', 'jpg');
  }

  // Tab switching
  function switchTab(tabId) {
    navItems.forEach(n => n.classList.toggle('active', n.dataset.tab === tabId));
    tabPanes.forEach(p => p.classList.toggle('hidden', p.id !== `tab-${tabId}`));
  }

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.dataset.tab;
      switchTab(tab);
      if (tab === 'home') loadHomeFeeds();
      else if (tab === 'playlists') loadPlaylists();
    });
  });

  // ── Authentication Flow (Single Login) ──────────────────────────────────────

  async function checkAuth() {
    try {
      const res = await api('GET', '/api/v1/drm/status');
      const snap = res?.json;
      const state = snap?.state || {};
      const authenticated = state.authentication === 'logged_in' || state.fairplay === 'ready';

      if (authenticated) {
        showMainView();
      } else {
        showAuthView();
      }
    } catch (e) {
      showAuthView();
    }
  }

  function showAuthView() {
    authView.classList.remove('hidden');
    mainView.classList.add('hidden');
    window.kappleReady?.();
  }

  function showMainView() {
    authView.classList.add('hidden');
    mainView.classList.remove('hidden');
    window.kappleReady?.();
    loadHomeFeeds();
  }

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.textContent = '';
    authSubmit.disabled = true;
    authSubmit.textContent = 'Connecting...';

    const email = authEmail.value.trim();
    const password = authPassword.value;

    try {
      const res = await api('POST', '/api/v1/drm/authenticate', { email, password });
      if (res?.status !== 200 && res?.status !== 202) {
        authError.textContent = res?.json?.message || 'Authentication failed. Please verify credentials.';
        authSubmit.disabled = false;
        authSubmit.textContent = 'Sign In';
        return;
      }

      // Poll DRM status
      pollAuthStatus(email, password, authRemember.checked);
    } catch (err) {
      authError.textContent = err.message || 'Connection error';
      authSubmit.disabled = false;
      authSubmit.textContent = 'Sign In';
    }
  });

  async function pollAuthStatus(email, password, remember) {
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 1500));
      const res = await api('GET', '/api/v1/drm/status');
      const snap = res?.json;
      const state = snap?.state || {};

      if (state.authentication === 'challenging') {
        authForm.classList.add('hidden');
        auth2FA.classList.remove('hidden');
        authCode.focus();
        return;
      }
      if (state.authentication === 'logged_in' || state.fairplay === 'ready') {
        if (remember) {
          bridge?.drmSaveCredentials?.({ email, password, remember: true }).catch(() => {});
        }
        showMainView();
        return;
      }
      if (state.authentication === 'failed') {
        authError.textContent = snap?.message || 'Invalid Apple ID or password';
        authSubmit.disabled = false;
        authSubmit.textContent = 'Sign In';
        return;
      }
    }
    authError.textContent = 'Authentication timed out. Please try again.';
    authSubmit.disabled = false;
    authSubmit.textContent = 'Sign In';
  }

  authCodeSubmit.addEventListener('click', async () => {
    const code = authCode.value.trim();
    if (!code) return;
    authCodeSubmit.disabled = true;
    authCodeSubmit.textContent = 'Verifying...';

    try {
      await api('POST', '/api/v1/drm/challenge', { reply: code });
      pollAuthStatus(authEmail.value.trim(), authPassword.value, authRemember.checked);
    } catch (err) {
      authError.textContent = err.message || 'Verification error';
      authCodeSubmit.disabled = false;
      authCodeSubmit.textContent = 'Verify Code';
    }
  });

  btnSignout.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to sign out?')) return;
    await api('POST', '/api/v1/drm/logout');
    await bridge?.drmClearCredentials?.({ reload: false });
    location.reload();
  });

  // ── Home Feeds (Recently Played & Heavy Rotation) ───────────────────────────

  async function loadHomeFeeds() {
    loadFeedSection('/api/v1/recommendations/recently-played', 'recently-played-grid');
    loadFeedSection('/api/v1/recommendations/heavy-rotation', 'heavy-rotation-grid');
  }

  async function loadFeedSection(endpoint, gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    grid.innerHTML = '<div style="color:var(--fg-subtle);font-size:13px;">Loading...</div>';

    try {
      const res = await api('GET', endpoint);
      const data = res?.json?.data || [];
      grid.innerHTML = '';
      if (!data.length) {
        grid.innerHTML = '<div style="color:var(--fg-subtle);font-size:13px;">No items found</div>';
        return;
      }

      data.forEach(item => {
        const attrs = item.attributes || {};
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <img class="card-art" src="${artworkUrl(attrs.artwork?.url)}" alt="" loading="lazy">
          <div class="card-title">${attrs.name || 'Untitled'}</div>
          <div class="card-subtitle">${attrs.artistName || attrs.curatorName || item.type || ''}</div>
        `;
        card.addEventListener('click', () => openItemDetail(item));
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = '<div style="color:var(--fg-subtle);font-size:13px;">Unable to load feed</div>';
    }
  }

  // ── Playlists ───────────────────────────────────────────────────────────────

  async function loadPlaylists() {
    const grid = document.getElementById('playlists-grid');
    grid.innerHTML = '<div style="color:var(--fg-subtle);font-size:13px;">Loading playlists...</div>';

    try {
      const res = await api('GET', '/api/v1/library/playlists');
      const playlists = res?.json?.playlists || [];
      grid.innerHTML = '';

      if (!playlists.length) {
        grid.innerHTML = '<div style="color:var(--fg-subtle);font-size:13px;">No library playlists found</div>';
        return;
      }

      playlists.forEach(pl => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
          <img class="card-art" src="${artworkUrl(pl.artwork?.url)}" alt="" loading="lazy">
          <div class="card-title">${pl.name || 'Playlist'}</div>
          <div class="card-subtitle">${pl.curatorName || 'Library'}</div>
        `;
        card.addEventListener('click', () => openPlaylistDetail(pl.id, pl.name, pl.artwork?.url));
        grid.appendChild(card);
      });
    } catch (e) {
      grid.innerHTML = '<div style="color:var(--fg-subtle);font-size:13px;">Failed to load playlists</div>';
    }
  }

  // ── Detail View (Tracks List) ───────────────────────────────────────────────

  async function openItemDetail(item) {
    if (item.type === 'albums' || item.type === 'catalog-albums') {
      openAlbumDetail(item.id, item.attributes);
    } else if (item.type === 'playlists' || item.type === 'catalog-playlists') {
      openPlaylistDetail(item.id, item.attributes?.name, item.attributes?.artwork?.url);
    }
  }

  async function openAlbumDetail(albumId, attrs) {
    switchTab('detail');
    document.getElementById('detail-badge').textContent = 'ALBUM';
    document.getElementById('detail-title').textContent = attrs?.name || 'Album';
    document.getElementById('detail-subtitle').textContent = attrs?.artistName || '';
    document.getElementById('detail-artwork').src = artworkUrl(attrs?.artwork?.url, 500);

    const tbody = document.getElementById('detail-tracks-body');
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--fg-subtle);">Loading tracks...</td></tr>';

    const res = await api('GET', `/api/v1/catalog/albums/${albumId}`);
    const tracks = res?.json?.data?.[0]?.relationships?.tracks?.data || [];
    renderTracksTable(tracks, attrs);
  }

  async function openPlaylistDetail(playlistId, name, artUrl) {
    switchTab('detail');
    document.getElementById('detail-badge').textContent = 'PLAYLIST';
    document.getElementById('detail-title').textContent = name || 'Playlist';
    document.getElementById('detail-subtitle').textContent = 'Apple Music Playlist';
    document.getElementById('detail-artwork').src = artworkUrl(artUrl, 500);

    const tbody = document.getElementById('detail-tracks-body');
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--fg-subtle);">Loading tracks...</td></tr>';

    const res = await api('GET', `/api/v1/catalog/playlists/${playlistId}`);
    const tracks = res?.json?.data?.[0]?.relationships?.tracks?.data || [];
    renderTracksTable(tracks, { name });
  }

  function renderTracksTable(tracks, meta) {
    const tbody = document.getElementById('detail-tracks-body');
    tbody.innerHTML = '';
    if (!tracks.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--fg-subtle);">No tracks available</td></tr>';
      return;
    }

    currentQueue = tracks;

    tracks.forEach((t, i) => {
      const attrs = t.attributes || {};
      const row = document.createElement('tr');
      row.className = 'track-row';
      if (currentTrack && currentTrack.id === t.id) row.classList.add('playing');

      const durSec = (attrs.durationInMillis || 0) / 1000;
      row.innerHTML = `
        <td class="track-num">${i + 1}</td>
        <td class="track-title">${attrs.name || 'Untitled'}</td>
        <td class="track-artist">${attrs.artistName || meta?.artistName || ''}</td>
        <td class="track-time">${formatTime(durSec)}</td>
      `;
      row.addEventListener('click', () => playTrack(t, tracks, i));
      tbody.appendChild(row);
    });

    btnDetailPlay.onclick = () => {
      if (tracks.length) playTrack(tracks[0], tracks, 0);
    };
  }

  btnDetailBack.addEventListener('click', () => switchTab('home'));

  // ── Search ──────────────────────────────────────────────────────────────────

  let searchDebounce = null;
  searchBar.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    const term = e.target.value.trim();
    if (!term) return;
    searchDebounce = setTimeout(() => performSearch(term), 300);
  });

  async function performSearch(term) {
    try {
      const res = await api('GET', `/api/v1/catalog/search?term=${encodeURIComponent(term)}`);
      const results = res?.json?.results || {};
      const songs = results.songs?.data || [];
      const albums = results.albums?.data || [];

      // Songs
      const songSec = document.getElementById('search-songs-section');
      const songBody = document.getElementById('search-songs-body');
      if (songs.length) {
        songSec.classList.remove('hidden');
        songBody.innerHTML = '';
        songs.slice(0, 10).forEach((s, idx) => {
          const a = s.attributes || {};
          const row = document.createElement('tr');
          row.className = 'track-row';
          row.innerHTML = `
            <td class="track-num">▶</td>
            <td class="track-title">${a.name}</td>
            <td class="track-artist">${a.artistName}</td>
            <td class="track-time">${formatTime((a.durationInMillis || 0) / 1000)}</td>
          `;
          row.addEventListener('click', () => playTrack(s, songs, idx));
          songBody.appendChild(row);
        });
      } else {
        songSec.classList.add('hidden');
      }

      // Albums
      const albumSec = document.getElementById('search-albums-section');
      const albumGrid = document.getElementById('search-albums-grid');
      if (albums.length) {
        albumSec.classList.remove('hidden');
        albumGrid.innerHTML = '';
        albums.slice(0, 10).forEach(al => {
          const a = al.attributes || {};
          const card = document.createElement('div');
          card.className = 'card';
          card.innerHTML = `
            <img class="card-art" src="${artworkUrl(a.artwork?.url)}" alt="" loading="lazy">
            <div class="card-title">${a.name}</div>
            <div class="card-subtitle">${a.artistName}</div>
          `;
          card.addEventListener('click', () => openAlbumDetail(al.id, a));
          albumGrid.appendChild(card);
        });
      } else {
        albumSec.classList.add('hidden');
      }
    } catch (err) {
      console.error('Search failed:', err);
    }
  }

  // ── Audio Playback Engine (libvlc Bit-Perfect ALAC) ──────────────────────────

  async function playTrack(track, queue = [], index = -1) {
    currentTrack = track;
    currentQueue = queue;
    currentIndex = index;

    const attrs = track.attributes || {};
    const adamId = track.id;
    trackDurationMs = attrs.durationInMillis || 0;

    // Update Player UI
    npTitle.textContent = attrs.name || 'Playing';
    npArtist.textContent = attrs.artistName || '—';
    npArt.src = artworkUrl(attrs.artwork?.url, 120);
    npBadge.classList.remove('hidden');
    btnPlay.textContent = '⏸';
    isPlaying = true;
    durTime.textContent = formatTime(trackDurationMs / 1000);
    seekSlider.max = trackDurationMs / 1000;
    seekSlider.value = 0;

    // Highlight active row in table
    document.querySelectorAll('.track-row').forEach(r => r.classList.remove('playing'));

    // MPRIS Desktop Integration (Media Keys & Lock Screen)
    bridge?.mprisUpdate?.({
      title: attrs.name,
      artist: attrs.artistName,
      album: attrs.albumName,
      duration: trackDurationMs * 1000,
      artworkUrl: artworkUrl(attrs.artwork?.url, 600),
      status: 'Playing'
    });

    try {
      // 1. Create playback session in Go engine
      const pbRes = await api('POST', '/api/v1/playback', {
        assetId: adamId,
        capabilities: { lossless: true, hires: true }
      });
      const sess = pbRes?.json;
      if (!sess?.sessionId) throw new Error('Playback session failed');

      // 2. Instruct libvlc to play the ALAC stream directly
      await api('POST', '/api/v1/vlc/load', {
        sessionId: sess.sessionId,
        assetId: adamId,
        startMs: 0
      });

      // 3. Start position poller
      startPollingTime();

      // 4. Preload lyrics
      loadLyrics(adamId);
    } catch (err) {
      console.error('[Kapple Playback Error]', err);
      npTitle.textContent = 'Playback Error';
      btnPlay.textContent = '▶';
      isPlaying = false;
    }
  }

  function startPollingTime() {
    clearInterval(pollInterval);
    pollInterval = setInterval(async () => {
      if (!isPlaying) return;
      try {
        const res = await api('GET', '/api/v1/vlc/time');
        const posMs = res?.json?.timeMs || 0;
        const posSec = posMs / 1000;

        posTime.textContent = formatTime(posSec);
        seekSlider.value = posSec;

        updateLyricsPosition(posMs);
      } catch (_) {}
    }, 500);
  }

  btnPlay.addEventListener('click', async () => {
    if (!currentTrack) return;
    if (isPlaying) {
      await api('POST', '/api/v1/vlc/pause');
      btnPlay.textContent = '▶';
      isPlaying = false;
      bridge?.mprisUpdate?.({ status: 'Paused' });
    } else {
      await api('POST', '/api/v1/vlc/resume');
      btnPlay.textContent = '⏸';
      isPlaying = true;
      bridge?.mprisUpdate?.({ status: 'Playing' });
    }
  });

  btnPrev.addEventListener('click', () => {
    if (currentIndex > 0 && currentQueue[currentIndex - 1]) {
      playTrack(currentQueue[currentIndex - 1], currentQueue, currentIndex - 1);
    }
  });

  btnNext.addEventListener('click', () => {
    if (currentIndex >= 0 && currentIndex < currentQueue.length - 1) {
      playTrack(currentQueue[currentIndex + 1], currentQueue, currentIndex + 1);
    }
  });

  seekSlider.addEventListener('change', async (e) => {
    const sec = parseFloat(e.target.value);
    await api('POST', '/api/v1/vlc/seek', { ms: Math.round(sec * 1000) });
  });

  volSlider.addEventListener('input', async (e) => {
    const vol = parseInt(e.target.value, 10);
    await api('POST', '/api/v1/vlc/volume', { volume: vol });
  });

  // MPRIS Command listener from Linux OS
  bridge?.onMprisCmd?.((cmd) => {
    if (cmd === 'play' || cmd === 'pause' || cmd === 'playpause') btnPlay.click();
    else if (cmd === 'next') btnNext.click();
    else if (cmd === 'previous') btnPrev.click();
  });

  // ── Synced Lyrics Drawer ────────────────────────────────────────────────────

  async function loadLyrics(adamId) {
    lyricsList = [];
    lyricsLines.innerHTML = '<div style="color:var(--fg-subtle);">Loading lyrics...</div>';

    try {
      const res = await api('GET', `/api/v1/lyrics/${adamId}?format=lrc`);
      const raw = res?.json?.lyrics || res?.json?.ttml || '';
      lyricsList = parseLRC(raw);

      lyricsLines.innerHTML = '';
      if (!lyricsList.length) {
        lyricsLines.innerHTML = '<div style="color:var(--fg-subtle);">No lyrics available</div>';
        return;
      }

      lyricsList.forEach((line) => {
        const el = document.createElement('div');
        el.className = 'lyric-line';
        el.textContent = line.text;
        el.addEventListener('click', async () => {
          await api('POST', '/api/v1/vlc/seek', { ms: line.timeMs });
        });
        lyricsLines.appendChild(el);
      });
    } catch (_) {
      lyricsLines.innerHTML = '<div style="color:var(--fg-subtle);">No lyrics found</div>';
    }
  }

  function parseLRC(text) {
    const out = [];
    const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const min = parseInt(m[1], 10);
      const sec = parseInt(m[2], 10);
      const ms = parseInt(m[3].padEnd(3, '0'), 10);
      out.push({ timeMs: min * 60000 + sec * 1000 + ms, text: m[4].trim() });
    }
    return out.sort((a, b) => a.timeMs - b.timeMs);
  }

  function updateLyricsPosition(posMs) {
    if (!lyricsList.length) return;
    let foundIdx = -1;
    for (let i = 0; i < lyricsList.length; i++) {
      if (lyricsList[i].timeMs <= posMs) foundIdx = i;
      else break;
    }

    if (foundIdx !== activeLyricIdx && foundIdx >= 0) {
      activeLyricIdx = foundIdx;
      const all = lyricsLines.children;
      for (let i = 0; i < all.length; i++) {
        all[i].classList.toggle('active', i === activeLyricIdx);
      }
      all[activeLyricIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  btnLyrics.addEventListener('click', () => {
    lyricsDrawer.classList.toggle('hidden');
  });
  btnLyricsClose.addEventListener('click', () => {
    lyricsDrawer.classList.add('hidden');
  });

  // Start app
  checkAuth();
})();
