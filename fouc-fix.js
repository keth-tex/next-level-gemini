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
        bard-sidenav infinite-scroller,
        .overflow-container infinite-scroller {
            opacity: 0.001 !important;
            pointer-events: none !important;
        }

        side-nav-action-button,
        .side-nav-menu-button,
        search-nav-button,
        .top-action-list,
        .desktop-controls,
        location-footer,
        .gemini-custom-sidebar-btn,
        .pin-icon-container,
        conversation-pin-icon {
            display: none !important;
        }
    `;
  (document.head || document.documentElement).prepend(style);
})();