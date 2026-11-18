// ============================================================
//  SETTINGS — the only file you normally need to change
//  besides entries.md
// ============================================================
window.AUCTION_CONFIG = {
  // Paste your Google Apps Script "Web app URL" between the quotes.
  // Leave it empty ("") to try the page in DEMO mode: bids are then
  // stored only in your own browser and nobody else can see them.
  scriptUrl: "https://script.google.com/macros/s/AKfycbxvO3PeQqx-ruAQIv3wKJnzcGeSiEqK9O5ca9sa98OwyTWAYF51sjEslTVRJWinahsdMQ/exec",

  // When bidding closes (UK time). Leave empty ("") for no closing time.
  // Format: "YYYY-MM-DDTHH:MM", for example "2026-12-12T20:00"
  closesAt: "",

  // Each new bid must be at least this much higher than the current bid.
  minIncrement: 1,

  // The most a single bid can raise the price by. Stops joke bids like
  // £99,999 that nobody can beat. Use 0 for no limit.
  // Keep the same as MAX_JUMP in Code.gs.
  maxJump: 1000,

  // Currency used for showing prices.
  currency: "GBP",
  locale: "en-GB",

  // Ask bidders for an email or phone number. It is saved in the Google
  // Sheet so you can contact winners, but it is never shown on the page.
  askForContact: true,

  // Shown under the bid forms. Say who is collecting the details and
  // when they will be deleted.
  privacyNote: "Your name and bid are shown on this page. Your email or phone number is only used to contact you if you win, is seen only by the auction organisers, and will be deleted once the auction is settled.",

  // How often (in seconds) the page checks for new bids.
  refreshSeconds: 30,
};
