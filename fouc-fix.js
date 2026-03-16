/**
 * fouc-fix.js
 * Immediate FOUC prevention.
 */
(function() {
  const style = document.createElement('style');
  style.id = 'gemini-folder-fouc-fix';
  style.textContent = `
        /* * opacity: 0.001 ist unsichtbar für den Nutzer, gilt aber technisch 
         * als gerendert und triggert IntersectionObserver-Events zuverlässig.
         */
        .conversations-container {
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