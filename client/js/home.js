// Homepage typewriter.
//
// The heading types itself, but the full text is present in the DOM from first
// paint — this script only wraps each character in a span and hands CSS an index.
// That matters for three reasons:
//   1. No layout shift. Animating per-character opacity leaves the line occupying
//      its final width immediately, unlike the usual `width`/`steps()` typewriter.
//   2. The accessible name of the <h1> is unchanged, so screen readers announce
//      the real heading once instead of watching characters appear.
//   3. If this script never runs, the heading is simply visible. Progressive
//      enhancement, not a dependency.
//
// All timing values live in CSS custom properties; nothing visual is hard-coded here.
(function () {
    'use strict';

    const title = document.querySelector('.js-typewriter');
    if (!title) return;

    // Honour the OS setting before doing any work. The stylesheet also neutralises
    // the animation, but there is no reason to build the spans at all.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const lines = Array.from(title.querySelectorAll('.display-title__line > span'));
    if (lines.length === 0) return;

    const styles = getComputedStyle(title);
    const perChar = Number.parseFloat(styles.getPropertyValue('--type-speed')) || 42;

    let index = 0;
    const schedule = [];

    for (const line of lines) {
        const text = line.textContent;
        const startIndex = index;
        const fragment = document.createDocumentFragment();

        for (const character of text) {
            const span = document.createElement('span');
            span.className = 'char';
            // --i is a structural index, not a visual value; the cadence it is
            // multiplied by lives in CSS as --type-speed.
            span.style.setProperty('--i', String(index));
            span.textContent = character;
            fragment.appendChild(span);
            index += 1;
        }

        // Replace the plain text with the per-character spans. textContent is read
        // above and re-inserted as text nodes, so nothing is ever parsed as HTML.
        line.replaceChildren(fragment);

        schedule.push({
            element: line.parentElement,
            startsAt: startIndex * perChar,
            endsAt: index * perChar
        });
    }

    // Move the caret to whichever line is currently being typed, then park it on
    // the last one. Uses class toggles only — the caret itself is a CSS pseudo-element.
    const timers = [];
    schedule.forEach((entry, position) => {
        const isLast = position === schedule.length - 1;

        timers.push(
            setTimeout(() => {
                entry.element.classList.add('is-typing');
            }, entry.startsAt)
        );

        timers.push(
            setTimeout(() => {
                entry.element.classList.remove('is-typing');
                if (isLast) entry.element.classList.add('is-parked');
            }, entry.endsAt)
        );
    });

    // Cancel pending work if the page is being torn down mid-animation.
    window.addEventListener('pagehide', () => {
        timers.forEach(clearTimeout);
    }, { once: true });
}());
