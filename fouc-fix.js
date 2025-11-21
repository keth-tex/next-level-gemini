/**
 * fouc-fix.js
 * Immediate FOUC (Flash of Unstyled Content) prevention.
 * Injects styles to hide the conversation list until sorting is complete.
 */

(function() {
  const style = document.createElement('style');
  style.id = 'gemini-folder-fouc-fix';
  style.textContent = `
        /* 1. Hide main container */
        .conversations-container {
            visibility: hidden;
        }

        /* 1.5 Hide New Folder Button Wrapper */
        #new-folder-button-wrapper {
            display: none !important;
        }

        /* 2. Hide loading spinner */
        infinite-scroller .loading-content-spinner-container, 
        infinite-scroller mat-progress-spinner {
            display: none !important;
        }

        /* 3. Explicitly hide pin icons */
        .pin-icon-container,
        conversation-pin-icon {
            display: none !important;
        }

        /* 4. Prevent scrollbar popping on parent */
        infinite-scroller {
            overflow: hidden !important;
        }
            
        .conversation-items-container {
            /* Force start state of animation */
            grid-template-rows: 0fr !important;
            opacity: 0 !important;
            
            /* Ensure it is a grid, in case Gemini's 'display: block' is applied faster */
            display: grid !important;
        }
    `;
  (document.head || document.documentElement).prepend(style);
})();