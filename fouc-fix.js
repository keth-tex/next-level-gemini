// === SOFORTIGER FOUC-FIX ===
(function() {
    const style = document.createElement('style');
    style.id = 'gemini-folder-fouc-fix';
    style.textContent = `
        /* 1. Verstecke den Hauptcontainer (wie gehabt) */
        .conversations-container {
            visibility: hidden;
        }

        /* 2. Verstecke den Lade-Spinner (NEU) */
        infinite-scroller .loading-content-spinner-container, 
        infinite-scroller mat-progress-spinner {
            display: none !important;
        }

        /* 3. Verstecke die Pin-Icons explizit (NEU) */
        .pin-icon-container,
        conversation-pin-icon {
            display: none !important;
        }

        /* 4. Verhindere das "Aufpoppen" des Scrollbalkens im Elternelement (NEU) */
        infinite-scroller {
            overflow: hidden !important;
        }
            
        .conversation-items-container {
            /* Erzwingt den Startzustand der Animation */
            grid-template-rows: 0fr !important;
            opacity: 0 !important;
            
            /* Stellt sicher, dass es ein Grid ist, falls 
               Geminis 'display: block' schneller ist */
            display: grid !important;
        }
    `;
    (document.head || document.documentElement).prepend(style);
})();