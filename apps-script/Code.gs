/** @OnlyCurrentDoc */
// ↑ Limits this script to THIS spreadsheet only — keep that line.

/**
 * Community auction — Google Sheets backend.
 *
 * Paste this whole file into Extensions → Apps Script of your Google Sheet,
 * then Deploy → New deployment → Web app (Execute as: Me, Who has access: Anyone).
 * Full instructions are in README.md.
 */

// ---- Settings -------------------------------------------------------------
// Must match closesAt in config.js. Leave '' for no closing time.
// Uses the script's time zone (Project Settings → Time zone, e.g. Europe/London).
var CLOSES_AT = '';            // e.g. '2026-12-12 20:00'
var MIN_INCREMENT = 1;         // Must match minIncrement in config.js
var MAX_JUMP = 100;            // Must match maxJump in config.js. Biggest raise allowed in one bid (0 = no limit)
var SHEET_NAME = 'Bids';
// ---------------------------------------------------------------------------

var HEADERS = ['Time', 'Lot ID', 'Item', 'Name', 'Bid', 'Contact (private)'];

function doGet() {
  return json_({ ok: true, bids: readBids_(), closed: isClosed_() });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // one bid at a time, so two people can't both "win" the same price
  } catch (err) {
    return json_({ ok: false, error: 'Lots of bids right now — please try again in a moment.' });
  }
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var item = String(d.item || '').trim();
    var title = clean_(d.title, 120);
    var name = clean_(d.name, 60);
    var contact = clean_(d.contact, 100);
    var amount = Math.round(Number(d.amount) * 100) / 100;
    var start = Math.max(0, Number(d.startingBid) || 0);

    if (isClosed_()) return json_({ ok: false, error: 'Sorry, bidding has closed.' });
    if (!/^[a-z0-9-]{1,80}$/.test(item)) return json_({ ok: false, error: 'Unknown item.' });
    if (!name) return json_({ ok: false, error: 'Please enter your name.' });
    if (!isFinite(amount) || amount <= 0) return json_({ ok: false, error: 'Please enter a valid bid.' });

    var top = 0, hasBids = false;
    readBids_().forEach(function (b) {
      if (b.item === item) { hasBids = true; if (b.amount > top) top = b.amount; }
    });
    var min = hasBids ? Math.round((top + MIN_INCREMENT) * 100) / 100 : start;
    if (amount < min) {
      return json_({ ok: false, error: 'Someone got there first! Your bid must now be at least ' + min.toFixed(2) + '.' });
    }
    if (MAX_JUMP > 0) {
      var max = Math.round(((hasBids ? top : start) + MAX_JUMP) * 100) / 100;
      if (amount > max) {
        return json_({ ok: false, error: 'Bids can go up by at most ' + MAX_JUMP + ' at a time. The highest bid allowed right now is ' + max.toFixed(2) + '.' });
      }
    }

    sheet_().appendRow([new Date(), item, title, name, amount, contact]);
    SpreadsheetApp.flush();
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: 'Server error: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}

function readBids_() {
  var values = sheet_().getDataRange().getValues();
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    if (!r[1]) continue;
    out.push({
      time: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      item: String(r[1]),
      name: String(r[3]),
      amount: Number(r[4])
      // Contact details (column F) are deliberately NOT returned.
    });
  }
  return out;
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function isClosed_() {
  if (!CLOSES_AT) return false;
  var tz = Session.getScriptTimeZone();
  var close = Utilities.parseDate(CLOSES_AT, tz, 'yyyy-MM-dd HH:mm');
  return new Date() >= close;
}

// Strip characters that could turn a cell into a formula, and trim length.
function clean_(s, max) {
  s = String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run this once from the editor to create the Bids sheet and check permissions. */
function setup() {
  sheet_();
  Logger.log('Ready. Bids sheet: ' + SHEET_NAME);
}
