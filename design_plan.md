# Music Hub — Implemented Product Design Specification

**Document status:** implemented and reconciled with the running UI on 2026-08-11
**Primary audience:** course evaluators
**Product journey:** discover → save → organize → keep listening
**Committed aesthetic:** light-only **Sunwashed Broadcast** (1980s retrofuturism)
**Signature feature:** YouTube and local audio living in one continuous queue
**Implementation constraint:** retain EJS, Bootstrap, current routes, and backend contracts

This document records the implemented design system and its acceptance contract. It does not
require a frontend-framework migration, invented product metrics, stock photography, or changes
to the server API. Where early proposals differed from the delivered interface, the implemented
behavior described here is canonical.

### Implemented refinements after the first redesign pass

- The Library is a compact, viewport-contained three-region workspace with 8px inter-panel
  spacing, independently scrolling regions, a 36rem player cap, and a narrower 18–22rem queue.
- The mix title/count/edit/delete strip spans the full player panel width on desktop and mobile;
  only its contents remain padded.
- The live media instance survives Library ↔ Discover navigation initiated from an active
  playlist. Previous, play/pause, and next remain available in the compact footer player.
- Mobile Queue → Library closes the sheet and restores the same song row and `?song=` identity
  without reloading or resetting playback.
- The brand lockup now reads `MUSIC` plus a notched `HUB` signal tag, with `BROADCAST / MH—01`
  shown only where width permits.
- Empty and no-filter-match queue states provide clear recovery actions, including a mobile
  sheet-to-search handoff with focus moved to the search field.

---

## 1. Critical Current-State Verdict

The original interface was a competent editorial dark theme, but the product had no era, no attitude, and no memorable surface. Its identity depended on restraint alone, and restraint is not a personality.

The redesign moves to **1980s outrun/synthwave retrofuturism**. That direction carries a specific and serious hazard: synthwave is the single most machine-generated aesthetic of the last decade. The default version — indigo-to-magenta gradient wash, a chrome-bevelled headline, a perspective grid receding to a sunset circle, and every element glowing — is instantly recognisable as templated output.

**This plan commits to the era while refusing that template.** The three decisions that make it work:

1. **Saturation is a state, not decoration.** Tinted lift marks what is playing, what is focused, and what just changed. Nothing glows decoratively. In a music application this converts the era's signal colour into functional feedback.
2. **Brutalist structure, sunwashed surface.** The macrostructure is a raw grid with visible structural borders, monospaced readouts, and hard-edged controls — deliberately _not_ the centred hero floating inside generic glass cards.
3. **Broadcast, not album cover.** The reference is 1980s television and studio hardware graphics — channel identifiers, tracking bars, scanlines, engraved switch labels — rather than the Miami-sunset record sleeve.

### What remains valuable and carries over unchanged

- The low-glare listening context, now expressed through warm ivory rather than black.
- The product loop: discover → favorite → add to a mix → play.
- The playlist/player/queue workspace as the core destination.
- Real YouTube thumbnails and user uploads as the only imagery. No decorative stock art.
- Existing Bootstrap accessibility behaviour, EJS rendering, and progressive enhancement.
- **All existing security and backend hardening. The visual redesign must not undo any of it.**
- The information architecture, click-depth budget, accessibility contract, and state matrix from the previous plan. Those are aesthetic-independent and are restated here intact.

---

## 2. Core Vision and Target Audience

### Product purpose

Music Hub is a personal listening room where a user discovers tracks on YouTube, keeps favorites, mixes streamed tracks with uploaded audio, rates songs, organizes playlists, and listens without interrupting the queue while editing it.

### Primary audience

A course evaluator who must understand the product quickly and see evidence of intentional design and engineering. It must still read as a credible repeat-use music tool, not a portfolio case study wrapped around a weak application.

### Success criteria

Within the first 20 seconds an evaluator should understand:

1. YouTube tracks and personal audio share one queue.
2. Search, favorites, and playlists form one connected workflow.
3. The application has a committed visual system, not framework defaults.
4. The authenticated workspace is a working tool, not a demo screen.

Within two clicks after authentication the user can discover music or return to a playlist. All secondary tasks remain within three clicks.

### Experience principles

1. **The queue is the product.** Search, upload, rating, and playlists all feed one visible listening session.
2. **Saturation is a state.** Strong channel colour and tinted lift communicate _playing_, _focused_, and _just changed_. Never ambience.
3. **Structure is visible.** Rules, panel divisions, and monospaced indices carry hierarchy. Effects never compensate for weak layout.
4. **Outcome-led language.** Buttons say what the user gets.
5. **Evidence over claims.** Trust comes from working capabilities, never fabricated social proof.
6. **Motion explains state.** Animation shows what was added, moved, opened, or started.
7. **Mobile is a listening surface.** Critical controls sit in the thumb zone; secondary tasks use sheets.

---

## 3. Committed Aesthetic: Sunwashed Broadcast

A late-night broadcast signal rendered on a functional console. Think a 1984 television music channel's on-screen graphics package, built by someone who cared about legibility:

- warm ivory ground with asymmetric amber, rose, and oxidised-cyan light fields, never a linear gradient wash;
- wide, spaced display type in short uppercase strings, set against dense monospaced metadata;
- ruled panels divided by 1px structural lines; compact glass layers use an 8px edge while signals retain **notched (clipped) corners**;
- magenta and deep teal as opposed signal channels — magenta for YouTube and primary action, teal for local audio, focus, and now-playing;
- fixed scanline and phosphor-bloom texture at very low opacity;
- monospaced track indices, counters, and source identifiers;
- saturated channel lift reserved entirely for active and focused states.

### Explicit visual bans

These are the difference between the era and the template. Violating any one of them collapses the design into generated-synthwave.

- **No perspective grid horizon, sunset disc, palm silhouette, or road vanishing point.** Anywhere. (This bans the _motif_, not the CSS property: `perspective` may be used to give discrete objects depth — see §12.7 — but never to build a receding ground plane or vanishing point.)
- **No chrome-bevelled or gradient-filled display type.**
- **No indigo→magenta or magenta→teal gradient as the identity.** The two signals are opposed channels, never blended into each other.
- **No decorative glow.** If an element glows, it is playing, focused, or has just changed.
- **No glassmorphism as a universal surface.** Blur is reserved for floating shell layers, the player, dialogs/sheets, and a few showcase surfaces; data rows and structural panels remain ruled and flat.
- **No rounded-card monoculture.** Glass uses one restrained 8px edge, controls stay at `2px`, and primary signals retain a clipped corner.
- **No Inter, Roboto, Arial, Helvetica, Open Sans, Geist, or `system-ui`.**
- **No more than two named shadow recipes.**
- **No generic pill buttons.** Pills are reserved for compact status and source labels.
- **No fake waveform, VU meter, spectrum analyser, or equaliser** — the product has no audio-analysis data and must not imply it.
- **No CRT wobble, jitter, or rolling-distortion animation on text.**
- **No animation of width, height, margin, top, or any layout-triggering property.**

### Macrostructure

**Brutalist / Functional**, per the anti-slop macrostructure set: raw grids, monospaced typography, visible structural borders, and hard-edged signal controls. This is the load-bearing anti-template decision — retrofuturist colour on brutalist bones reads as designed; frosted cards around a centred hero would read as generated.

---

## 4. Human Authenticity and Differentiation

### Signature product story

The memorable moment is the **mixed-source queue**. YouTube results and uploaded tracks become peers in one listening flow, and the redesign makes the two sources legible as opposed broadcast channels:

- `YT` on the magenta channel;
- `LOCAL` on the deep-teal channel.

When playback crosses between them, the interface performs a **channel change**: the source identifier swaps with a short vertical displacement, the now-playing rule re-scales from left, and the player bloom shifts hue. Under 360ms, never delaying playback controls. This is the signature micro-interaction and the one place the aesthetic and the product concept are the same idea.

Do not add a visualiser. The product does not analyse audio, and implying otherwise is fabricated capability.

### Authentic proof layer

Working-product evidence beside the homepage action, as one annotated rule rather than three marketing cards:

- `YouTube + local audio`
- `Private per-user library`
- `Ownership paths integration-tested`

Each statement must remain factually true; revise or remove it if the implementation changes.

### Voice

Short, conversational English. "your mix", "keep this track", "open your library" — never "submit", "record", or "entity". No "seamless", "next-generation", "revolutionary", or "all-in-one". The era is in the surface, not the copy: **do not write in 1980s pastiche.** No "RADICAL", no "SYSTEM ONLINE", no fake boot sequences.

---

## 5. Redesign Boundaries

### In scope

Information architecture and navigation priority; homepage, login, registration, discovery/favorites, empty library, and playlist workspace; shared tokens, typography, layout, responsive behaviour, mobile sheets, motion, state feedback, accessibility, and microcopy; restructuring EJS partials and client-side presentation without changing route contracts.

### Outside the first implementation pass

- A frontend-framework migration.
- A new database or server API for presentation.
- Dark mode or a theme toggle. **The system is light-only and committed.**
- AI recommendations or generated playlists.
- Passkeys until the authentication backend supports them.
- Global playback across full-page route navigations.
- Any audio-analysis visualisation.

---

## 6. Information Architecture Blueprint

Unchanged from the previous plan — the IA is correct and aesthetic-independent.

### Model

A **Hierarchical (Tree)** structure. Discovery and playlists are separate primary branches converging in the playlist queue.

```text
Music Hub
├── Public Home                         GLOBAL: brand/home
│   ├── Product proof                  ON-PAGE: how the mixed-source queue works
│   ├── Sign in                        UTILITY: desktop header / mobile auth action
│   └── Create account                 PRIMARY CTA
└── Authenticated workspace
    ├── Discover                       GLOBAL: /favorites
    │   ├── Search results             SAME PAGE
    │   ├── Saved tracks               SAME PAGE
    │   ├── Preview                    DIALOG / SHEET
    │   └── Add to a mix               DIALOG / SHEET
    ├── Library                        GLOBAL: /playlists
    │   ├── Playlist workspace         /playlists/:id
    │   │   ├── Player                 PRIMARY REGION
    │   │   ├── Queue                  PRIMARY REGION / MOBILE SHEET
    │   │   ├── Find tracks            CONTEXTUAL PANEL
    │   │   ├── Add local audio        CONTEXTUAL PANEL / SHEET
    │   │   └── Rename/delete/rate     CONTEXTUAL ACTIONS
    │   └── Create first mix           EMPTY STATE / DIALOG
    └── Account                        UTILITY SHEET
        └── Sign out                   SECONDARY DESTRUCTIVE ACTION
```

### 80/20 navigation

Authenticated global navigation contains only **Discover**, **Library**, and (on mobile) **Queue**. The brand links home. User name and sign-out live in an account sheet.

### Click-depth acceptance

| Goal                         | Maximum depth after authentication |
| ---------------------------- | ---------------------------------: |
| Search for a track           |                            1 click |
| Open a playlist              |                           2 clicks |
| Add a favorite to a playlist |          2 clicks plus one confirm |
| Upload local audio           |            2 clicks plus one panel |
| Rate or remove a queue item  |                           2 clicks |
| Create a playlist            |            1 click plus one dialog |
| Sign out                     |                           2 clicks |

### Navigation behavior by viewport

- **≥1024px:** slim top masthead — brand, Discover, Library, account trigger.
- **768–1023px:** same two paths; playlist selection moves into an offcanvas panel.
- **<768px:** fixed bottom navigation with Discover, Library, Queue. Top bar carries the
  wordmark and account trigger only. A contextual list button in the Library title strip
  opens the mix drawer; it is not global navigation.

### Route compatibility

`/`, `/login`, `/register`, `/favorites`, `/playlists`, `/playlists/:id` are retained. New labels are presentational. Queue is a contextual panel, not a route.

---

## 7. Mobile-First and Adaptive Architecture

### Adaptive states

The delivered layout responds to product state as well as width:

- `data-has-current-song="true|false"` reserves or releases compact-player space.
- `data-source="youtube|local"` swaps channel identity and signal hue **without moving any control**.
- The mobile queue state is owned by Bootstrap Offcanvas rather than a duplicate body flag.
- Search results, empty results, and upstream failure are server-rendered as distinct states.

### Mobile shell

```text
┌──────────────────────────────┐
│ MUSIC  HUB          Account  │  44–52px compact masthead
├──────────────────────────────┤
│                              │
│ Page content                 │
│                              │
├──────────────────────────────┤
│ ▍ NIGHT DRIVE  ◀  ▶/Ⅱ  ▶│  52px complete mini-player, conditional
├──────────────────────────────┤
│ DISCOVER │ LIBRARY │ QUEUE   │  52px bottom navigation
└──────────────────────────────┘
```

- The bottom bar respects `env(safe-area-inset-bottom)`.
- Each tab has an icon, a visible text label, and an active state.
- The active tab uses a 2px deep-teal top rule plus primary text — not a glowing pill.
- Queue is disabled with accessible explanatory text when no playlist is active.
- Main content receives bottom padding equal to mini-player + navigation + safe-area height.

### Sheet architecture

Bootstrap `offcanvas-bottom` is the implementation base for the mobile queue, rating, and
account/sign-out. Playlist selection uses `offcanvas-start`. Add-to-playlist, rename,
create, delete, preview, and destructive confirmation use centered Bootstrap dialogs.

Bottom sheets use the restrained 8px top edge, a visible drag indicator, a heading, an
explicit close button, focus trapping, and `max-block-size: min(82dvh, 720px)`.

### Compound gestures

No custom swipe, long-press, or back gestures are implemented. Every queue action remains
reachable through a visible 44px control and the keyboard, keeping behavior predictable.

### Rating

One score button (`08/10`) opens a rating sheet containing an accessible `input[type="range"]` (0–10, step 1), the numeric value in large display type, endpoint labels `Not for me` / `Essential`, and **Keep this rating** / **Clear rating** actions. The ten-point model is preserved; the row stays compact and the keyboard path stays short.

### Exact fluid tokens

```css
:root {
  --space-fluid-1: clamp(0.5rem, 0.42rem + 0.38vw, 0.75rem);
  --space-fluid-2: clamp(0.75rem, 0.58rem + 0.76vw, 1.25rem);
  --space-fluid-3: clamp(1rem, 0.66rem + 1.52vw, 2rem);
  --space-fluid-4: clamp(1.5rem, 0.82rem + 3.05vw, 3.5rem);
  --page-gutter: clamp(1rem, 0.58rem + 1.9vw, 3rem);
  --tap-min: 2.75rem; /* 44px */
  --mobile-nav-height: 4rem;
  --mini-player-height: 4rem;
}

.player-shell {
  --masthead-height: 3.5rem;
  --mobile-nav-height: 3.25rem;
  --mini-player-height: 3.25rem;
  --player-max-inline: 36rem;
  --player-viewport-inline: 64dvh;
}

button,
[role="button"],
input,
select,
.nav-link,
.queue-action {
  min-block-size: var(--tap-min);
}

@media (max-width: 767.98px) {
  .desktop-primary-nav,
  .desktop-playlist-rail,
  .desktop-queue-panel {
    display: none !important;
  }

  .mobile-bottom-nav {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }
  .mobile-mini-player {
    inset-block-end: calc(
      var(--mobile-nav-height) + env(safe-area-inset-bottom)
    );
  }
  .app-main {
    padding-block-end: calc(
      var(--mobile-nav-height) + var(--mini-player-height) +
        env(safe-area-inset-bottom) + 1rem
    );
  }
  .playlist-workspace {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (min-width: 768px) and (max-width: 1023.98px) {
  .playlist-workspace {
    grid-template-columns: minmax(0, 1.35fr) minmax(19rem, 0.65fr);
  }
  .desktop-playlist-rail {
    display: none;
  }
}
```

### Mobile acceptance

No horizontal scroll at 320px. Bottom navigation and mini-player never overlap content or the keyboard. All targets ≥44×44px. Long titles wrap or truncate without hiding source or overflow controls. Landscape keeps playback visible and lets the queue scroll independently. Screen-reader focus returns to the element that opened a sheet. Autofill and paste remain supported.

---

## 8. Typography System

### Font ecosystem

- **Syncopate** — display only. Extremely wide, generously spaced letterforms; unmistakably retro-technical, and rare enough that it does not read as a stock sci-fi font. Uppercase, short strings, never below `--text-h3`.
- **Chakra Petch** — UI, body copy, navigation, controls, forms, track titles. Angular clipped terminals echo the notched geometry while staying readable at small sizes.
- **Share Tech Mono** — source identifiers, track indices, counters, ratings, timestamps, and proof annotations.

Do not substitute a safer geometric sans. Do not set paragraphs, buttons, or small mobile labels in Syncopate — it is a display face and becomes unreadable below roughly 20px.

### Embed

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Share+Tech+Mono&family=Syncopate:wght@400;700&display=swap"
  rel="stylesheet"
/>
```

Self-host WOFF2 subsets later to remove the third-party dependency.

### Ready-to-code tokens

```css
:root {
  --font-display: "Syncopate", "Arial Narrow", sans-serif;
  --font-ui: "Chakra Petch", "Segoe UI", sans-serif;
  --font-meta: "Share Tech Mono", ui-monospace, monospace;

  --text-xs: clamp(0.72rem, 0.69rem + 0.12vw, 0.78rem);
  --text-sm: clamp(0.84rem, 0.8rem + 0.16vw, 0.92rem);
  --text-body: clamp(0.96rem, 0.91rem + 0.2vw, 1.06rem);
  --text-lead: clamp(1.08rem, 0.98rem + 0.42vw, 1.28rem);
  --text-h3: clamp(1.15rem, 1rem + 0.65vw, 1.5rem);
  --text-h2: clamp(1.4rem, 1.05rem + 1.45vw, 2.2rem);
  --text-h1: clamp(1.35rem, 0.75rem + 3vw, 3.6rem);

  --leading-tight: 1.02;
  --leading-heading: 1.12;
  --leading-body: 1.58;
  --leading-ui: 1.28;

  --tracking-display: 0.02em; /* Syncopate is already wide; do not over-space */
  --tracking-heading: 0.01em;
  --tracking-ui: 0;
  --tracking-label: 0.14em;
}
```

> **Scale note — derived, not copied.** Syncopate's uppercase advance is roughly `0.95em` per glyph, about 40% wider than a normal grotesque. The scale is therefore computed from the longest display line rather than inherited from a conventional ramp:
>
> - Longest display line is 14 characters (`YouTube finds.`).
> - At 320px the available width is `320 − (2 × 16px gutter) = 288px`.
> - Maximum size = `288 / (14 × 0.95) ≈ 21.6px = 1.35rem`, which sets the clamp floor.
> - The ceiling is `3.6rem`, above which a two-word line exceeds the 7-column hero area at 1440px.
>
> **Display strings are capped at two words per line.** An unmodified editorial ramp (`6.5rem` ceiling, three words per line) overflows the viewport at every breakpoint in this face.

### Hierarchy rules

- One `h1` per page.
- Homepage display title: maximum **two words per visual line**, three lines at desktop. Lines must never soft-wrap — each `.display-title__line` clips its child for the reveal animation, and a wrapped line breaks that clip.
- Functional page titles use Syncopate at `--text-h3`; player and queue labels stay in Chakra Petch or Share Tech Mono.
- Body paragraphs: maximum 62 characters per line.
- Form help and error text: minimum `--text-sm`.
- Uppercase only for short metadata labels and display strings. Never uppercase a sentence or a button.
- Track titles use Chakra Petch 600, wrapping to two lines in results and truncating to one in queue rows, with the full title available to assistive technology.

### Loading behavior

`display=swap`, with metric-compatible fallbacks. Font fallback must not shift the bottom navigation or transport controls.

---

## 9. Color, Atmosphere, and Surface System

### Harmony and distribution

**Sunwashed split-complementary harmony** — deep magenta and oxidised teal held in opposition across a warm ivory ramp, with amber used as a small analogue-hardware annotation. The channels are never blended into an identity gradient.

60/30/10 distribution:

- **60% canvas:** warm ivory page background and empty regions.
- **30% surface:** flat ruled panels plus a small number of translucent floating layers.
- **10% signal:** primary action, active source, now-playing, focus, concise feedback.

### Role palette

| Role             | HEX       | Usage                                      |
| ---------------- | --------- | ------------------------------------------ |
| Canvas           | `#FBF6FA` | Body background, warm lilac-cast ivory     |
| Surface          | `#FFFFFF` | Opaque fallback and focused fields         |
| Surface soft     | `#F3EAF4` | Empty media, skeletons, quiet regions      |
| Ink              | `#241733` | Primary text and icons                     |
| Muted ink        | `#5C4B70` | Secondary copy and metadata                |
| Structural rule  | `#E0D2E6` | Borders and dividers **only**              |
| Magenta channel  | `#C6005C` | Primary CTA, YouTube source, active action |
| Magenta pressed  | `#9E0049` | Hover/pressed distinction                  |
| Teal channel     | `#046E7D` | Keyboard focus, local audio, now playing   |
| Amber annotation | `#B4520A` | Folios, proof indices, warm hardware cue   |
| Positive         | `#1B7A4B` | Saved/success state only                   |
| Destructive      | `#B3261E` | Delete/remove/error                        |

Rebind Bootstrap's primary, success, and danger to these roles. Do not use Bootstrap's default blue, green, or red.

### Verified contrast pairs

Measured with the WCAG 2.x relative-luminance formula.

| Foreground / background  |   Ratio | Result |
| ------------------------ | ------: | ------ |
| Ink / canvas             | 15.79:1 | AAA    |
| Ink / surface soft       | 14.36:1 | AAA    |
| Muted ink / canvas       |  7.30:1 | AAA    |
| Muted ink / surface soft |  6.64:1 | AA     |
| Magenta / canvas         |  5.53:1 | AA     |
| Magenta / surface soft   |  5.03:1 | AA     |
| Teal / canvas            |  5.57:1 | AA     |
| Teal / surface soft      |  5.06:1 | AA     |
| White / magenta          |  5.91:1 | AA     |
| White / magenta pressed  |  8.24:1 | AAA    |
| Amber / canvas           |  4.74:1 | AA     |
| Positive / canvas        |  5.00:1 | AA     |
| Destructive / canvas     |  6.12:1 | AA     |

The signal colors pass AA on every surface where text uses them. They are still confined to short labels, controls, focus, source identity, and state feedback; body copy always uses ink or muted ink.

The structural rule is decorative by contract: it never carries text or communicates state alone. Focus, errors, and selection always combine colour with a border, label, icon, or text change.

### Ready-to-code tokens

```css
:root {
  color-scheme: light;

  --color-canvas: #fbf6fa;
  --color-surface: #ffffff;
  --color-surface-soft: #f3eaf4;
  --color-text: #241733;
  --color-text-muted: #5c4b70;
  --color-rule: #e0d2e6;
  --color-signal: #c6005c;
  --color-signal-hover: #9e0049;
  --color-playing: #046e7d;
  --color-sun: #b4520a;
  --color-positive: #1b7a4b;
  --color-danger: #b3261e;

  --glass-fill: rgb(255 255 255 / 0.62);
  --glass-fill-strong: rgb(255 255 255 / 0.82);
  --glass-border: rgb(255 255 255 / 0.85);
  --glass-blur: blur(14px) saturate(1.4);

  --radius-panel: 8px;
  --radius-control: 2px;
  --radius-media: 4px;
  --notch: 0.5rem;

  --shadow-soft: 0 0.5rem 1.75rem rgb(85 40 105 / 0.1);
  --signal-shadow-rgb: 198 0 92;
  --shadow-signal: 4px 4px 0 rgb(var(--signal-shadow-rgb) / 0.24);
}
```

### Atmospheric canvas

Four ambient radial fields — **not a linear gradient**, and positioned so they never form a horizon line:

```css
body {
  position: relative;
  isolation: isolate;
  background-color: var(--color-canvas);
  background-image:
    radial-gradient(circle at 6% 2%, rgb(255 138 61 / 0.2), transparent 32rem),
    radial-gradient(circle at 94% 8%, rgb(198 0 92 / 0.13), transparent 34rem),
    radial-gradient(
      circle at 72% 92%,
      rgb(4 110 125 / 0.11),
      transparent 36rem
    ),
    radial-gradient(
      circle at 22% 78%,
      rgb(178 140 255 / 0.12),
      transparent 30rem
    );
  background-attachment: fixed;
  color: var(--color-text);
}

/* Light scanlines. Fixed, decorative, aria-hidden, non-interactive. */
body::before {
  position: fixed;
  z-index: -1;
  inset: 0;
  content: "";
  pointer-events: none;
  opacity: 0.5;
  background-image: repeating-linear-gradient(
    to bottom,
    rgb(36 23 51 / 0.02) 0 1px,
    transparent 1px 3px
  );
}
```

The field is ambient and fixed. It must never animate, and the scanlines must not reduce text clarity — `1px` lines at 2% opacity over a `3px` period read only across large surfaces.

### Surface recipes

1. **Console panel:** transparent or opaque soft surface, 1px structural rule, 2px radius, no shadow. This remains the default.
2. **Frosted shell:** translucent white, 1px lit border, 14px blur, 8px radius, and `--shadow-soft`. Reserved for the masthead/mobile shell, player, sheets/dialogs, and selected showcase surfaces.
3. **Active signal:** strong channel border plus `--shadow-signal`; the offset hard shadow replaces dark-theme neon bloom.
4. **Pressable control:** transparent or translucent white, 1px rule, 2px radius; primary controls take a magenta fill with white text and a notched bottom-right corner.

### Notched corners

The signature geometry. Applied to primary actions and sheets only — never to every surface.

```css
.action-primary {
  clip-path: polygon(
    0 0,
    100% 0,
    100% calc(100% - var(--notch)),
    calc(100% - var(--notch)) 100%,
    0 100%
  );
}
```

### Interaction states

- **Hover:** `translateY(-2px)` at most, plus a border/background token change.
- **Focus-visible:** 3px **deep-teal** outline at 3px offset. Never removed in favour of shadow alone.
- **Pressed:** `translate(2px, 2px)`, `--shadow-signal` removed.
- **Disabled:** 45% opacity plus `cursor: not-allowed`; label stays legible.
- **Error:** destructive border + icon + inline message.
- **Success/saved:** positive label and icon; never a green fill alone.
- **Playing:** channel left rule, `NOW PLAYING` text, source identifier, a soft tint, and the hard offset signal shadow on the player frame.

---

## 10. Spatial Layout and Page Blueprints

### Global geometry

```css
:root {
  --content-max: 90rem;
  --reading-max: 39rem;
  --masthead-height: 4.5rem;
  --playlist-rail-width: 14rem;
  --queue-width: clamp(18rem, 22vw, 22rem);
}

.page-frame {
  inline-size: min(100% - (2 * var(--page-gutter)), var(--content-max));
  margin-inline: auto;
}

.editorial-grid {
  display: grid;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  column-gap: clamp(1rem, 0.58rem + 1.9vw, 2.5rem);
}
```

Use Bootstrap utilities for small alignment and component behaviour. Use named project classes for macrostructure; do not express the redesign as long `col-*`/spacing/shadow utility strings.

### Global masthead

- 72px on general desktop pages and 52px on general mobile pages; the Library shell
  compacts this to 48px desktop and 44px mobile.
- Left: `MUSIC` with a short signal underline, a notched magenta `HUB` tag, and the
  optional monospaced `BROADCAST / MH—01` identifier above 575px.
- Right: Discover and Library only, then the account trigger.
- Active destination: signal text plus a 2px magenta rule. Not a filled pill.
- Background: strong translucent surface with one bottom structural rule. No large navbar shadow.
- First focusable element: skip link — **Skip to the music**.

### Homepage

A 12-column asymmetric composition. **No centred hero.**

```text
Rows 1–7   Columns 1–7: eyebrow, display headline, lead, CTA cluster
Rows 2–8   Columns 8–12: live queue specimen, offset downward
Row 9      Columns 1–12: annotated proof rule
Rows 11–15 Columns 2–11: numbered "how one queue works" sequence
Footer     Creator links and project identity
```

- Minimum first-screen height `calc(100dvh - var(--masthead-height))`; content may exceed it.
- Headline aligns left and breaks across three lines of **two words each** — `YouTube finds.` / `Your files.` / `One queue.` The full promise sentence lives in the lead directly beneath it, so nothing is lost by shortening the display string.
- The queue specimen is an honest, labelled illustration: one YouTube row, one local row, a now-playing marker, and a channel-handoff annotation. It is captioned **Queue specimen** so it is never mistaken for live data.
- Primary and secondary CTAs sit side by side above 576px and stack below.
- The proof layer is one horizontal ruled annotation with three facts.
- The workflow section uses numbered steps `01 FIND`, `02 KEEP`, `03 MIX` in unequal columns.

### Login and registration

Split editorial at desktop: statement and proof in columns 1–7, a compact frosted form panel in columns 8–12 aligned below the statement baseline. This is one of the few intentional glass surfaces; its internal fields remain hard-edged and ruled. On mobile the form comes first. Errors sit beside their field, with a summary above the form only when multiple fields fail. A full-width slot below the password field is reserved for a future working passkey action and left absent until the backend supports one.

### Discover and favorites

1. Page masthead: `DISCOVER / 01`, the heading **Find something worth keeping**, and the search field.
2. Results render as **full-width track rows**, not a card catalogue.
3. Row anatomy: 96×72 cropped thumbnail → source/meta column → two-line title → preview control → **Keep this track** → **Add to a mix**.
4. Rows are separated by structural rules. Hover changes the row background and nudges the thumbnail 2px. No card lift.
5. Saved tracks begin after a large whitespace break under the offset heading **The ones you kept**.
6. The saved grid uses an irregular first-item span **only when four or more items exist**; smaller collections stay a clean grid.
7. Search, saved, empty, and upstream-error states all preserve masthead height to prevent jumps.

```css
.discover-layout {
  display: grid;
  grid-template-columns: minmax(13rem, 3fr) minmax(0, 9fr);
  gap: var(--space-fluid-4);
  align-items: start;
}
.discover-layout__intro {
  position: sticky;
  top: calc(var(--masthead-height) + var(--space-6));
}
```

Below 1024px, drop sticky positioning and use one column.

### Empty library

- A large display `01` beside **Name your first mix**.
- Supporting copy: **Start with a name. You can pull in YouTube finds or add your own audio next.**
- Primary action: **Create my first mix**.
- A compact three-line sample track list as an explanatory figure — not an empty grey card, and not a giant icon in a circle.

### Playlist workspace

Desktop ≥1024px is a full-height three-column grid:

```css
.playlist-workspace {
  block-size: calc(100dvh - var(--masthead-height));
  display: grid;
  grid-template-columns: var(--playlist-rail-width) minmax(0, 1fr) var(
      --queue-width
    );
  gap: var(--space-2);
  padding: var(--space-2);
  overflow: hidden;
}
.playlist-rail,
.queue-panel,
.player-column {
  min-block-size: 0;
  overflow-y: auto;
  border: 1px solid var(--color-rule);
  border-radius: var(--radius-panel);
}
```

**Playlist rail** — header `YOUR MIXES` plus one 44px add button; each playlist a ruled row with a monospaced two-digit index; the active mix takes the magenta signal rule and a stronger glass fill; drag reorder is accompanied by labelled keyboard move controls.

**Player column** — a sticky, full-width strip owns playlist title, track count, rename,
and a quieter danger-styled delete action. The 16:9 player caps at 36rem and 64dvh-equivalent
width to avoid excess page height. At wide container sizes it sits beside now-playing,
transport, **Find tracks**, and **Add local audio**; on narrower layouts those regions stack.
Upload and search never share the transport bar.

**Queue panel** — sticky header `QUEUE`, count, and a filter/sort trigger that opens a compact panel rather than permanently consuming the header; row anatomy is index → 44px artwork/source tile → title/source → `x/10` rating → remove; the now-playing row takes the channel rule, `NOW PLAYING` text, and a subtle tinted fill. Empty and no-match states remain inside the live list so they also move into the mobile queue sheet. The queue scrolls independently, so the player never moves.

### Modal and sheet composition

Desktop dialog width 28–34rem. One strong title, one-sentence helper text, labelled fields, then actions. Primary action rightmost on desktop, full-width first on mobile. Destructive confirmations name the item: **Delete "Late-night set"?** No nested cards inside dialogs.

### Icon strategy

Bootstrap Icons remain. Every icon must identify a source, reinforce a labelled action, or communicate status. No large decorative music notes in empty states. The bespoke visual language is typographic indices, structural rules, notches, and real thumbnail crops.

---

## 11. Product Voice, CTA, and Trust Blueprint

Unchanged from the previous plan — the voice is correct and era-neutral by design.

### Homepage copy

**Eyebrow** `PERSONAL LISTENING ROOM / 01`
**Headline** `YouTube finds. Your files. One uninterrupted queue.`
**Lead** `Keep what you discover, mix in your own audio, and shape the set without stopping the music.`

Signed out — Primary: **Build my first mix** → `/register`; Secondary: **Open my library** → `/login`; Text link: **See the queue in action** → on-page specimen.
Authenticated — Primary: **Find a track** → `/favorites`; Secondary: **Return to my mixes** → `/playlists`.

"Without stopping the music" refers to in-workspace queue editing and must be revised if that behaviour changes.

### Proof rule

```html
<ul class="proof-rule" aria-label="Working product evidence">
  <li><span aria-hidden="true">01</span> YouTube + local audio</li>
  <li><span aria-hidden="true">02</span> Private per-user library</li>
  <li><span aria-hidden="true">03</span> Ownership paths integration-tested</li>
</ul>
```

Top and bottom structural rules, no card backgrounds, no trust badges or seals.

### Workflow copy

| Step      | Heading                     | Supporting line                                                         |
| --------- | --------------------------- | ----------------------------------------------------------------------- |
| `01 FIND` | **Start with a track**      | Search YouTube from inside your listening room.                         |
| `02 KEEP` | **Hold onto the good ones** | Favorites stay close until you know which mix they belong in.           |
| `03 MIX`  | **Make one queue yours**    | Combine streamed tracks and local audio, then rate and reorder the set. |

### Authentication

**Login** — eyebrow `WELCOME BACK`; heading **Your mixes are where you left them.**; copy **Sign in to keep listening and shaping the queue.**; primary **Open my library**; footer **New here? Build your first mix.**; invalid credentials **That email and password don't match. Try again.**

**Registration** — eyebrow `START A LISTENING ROOM`; heading **Start with one track worth keeping.**; copy **Create your private library, then build the queue from there.**; primary **Build my first mix**; footer **Already have a library? Open it.**; duplicate **That email already has a library. Open it instead.**

### Discover and favorites

Heading **Find something worth keeping** · placeholder **Artist, track, or mood** · action **Find tracks** · loading **Looking through YouTube…** · empty **Nothing matched that search. Try an artist, track, or a broader mood.** · upstream error **YouTube didn't answer this time. Your saved tracks are still here.** · add **Keep this track** · added **Kept** · remove label **Remove "{title}" from saved tracks** · add to playlist **Add to a mix** · preview **Hear a preview** · saved heading **The ones you kept** · none saved **No keepers yet. Search above and hold onto the first good one.**

### Playlist and queue

Empty heading **Name your first mix** · primary **Create my first mix** · create dialog **Name this mix** / field **Mix name** / action **Create this mix** · rename **Give this mix a new name** / **Keep the new name** · delete **Delete this mix** / confirm **Delete "{playlist name}"?** / helper **The playlist and its queue will be removed. Uploaded audio follows the application's existing cleanup policy.** · search module **Find tracks** / **Search YouTube** · upload module **Add local audio** / **Audio file** / **Track title (optional)** / **Add to this mix** · queue empty **Your queue is ready. Find a track and it will appear here, ready to play.** · filter empty **No tracks match that filter.** / **Clear filter** · remove **Remove from this mix** · rating trigger **Rate {title}: {score} out of 10** · **Keep this rating** / **Clear rating**

### Feedback states

Added **Added to "{playlist}".** · favorite **Kept for later.** · upload processing **Checking the audio…** · upload success **Local audio joined the queue.** · rejected **That file doesn't look like supported audio. Try MP3, M4A, OGG, WAV, FLAC, or AAC.** · reorder **New order kept.** (announced via `aria-live="polite"`, no persistent toast) · generic failure **That didn't stick. Try once more.**

### Button language replacements

| Avoid                   | Use                                  |
| ----------------------- | ------------------------------------ |
| Submit                  | Outcome-specific action              |
| Search / Go             | Find tracks / Search YouTube         |
| Save Song               | Keep this track / Add to this mix    |
| Create                  | Create this mix                      |
| Save                    | Keep the new name / Keep this rating |
| Register                | Build my first mix                   |
| Login                   | Open my library                      |
| Add                     | Add to a mix                         |
| Click here / Learn more | See the queue in action              |

---

## 12. Motion and Micro-Interaction System

Motion establishes hierarchy on entry, explains state changes, and preserves spatial context. It never competes with playback.

### Physics tokens

```css
:root {
  --duration-feedback: 140ms;
  --duration-component: 240ms;
  --duration-reveal: 480ms;
  --duration-sheet: 360ms;
  --ease-out-editorial: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out-editorial: cubic-bezier(0.65, 0, 0.35, 1);
}
```

Only `transform` and `opacity` animate. Colour may transition for feedback. Never animate layout dimensions, margins, positioning, shadows, filters, or the background field.

### Homepage load choreography

One orchestrated sequence per navigation: eyebrow at 0ms (`translateY(10px)` → 0); headline lines at 70ms increments (`translateY(105%)` → 0); lead at 220ms; CTA cluster at 290ms; queue specimen at 180ms (`translateX(24px)` → 0); specimen rows at 280ms and 350ms; proof rule at 420ms.

```css
@keyframes reveal-up {
  from {
    opacity: 0;
    transform: translate3d(0, 1rem, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes reveal-line {
  from {
    opacity: 0;
    transform: translate3d(0, 105%, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
@keyframes reveal-side {
  from {
    opacity: 0;
    transform: translate3d(1.5rem, 0, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
```

Do not replay the hero choreography when a modal closes or on history navigation.

### Functional page entry

Two-step reveal only: page masthead at 0ms, primary content region at 80ms. **Never stagger every queue row on load** — long lists would feel slow and delay scanning.

### Track-added confirmation

Insert at final position → animate `translateX(12px)` + opacity over 240ms → briefly show the positive `ADDED` label → announce via `aria-live="polite"` → move focus only if the user's next task is in the queue.

```css
@keyframes queue-item-in {
  from {
    opacity: 0;
    transform: translate3d(0.75rem, 0, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}
.queue-item.is-new {
  animation: queue-item-in var(--duration-component) var(--ease-out-editorial)
    both;
}
```

### Channel handoff — the signature interaction

When playback crosses between YouTube and local audio:

- outgoing source identifier: `translateY(0 → -8px)`, opacity 1 → 0;
- incoming identifier: `translateY(8px → 0)`, opacity 0 → 1;
- the now-playing rule scales from `scaleX(0.35)` to `1` from the left;
- the player's hard offset shadow shifts hue between the magenta and teal channels.

Under 360ms. Never delays the transport controls.

```css
@keyframes source-in {
  from {
    opacity: 0;
    transform: translate3d(0, 0.5rem, 0);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.now-playing-rule::before {
  transform: scaleX(0.35);
  transform-origin: left;
  transition: transform var(--duration-sheet) var(--ease-out-editorial);
}
.now-playing-rule.is-active::before {
  transform: scaleX(1);
}
```

### Buttons and rows

Primary hover `translateY(-2px)` over 140ms; pressed `translate(2px, 2px)`. Result thumbnail hover/focus-within `translateX(2px)` — never a more aggressive scale or crop. Queue rows do not lift; the remove control is revealed by opacity. Saved state crossfades a label — no confetti. Destructive controls never bounce.

### Sheets and dialogs

Mobile sheet enters `translateY(100%) → 0` over 360ms. Desktop dialog enters `translateY(12px)` + opacity over 240ms. Backdrop opacity over 240ms. Closing reverses the direction and restores focus after completion. Bootstrap's focus trap and lifecycle events are preserved; only its transition tokens are overridden.

### Loading

Static skeleton rows with one gentle opacity breath, 0.55 → 0.8. No shimmer sweep, no spinning record.

```css
@keyframes loading-breathe {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 0.8;
  }
}
.loading-shape {
  animation: loading-breathe 1200ms var(--ease-in-out-editorial) infinite;
}
```

### 12.7 Public homepage ambient motion — a bounded exception

Principle 6 states that motion explains state, and §12 otherwise forbids decorative
animation. The public homepage carries one deliberate exception: a drifting field of
compact discs and cassettes behind the hero, plus a heading that types itself.

This is a marketing surface whose job is to be memorable in the first 20 seconds, and
it is the only page in the product where that is true. **The exception does not extend
past the homepage hero.** Discover, Library, and the playlist workspace remain
strictly state-driven.

The exception is valid only while every one of these holds:

| Bound           | Requirement                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Scope           | Inside `.home-hero` only. Never on a functional page, and never over the workflow section or footer.                |
| Semantics       | The field is `aria-hidden="true"` and `pointer-events: none`. It can never receive focus or intercept a click.      |
| Stacking        | Content sits at `z-index: 1`; the field can never overlap a control's hit area.                                     |
| Properties      | Only `transform` and `opacity` animate. No layout properties, and no animated filters or shadows.                   |
| Assets          | Objects are built from CSS gradients and pseudo-elements. **No image, video, or sprite requests.**                  |
| Overflow        | `.home-hero` is `overflow: hidden`, so no object can produce horizontal scroll at any width.                        |
| Density         | Six objects at ≥768px, **two below it**. Each additional animated layer costs compositor work on a mid-range phone. |
| Opacity ceiling | No object exceeds `0.42` opacity — the field must read as atmosphere, never compete with the headline.              |
| Reduced motion  | The field is `display: none` outright. A frozen ring of static discs is clutter, not design.                        |

#### Typewriter heading

The heading types character by character, but the implementation is deliberately not
the conventional one:

- **Per-character `opacity`, never `width`.** The line occupies its final width from
  first paint, so there is no layout shift and no reflow while it animates. The usual
  `width` + `steps()` typewriter fails both.
- **The full text is in the DOM at all times.** `client/js/home.js` only wraps
  characters in spans and sets a structural `--i` index; the cadence lives in CSS as
  `--type-speed`. The `<h1>`'s accessible name is unchanged, so a screen reader
  announces the real heading once rather than watching it assemble.
- **Progressive enhancement.** If the script never runs, the heading is simply
  visible. It is never hidden by default.
- **Mutually exclusive with the line-reveal choreography.** Running both would slide
  each line upward while its characters faded in. The typewriter wins on the homepage.
- Under reduced motion the script exits before doing any work, and CSS forces every
  character visible with no caret.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

All feedback stays understandable without motion, through text, icon, border, and state changes.

---

## 13. Accessibility and Complete State Contract

Accessibility is part of the visual system. Every view meets WCAG 2.2 AA and stays understandable with CSS, animation, images, or JavaScript unavailable.

### Keyboard and focus

- Every action is keyboard reachable in logical DOM order.
- `:focus-visible` uses the 3px deep-teal ring at 3px offset. Never removed without an equivalent replacement.
- Dialogs and sheets move focus to their heading or first useful control, trap focus, and restore focus to the trigger on close.
- A skip link is the first focusable element.
- Result rows are not nested fields of competing links — the title carries one action; secondary controls are siblings.
- Reorder controls expose labels such as `Move "Track title" up`. Drag and swipe are enhancements only.

### Semantics and announcements

- One `h1` per page, sequential heading order.
- `<nav>`, `<main>`, `<aside>`, `<section>`, `<form>`, and Bootstrap dialog semantics used intentionally.
- Icon-only buttons carry an accessible name and a ≥2.75rem hit area.
- `aria-current="page"` on the active navigation item; `aria-current="true"` on the active queue row, alongside visible text.
- Search loading, save confirmation, queue updates, rating confirmation, and recoverable errors use one concise `aria-live="polite"` region.
- Validation errors sit beside their field, linked by `aria-describedby`.
- Scanlines, ambient fields, oversized folio numbers, and structural rules are hidden from assistive technology.

### Media and input

- Thumbnails beside a visible title use empty `alt`.
- Playback state never relies on an icon alone; the accessible label states the action that will occur.
- Time and duration are available as text.
- Upload supports the native file picker; accepted formats and the size limit are stated **before** selection.
- The rating control is a native range with its `x/10` value announced.
- **Autoplay is never introduced.** The user explicitly starts sound.

### Required state matrix

| State                    | Visual contract                                  | Content contract                                    |
| ------------------------ | ------------------------------------------------ | --------------------------------------------------- |
| Default                  | Clear hierarchy and affordance                   | Direct label, no placeholder-only instruction       |
| Hover                    | Small positional or rule change on fine pointers | No information revealed only on hover               |
| Focus-visible            | 3px deep-teal ring at 3px offset                 | Same information and controls as hover              |
| Active/pressed           | 2px displacement, hard shadow removed            | Immediate tactile feedback                          |
| Disabled                 | 45% opacity, legible label                       | Explain the prerequisite nearby                     |
| Loading                  | Stable skeleton                                  | Name what is loading; prevent duplicate submission  |
| Empty                    | Purposeful composition                           | Explain the state, give one best next action        |
| Success                  | Positive rule/label plus persistent result       | Say what changed and where to find it               |
| Recoverable error        | Danger rule, no layout collapse                  | Plain-language cause and a retry path               |
| Destructive confirm      | Focused dialog/sheet                             | Name the item and its permanence                    |
| Offline/upstream failure | Preserve local content                           | Distinguish YouTube failure from the user's library |

Never use toast-only error reporting for form or playback failures.

---

## 14. Implementation Record

The four implementation phases are complete in the current codebase. This record
describes the delivered system rather than a future migration.

### Phase 1 — Shared foundation — complete

- `client/css/style.css` owns the colour, type, spacing, radius, notch, shadow,
  focus, glass, and motion tokens.
- Syncopate, Chakra Petch, and Share Tech Mono are loaded once from the shared head.
- Shared EJS partials own the document head, masthead, mobile navigation, status
  region, dialogs, queue items, and search results.
- Bootstrap consumes the product vocabulary while the ambient field and restrained
  scanline treatment remain CSP-compatible.

### Phase 2 — Surface and component character — complete

- The light-only Sunwashed Broadcast palette, two source channels, notched controls,
  selective glass surfaces, and state-only bloom are applied across all routes.
- Library uses a compact bounded desktop workspace; its mix-title strip spans the
  full panel, while the rail, player, and queue scroll independently where needed.
- The custom `MUSIC` signal-line plus notched `HUB` wordmark supplies a recognizable
  masthead identity without consuming player space.

### Phase 3 — Motion and adaptive interaction — complete

- The responsive shell, mini-player, bottom navigation, playlist drawer, queue and
  rating sheets, coarse-pointer rules, and reduced-motion behavior are implemented.
- The mounted playlist workspace preserves the active media element and playback
  state while moving between Library and Discover, including the mobile queue return
  path. The footer/mini-player exposes previous, play/pause, and next controls.

### Phase 4 — Verification and hardening — ongoing release discipline

- Automated security, route, repository, migration, upload, and playback-identity
  coverage is maintained by the 75-test suite plus lint and format checks.
- The state matrix and viewport/input matrix below remain the manual release checklist
  for real browsers, assistive technology, long content, and device-specific behavior.
- Obsolete styles and duplicate selectors should only be removed after visual parity
  is confirmed.

### Recommended file ownership

| Area                         | Primary location                     | Rule                                                                   |
| ---------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| Tokens and shared components | `client/css/style.css`               | One source of truth                                                    |
| Shared shell/navigation      | `Server/views/partials/*.ejs`        | Reuse across routes; no copied mastheads                               |
| Page composition             | Page-level EJS views                 | Preserve route and data contracts                                      |
| Interaction and state        | `client/js/*.js`                     | Bind to semantic hooks; never generate large HTML strings              |
| Server and persistence       | Existing routes/controllers/services | Change only when a UI requirement cannot use an existing safe contract |

The semantic class vocabulary (`.action-primary`, `.track-row`, `.queue-item`,
`.source-label`) remains the stable contract. Markup changes are reserved for real
structure, accessibility, or behavior needs rather than visual wrappers.

---

## 15. Final Expert Validator Audit

### Critical verdict

Synthwave is the highest-risk aesthetic a generated interface can attempt, and the naive execution is unmistakable. This system passes the bespoke bar because its differentiating decisions are structural rather than decorative: brutalist grid geometry instead of a centred hero; two opposed signal channels instead of a blended gradient; glow demoted from ambience to state; notched corners as the recurring geometric signature; and a display face chosen for width rather than sci-fi association.

**Implemented and reconciled with the running product.** Automated checks cover the
application contracts; the device, visual, and assistive-technology cases below remain
release checks rather than documentation claims.

### Quality-control scorecard

| Gate                          | Result                            | Note                                                                                                          |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Information architecture      | Pass                              | 80/20 navigation and the three-click core path are retained intact                                            |
| Typography                    | Pass                              | Display/UI/meta roles are explicit; the scale is corrected for Syncopate's width                              |
| Colour and contrast           | Pass                              | Every pair measured; magenta's AA-only result is confined to non-body roles                                   |
| Layout                        | Pass                              | Brutalist grid replaces both card-grid defaultism and the synthwave hero                                      |
| Mobile ergonomics             | Pass                              | Bottom navigation, mini-player, sheets, 44px targets                                                          |
| Product voice and trust       | Pass                              | Evidence-based claims, outcome-led actions, no era pastiche in copy                                           |
| Motion                        | Pass                              | Purposeful, bounded, reduced-motion safe                                                                      |
| Human authenticity            | Pass                              | The channel-handoff moment is specific to this product                                                        |
| Anti-slop resistance          | Pass                              | Every default synthwave move is explicitly banned in Section 3                                                |
| Accessibility and full states | Implemented; manual gate retained | Semantic/focus/reduced-motion contracts are in code; real-device and screen-reader checks remain release work |

### Surgical non-negotiables

- Replace the previous palette; do not layer neon over light surfaces.
- Never render a horizon grid, sunset disc, or chrome-gradient headline.
- Glow only ever means playing, focused, or just changed.
- Use `8px` for named glass panels, `2px` for controls, and `4px` for media; notches still articulate primary controls.
- Use only the two named shadow recipes.
- One token source; no hex values, pixel spacing, durations, or easing curves in EJS or JavaScript.
- Backdrop blur appears only on named glass panels, compact player, dialog/sheet, masthead, and showcase surfaces.
- One primary action per section, outcome-oriented.
- Semantic HTML in EJS; JavaScript updates state, it does not own document structure.
- No fabricated usage counts, endorsements, or capability claims — including audio visualisation.
- Animation never delays playback, saving, navigation, form response, or error recovery.

### Anti-slop release gate

A reviewer must answer yes to all of these before sign-off:

- Does it read as a specific sunlit 1980s broadcast console rather than a generic glass template?
- Would it still look deliberate with translucency removed — i.e. does the structure carry the hierarchy?
- Is the mixed-source queue visually central rather than buried?
- Are type, spacing, linework, and colour tokens consistent across every route?
- Is hierarchy achieved through scale, contrast, rhythm, and rules — not containers around everything?
- Are mobile layouts recomposed rather than merely compressed?
- Can every task be completed without hover, gesture, colour perception, or animation?
- Do empty, loading, disabled, success, destructive, and upstream-error states feel designed?
- Is every trust statement demonstrably true?
- Are there no `Submit`, `Click here`, `Learn more`, or vague `Something went wrong` labels?
- Is there any element that glows without being playing, focused, or changed? (Must be **no**.)
- Does decorative motion appear anywhere outside the homepage hero? (Must be **no** — see §12.7.)
- With `prefers-reduced-motion: reduce`, is the homepage completely static and the heading fully legible? (Must be **yes**.)

### Acceptance test matrix

| Dimension | Required cases                                                            |
| --------- | ------------------------------------------------------------------------- |
| Viewports | `320`, `375`, `768`, `1024`, `1440px`; portrait and short landscape       |
| Input     | Keyboard only, touch, mouse, screen reader                                |
| Motion    | Default and `prefers-reduced-motion: reduce`                              |
| Content   | Empty library; one item; 50+ items; very long titles; missing thumbnails  |
| Sources   | YouTube only, local only, alternating mixed queue, one source unavailable |
| Network   | Slow search, empty result, timeout, rejected upload, interrupted save     |
| Account   | Anonymous, authenticated, expired session, validation failure             |
| Theme     | Dark system and light system, while the app remains light-only            |

Keyboard acceptance path: skip to content → create/sign into an account → search → save a result → open Library → enter a playlist → start/pause playback → move through the queue → rate a track → sign out. Focus stays visible and predictable throughout.

### Definition of done

- [x] All routes use the shared shell, tokens, typography, and navigation.
- [x] The mixed-source queue stays continuously reachable and visible in context.
- [x] Shared partials own repeated component markup.
- [x] Mutations use CSRF-protected semantic forms or authenticated fetch requests.
- [x] Empty and no-match queue states provide a direct recovery action.
- [x] Reduced-motion and visible-focus rules are implemented.
- [x] Footer/mini-player transport controls remain available outside the Library view.
- [x] The full 75-test suite is the automated regression baseline.
- [ ] Complete the viewport, real-content, screen-reader, and device matrix before each release.
- [ ] Confirm contrast and keyboard behavior in the deployed production build.
- [ ] Run a final human visual review after any substantial token or layout change.

This is the implemented design specification. Future UI work should preserve the
behavioral boundaries and release gates documented here.
