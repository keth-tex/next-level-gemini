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
        ${GeminiDOM.chatHistoryScroller} {
            opacity: 0.001 !important;
            pointer-events: none !important;
        }

        ${GeminiDOM.sideNavActionButton},
        .side-nav-menu-button,
        ${GeminiDOM.searchNavBtn},
        ${GeminiDOM.topActionList},
        .desktop-controls,
        ${GeminiDOM.locationFooter},
        .gemini-custom-sidebar-btn,
        ${GeminiDOM.pinIconContainer},
        ${GeminiDOM.conversationPinIcon} {
            display: none !important;
        }
    `;
  (document.head || document.documentElement).prepend(style);
})();