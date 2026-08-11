// Discover page behaviour: the add-to-a-mix dialog and the preview player.
// Delegated listeners read data-* attributes, so no untrusted metadata is ever
// interpolated into executable JavaScript and the CSP can forbid inline script.
(function () {
    'use strict';

    const addModalEl = document.getElementById('addToPlaylistModal');
    const playModalEl = document.getElementById('playModal');
    const previewIframe = document.getElementById('previewIframe');
    const statusRegion = document.getElementById('statusRegion');
    const appConfig = document.getElementById('favoritesApp');
    if (!addModalEl || !playModalEl) return;

    const addModal = new bootstrap.Modal(addModalEl);
    const playModal = new bootstrap.Modal(playModalEl);

    const existingSelect = document.getElementById('existingSelect');
    const newInput = document.getElementById('newInput');

    let statusTimer = null;
    function announce(message) {
        if (!statusRegion || !message) return;
        statusRegion.textContent = message;
        statusRegion.hidden = false;
        clearTimeout(statusTimer);
        statusTimer = setTimeout(() => { statusRegion.hidden = true; }, 6000);
    }

    // Confirm the redirect-carried result without a persistent toast.
    if (appConfig && appConfig.dataset.addedPlaylist) {
        announce(`Added to “${appConfig.dataset.addedPlaylist}”.`);
    }

    // Choosing an existing mix and naming a new one are mutually exclusive.
    if (newInput && existingSelect) {
        newInput.addEventListener('input', () => {
            if (newInput.value.length > 0) existingSelect.value = '';
        });
        existingSelect.addEventListener('change', () => {
            if (existingSelect.value !== '') newInput.value = '';
        });
    }

    document.addEventListener('click', (event) => {
        const addButton = event.target.closest('.js-add-to-playlist');
        if (addButton) {
            document.getElementById('modalVideoId').value = addButton.dataset.videoId || '';
            document.getElementById('modalTitle').value = addButton.dataset.title || '';
            document.getElementById('modalThumbnail').value = addButton.dataset.thumb || '';
            addModal.show();
            return;
        }

        const previewButton = event.target.closest('.js-preview');
        if (previewButton) {
            const videoId = previewButton.dataset.videoId;
            // Only ever build the URL from an ID that matches YouTube's format.
            if (!/^[A-Za-z0-9_-]{11}$/.test(videoId || '')) return;
            previewIframe.src = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
            playModal.show();
        }
    });

    // Stop playback when the preview closes rather than leaving audio running.
    playModalEl.addEventListener('hidden.bs.modal', () => {
        previewIframe.src = '';
    });
}());
