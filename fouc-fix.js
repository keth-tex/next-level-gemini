/**
 * fouc-fix.js
 * Immediate FOUC prevention.
 */
(function() {
  const style = document.createElement('style');
  style.id = 'gemini-folder-fouc-fix';
  style.textContent = `
        /* Der gesamte scrollbare Bereich inkl. Scrollbalken und Spinner 
           wird unsichtbar, bleibt für das Framework aber aktiv. */
        infinite-scroller {
            opacity: 0.001 !important;
            pointer-events: none !important;
        }

        #new-folder-button-wrapper,
        .pin-icon-container,
        conversation-pin-icon {
            display: none !important;
        }
    `;
  (document.head || document.documentElement).prepend(style);
})();