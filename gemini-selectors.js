/**
 * gemini-selectors.js
 * Zentrale Ablage aller nativen DOM-Selektoren der Gemini-Website.
 * Bei Layout-Änderungen durch Google müssen die Werte zumeist nur hier angepasst werden.
 */
const GeminiDOM = {
  // === GLOBALE LAYOUT-ELEMENTE ===
  app: 'chat-app',
  sideNav: 'bard-sidenav',
  sideNavContainer: 'bard-sidenav-container',
  sideNavContent: 'bard-sidenav-content',
  mainMenuBtn: 'button[aria-label="Seitenleiste öffnen"], button[data-test-id="side-nav-sparkle-button"], .side-nav-menu-button button',

  // === CHAT-HISTORIE (SIDEBAR) ===
  conversationsContainer: 'conversations-list mat-nav-list',
  conversationItemsContainer: 'gem-nav-list-item[data-test-id="conversation"]',
  conversationTitle: '.title-text',
  chatHistoryScroller: 'expandable-section[storagekey="chats"] .expandable-section-content, .overflow-container infinite-scroller, bard-sidenav infinite-scroller',
  loadingSpinner: '.loading-history-spinner-container, mat-progress-spinner',
  desktopControlsList: 'mat-action-list.desktop-controls',
  topActionList: '.top-action-list',
  emptyStateContainer: '.empty-state-container',
  
  conversationTestId: '[data-test-id="conversation"]',

  // === CHAT-BEREICH (HAUPTFENSTER) ===
  conversationBlock: '.conversation-container',
  queryText: '.query-text',
  queryTextLine: '.query-text-line',
  answerPanel: '.markdown-main-panel',
  hideFromActions: '.hide-from-message-actions',
  pendingRequest: 'pending-request',
  topBarRight: 'top-bar-actions .right-section',
  mathInline: 'span.math-inline[data-math]',

  // === UI / OVERLAYS / TOASTS ===
  confirmButton: 'button[data-test-id="confirm-button"]',
  snackBar: 'mat-snack-bar-container',

  // === ZUSÄTZLICHE ELEMENTE FÜR FOUC / STYLING ===
  searchNavBtn: 'gem-nav-list-item[data-test-id="search-chats-button"]',
  locationFooter: 'location-footer',
  pinIconContainer: '.trailing-icon-container, mat-icon[data-mat-icon-name="push_pin"]',
  conversationPinIcon: 'mat-icon[data-mat-icon-name="push_pin"]',
  sideNavActionButton: 'gem-nav-list-item'
};