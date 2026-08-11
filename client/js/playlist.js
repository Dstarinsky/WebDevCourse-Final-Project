// Playlist workspace behaviour: mixed-source player queue, AJAX rate/remove/add,
// search, filter, sort, reorder (keyboard first, drag as enhancement), the mobile
// queue sheet, and the mini-player.
//
// Components are cloned from <template> elements rendered by the same EJS partials
// the server uses, so markup has one definition. Values are written with
// textContent/dataset — never interpolated into HTML strings.
(function () {
  "use strict";

  const app = document.getElementById("playlistApp");
  if (!app) return;

  const MAX_RATING = Number(app.dataset.maxRating) || 10;
  const CSRF_TOKEN = app.dataset.csrf || "";
  const INITIAL_SONG_ID = app.dataset.currentSongId || "";
  const AJAX_HEADERS = {
    "X-Requested-With": "fetch",
    "X-CSRF-Token": CSRF_TOKEN,
  };

  const queueEl = document.getElementById("playlistQueue");
  const playerArea = document.getElementById("playerArea");
  const countBadge = document.getElementById("songCountBadge");
  const mobileCountBadge = document.getElementById("mobileSongCountBadge");
  const queueEmptyState = document.getElementById("queueEmptyState");
  const queueFilterEmpty = document.getElementById("queueFilterEmpty");
  const clearQueueFilter = document.getElementById("clearQueueFilter");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnPlayAll = document.getElementById("btnPlayAll");
  const resultsEl = document.getElementById("ytResults");
  const filterInput = document.getElementById("playlistFilter");
  const sortSelect = document.getElementById("sortSelect");
  const statusRegion = document.getElementById("statusRegion");

  const nowPlaying = document.getElementById("nowPlaying");
  const nowPlayingRule = document.getElementById("nowPlayingRule");
  const nowPlayingSource = document.getElementById("nowPlayingSource");
  const nowPlayingTitle = document.getElementById("nowPlayingTitle");

  const miniPlayerTitle = document.getElementById("miniPlayerTitle");
  const miniPlayerSource = document.getElementById("miniPlayerSource");
  const miniPlayerPrev = document.getElementById("miniPlayerPrev");
  const miniPlayerToggle = document.getElementById("miniPlayerToggle");
  const miniPlayerToggleIcon = document.getElementById("miniPlayerToggleIcon");
  const miniPlayerNext = document.getElementById("miniPlayerNext");

  const queueTemplate = document.getElementById("queueItemTemplate");
  const resultTemplate = document.getElementById("searchResultTemplate");

  let currentItem = null;
  let activeMedia = null;
  let playbackActive = false;
  let ytApiReady = false;
  let pendingVideoId = null;
  let originalOrder = queueEl
    ? Array.from(queueEl.querySelectorAll(".queue-item"))
    : [];

  const formBody = (form) => new URLSearchParams(new FormData(form));
  const visibleItems = () =>
    Array.from(queueEl.querySelectorAll(".queue-item")).filter(
      (el) => !el.hidden,
    );

  /** Announce a change politely; the durable state always remains visible at source. */
  let statusTimer = null;
  function announce(message, isError = false) {
    if (!statusRegion) return;
    statusRegion.textContent = message;
    statusRegion.classList.toggle("status-region--error", isError);
    statusRegion.hidden = false;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusRegion.hidden = true;
    }, 5000);
  }

  /* ---------------- YOUTUBE IFRAME API ---------------- */
  window.onYouTubeIframeAPIReady = function () {
    ytApiReady = true;
    if (pendingVideoId) {
      const id = pendingVideoId;
      pendingVideoId = null;
      mountYouTube(id);
    }
  };
  (function loadYouTubeApi() {
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  })();

  /* ---------------- PLAYER ---------------- */
  function setPlaybackState(isPlaying) {
    playbackActive = isPlaying;
    if (!miniPlayerToggle || !miniPlayerToggleIcon) return;
    miniPlayerToggle.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    miniPlayerToggleIcon.className = `bi ${isPlaying ? "bi-pause-fill" : "bi-play-fill"}`;
  }

  function clearPlayer() {
    if (activeMedia instanceof HTMLMediaElement) activeMedia.pause();
    else if (activeMedia && typeof activeMedia.destroy === "function")
      activeMedia.destroy();
    activeMedia = null;
    setPlaybackState(false);
    playerArea.replaceChildren();
  }

  function mountYouTube(videoId) {
    clearPlayer();
    const mount = document.createElement("div");
    mount.id = "ytmount";
    playerArea.appendChild(mount);
    if (!ytApiReady) {
      pendingVideoId = videoId;
      return;
    }
    activeMedia = new YT.Player("ytmount", {
      videoId,
      playerVars: { autoplay: 1, enablejsapi: 1, rel: 0 },
      events: {
        onReady: () => setPlaybackState(true),
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.ENDED) {
            setPlaybackState(false);
            playNext();
          } else if (e.data === YT.PlayerState.PLAYING) {
            setPlaybackState(true);
          } else if (
            e.data === YT.PlayerState.PAUSED ||
            e.data === YT.PlayerState.CUED
          ) {
            setPlaybackState(false);
          }
        },
      },
    });
  }

  function mountLocal(mediaUrl, title) {
    clearPlayer();
    const wrap = document.createElement("div");
    wrap.className = "player-local";

    const heading = document.createElement("h2");
    heading.className = "player-local__title";
    heading.textContent = title;

    const audio = document.createElement("audio");
    audio.controls = true;
    audio.autoplay = true;
    audio.className = "local-audio";
    audio.src = mediaUrl;
    audio.addEventListener("play", () => setPlaybackState(true));
    audio.addEventListener("pause", () => setPlaybackState(false));
    audio.addEventListener("ended", () => {
      setPlaybackState(false);
      playNext();
    });

    wrap.append(heading, audio);
    playerArea.appendChild(wrap);
    activeMedia = audio;
  }

  function showEmptyState(message) {
    clearPlayer();
    const wrap = document.createElement("div");
    wrap.className = "player-empty";
    const text = document.createElement("p");
    text.className = "mb-0";
    text.textContent = message;
    wrap.appendChild(text);
    playerArea.appendChild(wrap);
  }

  /**
   * The signature micro-interaction: a visible handoff when playback crosses
   * between YouTube and local audio. Source label, artwork, and the now-playing
   * rule change together; control positions never move.
   */
  function updateNowPlaying(item) {
    const isLocal = item.dataset.source === "local";
    const title = item.dataset.title;
    const sourceText = isLocal ? "Local" : "YT";

    document.body.dataset.hasCurrentSong = "true";
    // Drives the channel bloom on the player frame. The two sources are opposed
    // channels — magenta for YouTube, cyan for local — never blended.
    document.body.dataset.source = isLocal ? "local" : "youtube";

    if (nowPlaying) nowPlaying.hidden = false;
    if (nowPlayingTitle) nowPlayingTitle.textContent = title;
    if (nowPlayingSource) {
      nowPlayingSource.textContent = sourceText;
      nowPlayingSource.className = `source-label ${isLocal ? "source-label--local" : "source-label--youtube"}`;
      // Restart the label transition without animating any layout property.
      nowPlayingSource.classList.remove("is-swapping");
      void nowPlayingSource.offsetWidth;
      nowPlayingSource.classList.add("is-swapping");
    }
    if (nowPlayingRule) {
      nowPlayingRule.classList.remove("is-active");
      void nowPlayingRule.offsetWidth;
      nowPlayingRule.classList.add("is-active");
    }

    if (miniPlayerTitle) miniPlayerTitle.textContent = title;
    if (miniPlayerSource) {
      miniPlayerSource.textContent = sourceText;
      miniPlayerSource.className = `source-label ${isLocal ? "source-label--local" : "source-label--youtube"}`;
    }
  }

  function playItem(item) {
    if (!item) return;
    currentItem = item;

    if (item.dataset.source === "local")
      mountLocal(item.dataset.mediaUrl, item.dataset.title);
    else mountYouTube(item.dataset.videoId);

    queueEl.querySelectorAll(".queue-item.playing").forEach((el) => {
      el.classList.remove("playing");
      el.removeAttribute("aria-current");
      const flag = el.querySelector(".now-playing-text");
      if (flag) flag.classList.add("d-none");
    });
    item.classList.add("playing");
    item.setAttribute("aria-current", "true");
    const flag = item.querySelector(".now-playing-text");
    if (flag) flag.classList.remove("d-none");

    item.scrollIntoView({ block: "nearest" });
    const deepLink = new URL(window.location.href);
    deepLink.searchParams.set("song", item.dataset.songId);
    window.history.replaceState(null, "", deepLink);
    updateNowPlaying(item);
    setPlaybackState(true);
    updateTransport();
  }

  function playNext() {
    const items = visibleItems();
    const i = items.indexOf(currentItem);
    if (i > -1 && i < items.length - 1) playItem(items[i + 1]);
    else setPlaybackState(false);
  }

  function playPrev() {
    const items = visibleItems();
    const i = items.indexOf(currentItem);
    if (i > 0) playItem(items[i - 1]);
  }

  function updateTransport() {
    const items = visibleItems();
    const i = items.indexOf(currentItem);
    if (btnPrev) btnPrev.disabled = i <= 0;
    if (btnNext) btnNext.disabled = i < 0 || i >= items.length - 1;
    if (miniPlayerPrev) miniPlayerPrev.disabled = i <= 0;
    if (miniPlayerToggle) miniPlayerToggle.disabled = i < 0;
    if (miniPlayerNext)
      miniPlayerNext.disabled = i < 0 || i >= items.length - 1;
    if (btnPlayAll) btnPlayAll.disabled = items.length === 0;
  }

  function togglePlayback() {
    const items = visibleItems();
    if (!currentItem) {
      if (items.length) playItem(items[0]);
      return;
    }

    if (activeMedia instanceof HTMLMediaElement) {
      if (activeMedia.paused)
        activeMedia.play().catch(() => setPlaybackState(false));
      else activeMedia.pause();
      return;
    }

    if (activeMedia && typeof activeMedia.getPlayerState === "function") {
      if (playbackActive) activeMedia.pauseVideo();
      else activeMedia.playVideo();
      return;
    }

    playItem(currentItem);
  }

  function renumber() {
    let n = 1;
    queueEl.querySelectorAll(".queue-item").forEach((item) => {
      const index = item.querySelector(".queue-index");
      if (index) index.textContent = String(n++).padStart(2, "0");
    });
    const itemCount = queueEl.querySelectorAll(".queue-item").length;
    if (countBadge) countBadge.textContent = itemCount;
    if (mobileCountBadge) mobileCountBadge.textContent = itemCount;
    if (queueEmptyState) queueEmptyState.hidden = itemCount !== 0;
    if (queueFilterEmpty && itemCount === 0) queueFilterEmpty.hidden = true;
  }

  function applyRating(item, rating) {
    item.dataset.rating = rating;
    const trigger = item.querySelector(".js-rate");
    if (!trigger) return;
    trigger.dataset.rating = rating;
    trigger.classList.toggle("is-rated", Number(rating) > 0);
    const label = trigger.querySelector(".rating-value-text");
    if (label) label.textContent = `${rating}/${MAX_RATING}`;
    trigger.setAttribute(
      "aria-label",
      `Rate ${item.dataset.title}: ${rating} out of ${MAX_RATING}`,
    );
  }

  /* ---------------- BUILD A QUEUE ROW FROM THE TEMPLATE ---------------- */
  function buildQueueItem(song) {
    const node = queueTemplate.content.firstElementChild.cloneNode(true);
    const isLocal = song.source === "local";

    Object.assign(node.dataset, {
      songId: song.id,
      source: song.source || "youtube",
      title: song.title,
      rating: song.rating || 0,
      videoId: isLocal ? "" : song.videoId || "",
      mediaUrl: isLocal ? song.mediaUrl || "" : "",
    });

    const titleButton = node.querySelector(".song-title");
    if (titleButton) titleButton.textContent = song.title;

    const art = node.querySelector(".queue-item__art");
    if (art) art.setAttribute("aria-label", `Play ${song.title}`);

    const thumb = node.querySelector(".queue-thumb");
    const localThumb = node.querySelector(".local-thumb");
    if (thumb) {
      thumb.classList.toggle("d-none", isLocal);
      if (song.thumbnailUrl) thumb.src = song.thumbnailUrl;
    }
    if (localThumb) localThumb.classList.toggle("d-none", !isLocal);

    const sourceLabel = node.querySelector(".source-label");
    if (sourceLabel) {
      sourceLabel.textContent = isLocal ? "Local" : "YT";
      sourceLabel.className = `source-label ${isLocal ? "source-label--local" : "source-label--youtube"}`;
    }

    node.querySelectorAll('input[name="songId"]').forEach((input) => {
      input.value = song.id;
    });

    const rateTrigger = node.querySelector(".js-rate");
    if (rateTrigger) {
      rateTrigger.dataset.songId = song.id;
      rateTrigger.dataset.title = song.title;
    }
    const removeBtn = node.querySelector(".queue-remove-btn");
    if (removeBtn)
      removeBtn.setAttribute(
        "aria-label",
        `Remove ${song.title} from this mix`,
      );

    applyRating(node, song.rating || 0);
    return node;
  }

  function appendSong(song) {
    const node = buildQueueItem(song);
    node.classList.add("is-new");
    queueEl.appendChild(node);
    originalOrder.push(node);
    renumber();
    applyFilter();
    updateTransport();
    announce(`“${song.title}” joined the queue.`);
  }

  /* ---------------- QUEUE INTERACTION ---------------- */
  if (queueEl) {
    queueEl.addEventListener("click", (event) => {
      const moduleOpener = event.target.closest("[data-open-library-module]");
      if (moduleOpener) {
        openLibraryModule(
          moduleOpener.dataset.openLibraryModule,
          moduleOpener.dataset.focusTarget,
        );
        return;
      }
      const play = event.target.closest(".play-link");
      if (play) {
        event.preventDefault();
        playItem(play.closest(".queue-item"));
        return;
      }
      const rate = event.target.closest(".js-rate");
      if (rate) openRatingSheet(rate.closest(".queue-item"));
    });

    queueEl.addEventListener("submit", async (event) => {
      const form = event.target;
      if (!form.classList.contains("remove-form")) return;
      event.preventDefault();

      const item = form.closest(".queue-item");
      const items = visibleItems();
      const after = items[items.indexOf(item) + 1];
      const data = await postForm(form);
      if (!data || !data.success) return;

      const wasCurrent = item === currentItem;
      const title = item.dataset.title;
      item.remove();
      originalOrder = originalOrder.filter((el) => el.isConnected);
      renumber();

      if (wasCurrent) {
        currentItem = null;
        const rest = visibleItems();
        const nextUp = after && after.isConnected ? after : rest[0];
        if (nextUp) {
          playItem(nextUp);
        } else {
          showEmptyState(
            "Your queue is quiet. Find a YouTube track or add local audio.",
          );
          if (nowPlaying) nowPlaying.hidden = true;
          document.body.dataset.hasCurrentSong = "false";
        }
      }
      updateTransport();
      announce(`“${title}” removed from this mix.`);
    });
  }

  /** POST a form over fetch. Returns parsed JSON, or null when the request failed. */
  async function postForm(form) {
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: AJAX_HEADERS,
        body: formBody(form),
      });
      if (!response.ok) {
        announce(await readError(response), true);
        return null;
      }
      return await response.json();
    } catch {
      announce("That didn’t stick. Try once more.", true);
      return null;
    }
  }

  async function readError(response) {
    try {
      const body = await response.json();
      return (
        (body.error && body.error.message) ||
        "That didn’t stick. Try once more."
      );
    } catch {
      return "That didn’t stick. Try once more.";
    }
  }

  if (btnNext) btnNext.addEventListener("click", playNext);
  if (btnPrev) btnPrev.addEventListener("click", playPrev);
  if (miniPlayerPrev) miniPlayerPrev.addEventListener("click", playPrev);
  if (miniPlayerToggle)
    miniPlayerToggle.addEventListener("click", togglePlayback);
  if (miniPlayerNext) miniPlayerNext.addEventListener("click", playNext);
  if (btnPlayAll)
    btnPlayAll.addEventListener("click", () => {
      const items = visibleItems();
      if (items.length) playItem(items[0]);
    });

  /* ---------------- RATING SHEET ---------------- */
  const ratingSheetEl = document.getElementById("ratingSheet");
  const ratingForm = document.getElementById("ratingForm");
  const ratingRange = document.getElementById("ratingRange");
  const ratingValueDisplay = document.getElementById("ratingValueDisplay");
  const ratingSongId = document.getElementById("ratingSongId");
  const ratingTrackTitle = document.getElementById("ratingTrackTitle");
  const ratingClear = document.getElementById("ratingClear");
  const ratingSheet = ratingSheetEl
    ? new bootstrap.Offcanvas(ratingSheetEl)
    : null;

  let ratingTarget = null;

  function openRatingSheet(item) {
    if (!ratingSheet || !item) return;
    ratingTarget = item;
    ratingSongId.value = item.dataset.songId;
    ratingRange.value = item.dataset.rating || 0;
    ratingValueDisplay.textContent = ratingRange.value;
    ratingTrackTitle.textContent = item.dataset.title;
    ratingSheet.show();
  }

  if (ratingRange) {
    ratingRange.addEventListener("input", () => {
      ratingValueDisplay.textContent = ratingRange.value;
    });
  }
  if (ratingClear) {
    ratingClear.addEventListener("click", () => {
      ratingRange.value = 0;
      ratingValueDisplay.textContent = "0";
    });
  }
  if (ratingForm) {
    ratingForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = await postForm(ratingForm);
      if (!data || !data.success) return;
      if (ratingTarget) applyRating(ratingTarget, data.rating);
      ratingSheet.hide();
      announce(`Rating kept: ${data.rating} out of ${MAX_RATING}.`);
    });
  }

  /* ---------------- SEARCH ---------------- */
  const searchForm = document.getElementById("ytSearchForm");
  const searchInput = document.getElementById("ytSearchInput");

  if (searchForm) {
    searchForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const query = searchInput.value.trim();
      if (!query) return;
      showSearchSkeleton();
      try {
        const response = await fetch(
          `/api/search?q=${encodeURIComponent(query)}`,
          {
            headers: AJAX_HEADERS,
          },
        );
        if (!response.ok) {
          setResultsMessage(await readError(response));
          return;
        }
        const data = await response.json();
        renderResults(data.results || []);
      } catch {
        setResultsMessage(
          "YouTube didn’t answer this time. Your saved tracks are still here.",
        );
      }
    });
  }

  /** Static skeleton rows with one gentle opacity breath — no shimmer, no spinner. */
  function showSearchSkeleton() {
    resultsEl.replaceChildren();
    announce("Looking through YouTube…");
    for (let i = 0; i < 3; i += 1) {
      const row = document.createElement("div");
      row.className = "skeleton-row";
      const media = document.createElement("div");
      media.className = "loading-shape";
      media.style.height = "4.5rem";
      const text = document.createElement("div");
      text.className = "loading-shape";
      text.style.height = "1.25rem";
      row.append(media, text);
      resultsEl.appendChild(row);
    }
  }

  function setResultsMessage(text) {
    resultsEl.replaceChildren();
    const message = document.createElement("p");
    message.className = "body-copy py-3 mb-0";
    message.textContent = text;
    resultsEl.appendChild(message);
  }

  function renderResults(results) {
    if (!results.length) {
      setResultsMessage(
        "Nothing matched that search. Try an artist, track, or a broader mood.",
      );
      return;
    }
    const fragment = document.createDocumentFragment();
    results.forEach((result) => {
      const node = resultTemplate.content.firstElementChild.cloneNode(true);
      Object.assign(node.dataset, {
        videoId: result.videoId,
        title: result.title,
        thumb: result.thumbnail || "",
      });
      const img = node.querySelector(".result-thumb");
      if (img && result.thumbnail) img.src = result.thumbnail;
      node.querySelector(".result-title").textContent = result.title;
      node.querySelector('input[name="videoId"]').value = result.videoId;
      node.querySelector('input[name="title"]').value = result.title;
      node.querySelector('input[name="thumbnailUrl"]').value =
        result.thumbnail || "";
      fragment.appendChild(node);
    });
    resultsEl.replaceChildren(fragment);
    announce(
      `${results.length} result${results.length === 1 ? "" : "s"} found.`,
    );
  }

  function markAdded(button) {
    button.disabled = true;
    button.textContent = "Added";
  }

  if (resultsEl) {
    resultsEl.addEventListener("submit", async (event) => {
      const form = event.target.closest(".yt-add-form");
      if (!form) return;
      event.preventDefault();
      const button = form.querySelector("button");
      if (button) button.disabled = true;
      const data = await postForm(form);
      if (data && data.success) {
        appendSong(data.song);
        if (button) markAdded(button);
      } else if (button) {
        button.disabled = false;
      }
    });
  }

  /* ---------------- FILTER ---------------- */
  function applyFilter() {
    if (!filterInput) return;
    const needle = filterInput.value.trim().toLowerCase();
    const items = Array.from(queueEl.querySelectorAll(".queue-item"));
    items.forEach((item) => {
      item.hidden = !(item.dataset.title || "").toLowerCase().includes(needle);
    });
    if (queueFilterEmpty) {
      queueFilterEmpty.hidden =
        !needle || items.length === 0 || items.some((item) => !item.hidden);
    }
    updateTransport();
  }
  if (filterInput) filterInput.addEventListener("input", applyFilter);
  if (clearQueueFilter) {
    clearQueueFilter.addEventListener("click", () => {
      filterInput.value = "";
      applyFilter();
      filterInput.focus();
    });
  }

  /* ---------------- SORT ---------------- */
  if (sortSelect) {
    sortSelect.addEventListener("change", function () {
      const items = Array.from(queueEl.querySelectorAll(".queue-item"));
      let sorted;
      if (this.value === "name_asc") {
        sorted = items
          .slice()
          .sort((a, b) =>
            (a.dataset.title || "").localeCompare(b.dataset.title || ""),
          );
      } else if (this.value === "rating_desc") {
        sorted = items
          .slice()
          .sort(
            (a, b) =>
              (Number(b.dataset.rating) || 0) - (Number(a.dataset.rating) || 0),
          );
      } else {
        sorted = originalOrder.filter((el) => el.isConnected);
      }
      sorted.forEach((el) => queueEl.appendChild(el));
      renumber();
      updateTransport();
    });
  }

  /* ---------------- MOBILE QUEUE SHEET ---------------- */
  // The live list is MOVED into the sheet, never duplicated, so there is only ever
  // one set of queue rows in the document.
  const queueSheetEl = document.getElementById("queueSheet");
  const queueSheetBody = document.getElementById("queueSheetBody");
  const queuePanel = document.querySelector(".queue-panel");
  if (queueSheetEl && queueSheetBody && queueEl && queuePanel) {
    queueSheetEl.addEventListener("show.bs.offcanvas", () =>
      queueSheetBody.appendChild(queueEl),
    );
    queueSheetEl.addEventListener("hidden.bs.offcanvas", () =>
      queuePanel.appendChild(queueEl),
    );
  }

  function openLibraryModule(targetSelector, focusSelector) {
    const target = document.querySelector(targetSelector);
    if (!target) return;

    const revealModule = () => {
      const collapse = bootstrap.Collapse.getOrCreateInstance(target, {
        toggle: false,
      });
      collapse.show();
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });

      const focusTarget = focusSelector
        ? document.querySelector(focusSelector)
        : null;
      if (!focusTarget) return;
      if (target.classList.contains("show")) focusTarget.focus();
      else
        target.addEventListener(
          "shown.bs.collapse",
          () => focusTarget.focus(),
          { once: true },
        );
    };

    if (queueSheetEl && queueSheetEl.classList.contains("show")) {
      queueSheetEl.addEventListener("hidden.bs.offcanvas", revealModule, {
        once: true,
      });
      bootstrap.Offcanvas.getOrCreateInstance(queueSheetEl).hide();
    } else {
      revealModule();
    }
  }

  /* ---------------- REORDER: KEYBOARD FIRST, DRAG AS ENHANCEMENT ---------------- */
  const sortable = document.getElementById("playlist-sortable");

  async function saveNewOrder() {
    if (!sortable) return;
    const order = Array.from(sortable.querySelectorAll(".playlist-item")).map(
      (i) => i.dataset.id,
    );
    try {
      const response = await fetch("/playlists/reorder", {
        method: "POST",
        headers: { ...AJAX_HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      if (!response.ok) announce(await readError(response), true);
      else announce("New order kept.");
    } catch {
      announce("That didn’t stick. Try once more.", true);
    }
  }

  if (sortable) {
    sortable.addEventListener("click", (event) => {
      const up = event.target.closest(".js-move-up");
      const down = event.target.closest(".js-move-down");
      if (!up && !down) return;

      const row = (up || down).closest(".playlist-item");
      if (up && row.previousElementSibling) {
        row.parentElement.insertBefore(row, row.previousElementSibling);
      } else if (down && row.nextElementSibling) {
        row.parentElement.insertBefore(row.nextElementSibling, row);
      } else {
        return;
      }
      // Keep focus on the control the user just pressed.
      (up || down).focus();
      saveNewOrder();
    });

    sortable.querySelectorAll(".playlist-item").forEach((item) => {
      item.addEventListener("dragstart", () => {
        item.classList.add("dragging");
        sortable.classList.add("dragging-active");
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        sortable.classList.remove("dragging-active");
        saveNewOrder();
      });
    });

    sortable.addEventListener("dragover", (event) => {
      event.preventDefault();
      const dragging = sortable.querySelector(".dragging");
      if (!dragging) return;
      const after = dragAfterElement(sortable, event.clientY);
      if (after == null) dragging.parentElement.appendChild(dragging);
      else after.parentElement.insertBefore(dragging, after);
    });
  }

  /* ---------------- QUEUE REORDER (DRAG) ---------------- */
  if (queueEl) {
    queueEl.addEventListener("dragstart", (event) => {
      const item = event.target.closest(".queue-item");
      if (item) {
        item.classList.add("dragging");
        queueEl.classList.add("dragging-active");
      }
    });
    queueEl.addEventListener("dragend", (event) => {
      const item = event.target.closest(".queue-item");
      if (item) {
        item.classList.remove("dragging");
        queueEl.classList.remove("dragging-active");
        renumber();
        updateTransport();
      }
    });
    queueEl.addEventListener("dragover", (event) => {
      event.preventDefault();
      const dragging = queueEl.querySelector(".dragging");
      if (!dragging) return;
      const after = dragAfterElement(
        queueEl,
        event.clientY,
        ".queue-item:not(.dragging)",
      );
      if (after == null) queueEl.appendChild(dragging);
      else queueEl.insertBefore(dragging, after);
    });
  }

  function dragAfterElement(
    container,
    y,
    selector = ".playlist-item:not(.dragging)",
  ) {
    const candidates = [...container.querySelectorAll(selector)];
    return candidates.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        return offset < 0 && offset > closest.offset
          ? { offset, element: child }
          : closest;
      },
      { offset: Number.NEGATIVE_INFINITY },
    ).element;
  }

  /* ---------------- INITIAL STATE ---------------- */
  renumber();
  if (INITIAL_SONG_ID) {
    currentItem = queueEl.querySelector(
      `.queue-item[data-song-id="${CSS.escape(INITIAL_SONG_ID)}"]`,
    );
    if (currentItem) {
      currentItem.classList.add("playing");
      updateNowPlaying(currentItem);
    }
  }
  updateTransport();
  /* ---------------- SPA TRANSITION TO DISCOVER ---------------- */
  const originalPath = window.location.pathname;

  document.body.addEventListener("click", async (event) => {
    const link = event.target.closest("a");
    if (!link || link.origin !== window.location.origin) return;

    if (link.getAttribute("href") === "/favorites") {
      event.preventDefault();

      const workspace = document.querySelector(".playlist-workspace");
      if (workspace) workspace.hidden = true;

      document.body.classList.add("spa-discover-active");

      let discoverEl = document.getElementById("discover-spa-container");
      if (!discoverEl) {
        discoverEl = document.createElement("div");
        discoverEl.id = "discover-spa-container";
        const masthead = document.querySelector(".masthead");
        if (masthead) masthead.insertAdjacentElement("afterend", discoverEl);
        else document.body.prepend(discoverEl);

        announce("Loading Discover...");
        try {
          const res = await fetch("/favorites");
          const html = await res.text();
          const doc = new DOMParser().parseFromString(html, "text/html");

          const mainContent = doc.querySelector("#main-content");
          if (mainContent) discoverEl.appendChild(mainContent);

          const modals = doc.querySelectorAll(".modal");
          modals.forEach((m) => discoverEl.appendChild(m));

          const favApp = doc.querySelector("#favoritesApp");
          if (favApp) discoverEl.appendChild(favApp);

          if (!document.querySelector('script[src="/js/favorites.js"]')) {
            const script = document.createElement("script");
            script.src = "/js/favorites.js";
            document.body.appendChild(script);
          }
        } catch {
          announce("Could not load Discover.", true);
          return;
        }
      } else {
        discoverEl.hidden = false;
      }

      document
        .querySelectorAll('a[href="/favorites"]')
        .forEach((n) => n.setAttribute("aria-current", "page"));
      document
        .querySelectorAll('a[href^="/playlists"]')
        .forEach((n) => n.removeAttribute("aria-current"));

      history.pushState({ spa: "discover" }, "", "/favorites");
    }

    if (
      link.getAttribute("href") === "/playlists" ||
      link.getAttribute("href") === originalPath
    ) {
      const workspace = document.querySelector(".playlist-workspace");
      if (!workspace) return;

      // The live player already belongs to this workspace. Reloading /playlists
      // would rebuild it, stop the audio, and reset the selected queue row.
      event.preventDefault();

      const discoverEl = document.getElementById("discover-spa-container");
      if (discoverEl) discoverEl.hidden = true;
      workspace.hidden = false;
      document.body.classList.remove("spa-discover-active");

      const openQueueSheet = document.getElementById("queueSheet");
      if (openQueueSheet && openQueueSheet.classList.contains("show")) {
        bootstrap.Offcanvas.getOrCreateInstance(openQueueSheet).hide();
      }

      document
        .querySelectorAll('a[href="/favorites"]')
        .forEach((node) => node.removeAttribute("aria-current"));
      document
        .querySelectorAll(`a[href="/playlists"], a[href="${originalPath}"]`)
        .forEach((node) => node.setAttribute("aria-current", "page"));

      const libraryUrl = new URL(originalPath, window.location.origin);
      if (currentItem)
        libraryUrl.searchParams.set("song", currentItem.dataset.songId);
      const destination = libraryUrl.pathname + libraryUrl.search;
      if (window.location.pathname + window.location.search !== destination) {
        history.pushState({ spa: "playlist" }, "", destination);
      }
    }
  });

  document.body.addEventListener("submit", async (event) => {
    const discoverEl = document.getElementById("discover-spa-container");
    if (!discoverEl || discoverEl.hidden) return;

    const form = event.target;
    // Intercept any form in Discover (e.g., search) or the modals (e.g., add to mix)
    if (!discoverEl.contains(form) && !form.closest(".modal")) return;

    event.preventDefault();
    announce("Working...");

    try {
      const params = new URLSearchParams();
      for (let i = 0; i < form.elements.length; i++) {
        const el = form.elements[i];
        if (el.name && !el.disabled) {
          if ((el.type === "checkbox" || el.type === "radio") && !el.checked)
            continue;
          params.append(el.name, el.value);
        }
      }

      const method = form.getAttribute("method").toUpperCase();
      let url = form.getAttribute("action");
      let options = {
        method,
        credentials: "same-origin",
        headers: { "X-Requested-With": "fetch" },
      };

      if (method === "GET") {
        url = url.split("?")[0] + "?" + params.toString();
      } else {
        options.body = params.toString();
        options.headers["Content-Type"] = "application/x-www-form-urlencoded";
      }

      const res = await fetch(url, options);
      const contentType = res.headers.get("content-type") || "";
      const html = await res.text();

      if (contentType.includes("application/json")) {
        const data = JSON.parse(html);
        if (data.success && data.addedToPlaylistName) {
          announce(`Added to “${data.addedToPlaylistName}”.`);
        } else if (data.success && data.addedFavorite) {
          // Update visual state for favorite if needed, but for now just clear working
          announce("");
        } else if (data.success && data.removedFavorite) {
          announce("");
        } else {
          announce("");
        }

        const modalOpen = document.querySelector(".modal.show");
        if (modalOpen) {
          const modalInstance = bootstrap.Modal.getInstance(modalOpen);
          if (modalInstance) modalInstance.hide();
        }
        return;
      }

      const finalUrl = res.url || url;
      const doc = new DOMParser().parseFromString(html, "text/html");

      const newMain = doc.querySelector("#main-content");
      const oldMain = document.querySelector(
        "#discover-spa-container > #main-content",
      );
      if (newMain && oldMain) {
        oldMain.innerHTML = newMain.innerHTML;
      }

      const newSearch = doc.querySelector(
        '#addToPlaylistModal input[name="currentSearch"]',
      );
      if (newSearch) {
        const searchInputs = document.querySelectorAll(
          '.modal input[name="currentSearch"]',
        );
        for (let i = 0; i < searchInputs.length; i++) {
          searchInputs[i].value = newSearch.value;
        }
      }

      const favApp = doc.querySelector("#favoritesApp");
      if (favApp && favApp.dataset.addedPlaylist) {
        announce(`Added to “${favApp.dataset.addedPlaylist}”.`);
      } else {
        announce(""); // clear 'Working...'
      }

      const modalOpen = document.querySelector(".modal.show");
      if (modalOpen) {
        const modalInstance = bootstrap.Modal.getInstance(modalOpen);
        if (modalInstance) modalInstance.hide();
      }

      const parsedUrl = new URL(finalUrl, window.location.origin);
      history.pushState(
        { spa: "discover" },
        "",
        parsedUrl.pathname + parsedUrl.search,
      );
    } catch (err) {
      console.error(err);
      announce(`Error: ${err.message || "Unknown"}`, true);
    }
  });

  window.addEventListener("popstate", () => {
    const discoverEl = document.getElementById("discover-spa-container");
    const workspace = document.querySelector(".playlist-workspace");

    if (window.location.pathname === "/favorites" && discoverEl) {
      discoverEl.hidden = false;
      if (workspace) workspace.hidden = true;
      document.body.classList.add("spa-discover-active");
      document
        .querySelectorAll('a[href="/favorites"]')
        .forEach((n) => n.setAttribute("aria-current", "page"));
      document
        .querySelectorAll('a[href^="/playlists"]')
        .forEach((n) => n.removeAttribute("aria-current"));
    } else if (
      (window.location.pathname === originalPath ||
        window.location.pathname === "/playlists") &&
      workspace
    ) {
      if (discoverEl) discoverEl.hidden = true;
      workspace.hidden = false;
      document.body.classList.remove("spa-discover-active");
      document
        .querySelectorAll('a[href="/favorites"]')
        .forEach((n) => n.removeAttribute("aria-current"));
      document
        .querySelectorAll(`a[href="${window.location.pathname}"]`)
        .forEach((n) => n.setAttribute("aria-current", "page"));
    } else {
      window.location.reload();
    }
  });
})();
