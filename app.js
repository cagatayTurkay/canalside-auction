/* Community auction — reads entries.md, stores bids in a Google Sheet
   via a Google Apps Script web app (see apps-script/Code.gs). */
(function () {
  "use strict";

  const CFG = Object.assign(
    {
      scriptUrl: "",
      closesAt: "",
      minIncrement: 1,
      maxJump: 0,
      privacyNote: "",
      currency: "GBP",
      locale: "en-GB",
      askForContact: true,
      refreshSeconds: 30,
    },
    window.AUCTION_CONFIG || {}
  );
  const DEMO = !CFG.scriptUrl.trim();
  const DEMO_KEY = "auction-demo-bids";
  const BIDDER_KEY = "auction-bidder";

  const money = new Intl.NumberFormat(CFG.locale, { style: "currency", currency: CFG.currency });
  const fmt = (n) => money.format(n);
  const closesAt = CFG.closesAt ? new Date(CFG.closesAt) : null;
  const isClosed = () => closesAt && Date.now() >= closesAt.getTime();

  let entries = [];
  let bids = [];
  const $ = (sel) => document.querySelector(sel);

  /* ---------------- Markdown parsing ---------------- */

  const FIELD = /^\s*[-*]?\s*(lot|id|starting bid|starting price|start|reserve|donated by|donor|photos?|images?)\s*:\s*(.*)$/i;
  const IMG = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

  function slugify(s) {
    return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  }

  function parseEntries(md) {
    md = md.replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "");
    const page = { title: "", intro: [], entries: [], problems: [] };
    let cur = null;

    for (const line of md.split("\n")) {
      const h2 = /^##\s+(.+?)\s*#*\s*$/.exec(line);
      const h1 = /^#\s+(.+?)\s*#*\s*$/.exec(line);
      if (h2) {
        cur = { title: h2[1], lot: "", start: 0, donor: "", photos: [], body: [] };
        page.entries.push(cur);
        continue;
      }
      if (h1 && !cur) { page.title = h1[1]; continue; }
      if (!cur) { page.intro.push(line); continue; }

      const f = FIELD.exec(line);
      if (f) {
        const key = f[1].toLowerCase(), val = f[2].trim();
        if (key === "lot" || key === "id") cur.lot = val;
        else if (key.startsWith("start") || key === "reserve") cur.start = parseMoney(val);
        else if (key.startsWith("donat") || key === "donor") cur.donor = val;
        else cur.photos.push(...val.split(",").map((s) => s.trim()).filter(Boolean));
        continue;
      }
      // Images written as ![](path) in the description become photos too
      let m, stripped = line;
      IMG.lastIndex = 0;
      while ((m = IMG.exec(line))) cur.photos.push(m[1]);
      stripped = line.replace(IMG, "");
      if (stripped.trim() || !line.trim()) cur.body.push(stripped);
    }

    const seen = new Set();
    page.entries.forEach((e, i) => {
      e.id = e.lot ? "lot-" + slugify(e.lot) : slugify(e.title);
      if (!e.lot) page.problems.push(`“${e.title}” has no Lot number — add a line like “Lot: ${i + 1}”.`);
      if (seen.has(e.id)) page.problems.push(`Two items share the same Lot (“${e.lot || e.title}”). Each Lot must be unique.`);
      seen.add(e.id);
      e.description = e.body.join("\n").trim();
    });
    return page;
  }

  function parseMoney(s) {
    const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
    return isFinite(n) ? n : 0;
  }

  // Small, safe markdown renderer: paragraphs, lists, bold, italic, links.
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function inline(s) {
    return esc(s)
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|mailto:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/(^|\W)_(?!\s)(.+?)_(?=\W|$)/g, "$1<em>$2</em>");
  }
  function renderMarkdown(md) {
    return md.split(/\n\s*\n/).map((block) => {
      const lines = block.split("\n").filter((l) => l.trim());
      if (!lines.length) return "";
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l)))
        return "<ol>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*\d+[.)]\s+/, "")) + "</li>").join("") + "</ol>";
      if (lines.every((l) => /^\s*[-*]\s+/.test(l)))
        return "<ul>" + lines.map((l) => "<li>" + inline(l.replace(/^\s*[-*]\s+/, "")) + "</li>").join("") + "</ul>";
      return "<p>" + lines.map(inline).join("<br>") + "</p>";
    }).join("");
  }

  /* ---------------- Bid storage ---------------- */

  async function loadBids() {
    if (DEMO) {
      try { return JSON.parse(localStorage.getItem(DEMO_KEY) || "[]"); } catch { return []; }
    }
    const res = await fetch(CFG.scriptUrl + (CFG.scriptUrl.includes("?") ? "&" : "?") + "t=" + Date.now());
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Could not load bids");
    return data.bids;
  }

  async function sendBid(bid) {
    if (DEMO) {
      const all = await loadBids();
      const min = minimumBid(bid.item, all);
      if (bid.amount < min) return { ok: false, error: `Someone has already bid. The minimum bid is now ${fmt(min)}.` };
      if (bid.amount > maximumBid(bid.item, all)) return { ok: false, error: `The highest bid allowed right now is ${fmt(maximumBid(bid.item, all))}.` };
      all.push({ time: new Date().toISOString(), item: bid.item, name: bid.name, amount: bid.amount });
      localStorage.setItem(DEMO_KEY, JSON.stringify(all));
      return { ok: true };
    }
    // text/plain avoids a CORS pre-flight request, which Apps Script can't answer
    const res = await fetch(CFG.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(bid),
    });
    return res.json();
  }

  function bidsFor(id, list = bids) {
    return list.filter((b) => b.item === id).sort((a, b) => b.amount - a.amount || a.time.localeCompare(b.time));
  }
  function minimumBid(id, list = bids) {
    const top = bidsFor(id, list)[0];
    const entry = entries.find((e) => e.id === id);
    const start = entry ? entry.start : 0;
    return top ? round2(top.amount + Number(CFG.minIncrement || 0)) : start;
  }
  function maximumBid(id, list = bids) {
    const jump = Number(CFG.maxJump || 0);
    if (jump <= 0) return Infinity;
    const top = bidsFor(id, list)[0];
    const entry = entries.find((e) => e.id === id);
    return round2((top ? top.amount : entry ? entry.start : 0) + jump);
  }
  const round2 = (n) => Math.round(n * 100) / 100;

  /* ---------------- Rendering ---------------- */

  function renderPage(page) {
    if (page.title) { $("#page-title").textContent = page.title; document.title = page.title; }
    $("#intro").innerHTML = renderMarkdown(page.intro.join("\n").trim());
    const notices = [];
    if (DEMO) notices.push(`<div class="notice demo"><strong>Demo mode.</strong> Bids are only saved in this browser. Add your Google Apps Script URL to <code>config.js</code> to go live.</div>`);
    if (page.problems.length)
      notices.push(`<div class="notice warn"><strong>Please check entries.md:</strong><ul>${page.problems.map((p) => `<li>${esc(p)}</li>`).join("")}</ul></div>`);
    $("#notices").innerHTML = notices.join("");
    if (CFG.privacyNote) $("#privacy").textContent = CFG.privacyNote;

    const wrap = $("#items");
    if (!entries.length) { wrap.innerHTML = `<p class="loading">No items yet — add some to entries.md.</p>`; return; }
    wrap.innerHTML = entries.map(cardHtml).join("");
    entries.forEach((e) => {
      const card = document.getElementById(e.id);
      card.querySelector("form").addEventListener("submit", (ev) => onSubmit(ev, e));
      setupGallery(card);
    });
    updateBids();
  }

  function cardHtml(e) {
    const photos = e.photos.length
      ? `<div class="gallery">
           <div class="slides">${e.photos.map((p, i) =>
             `<a href="${esc(p)}" target="_blank" rel="noopener"><img class="backdrop" src="${esc(p)}" alt="" aria-hidden="true" loading="lazy"><img class="photo" src="${esc(p)}" alt="${esc(e.title)} — photo ${i + 1}" loading="lazy"></a>`).join("")}</div>
           ${e.photos.length > 1 ? `<button type="button" class="nav prev" aria-label="Previous photo">‹</button>
             <button type="button" class="nav next" aria-label="Next photo">›</button>
             <div class="dots">${e.photos.map((_, i) => `<span class="${i ? "" : "on"}"></span>`).join("")}</div>` : ""}
         </div>`
      : `<div class="gallery empty"><span>No photo</span></div>`;
    const saved = savedBidder();
    return `
    <article class="card" id="${esc(e.id)}">
      ${photos}
      <div class="body">
        ${e.lot ? `<p class="lot">Lot ${esc(e.lot)}</p>` : ""}
        <h2>${esc(e.title)}</h2>
        ${e.donor ? `<p class="donor">Generously donated by ${esc(e.donor)}</p>` : ""}
        <div class="desc">${renderMarkdown(e.description)}</div>
        <div class="price">
          <span class="label">Current bid</span>
          <span class="amount">–</span>
          <span class="leader"></span>
        </div>
        <form class="bid-form" novalidate>
          <label>Your name
            <input name="name" required maxlength="60" autocomplete="name" value="${esc(saved.name || "")}">
          </label>
          ${CFG.askForContact ? `<label>Email or phone <small>(private)</small>
            <input name="contact" required maxlength="100" autocomplete="email" value="${esc(saved.contact || "")}">
          </label>` : ""}
          <label>Your bid (${esc(money.formatToParts(0).find((p) => p.type === "currency")?.value || CFG.currency)})
            <input name="amount" type="number" inputmode="decimal" step="0.01" min="0" required>
          </label>
          <button type="submit">Place bid</button>
          <p class="msg" role="status"></p>
        </form>
        <details class="history"><summary>Bid history</summary><ol></ol></details>
      </div>
    </article>`;
  }

  function setupGallery(card) {
    const slides = card.querySelector(".slides");
    if (!slides) return;
    const dots = card.querySelectorAll(".dots span");
    const go = (dir) => slides.scrollBy({ left: dir * slides.clientWidth, behavior: "smooth" });
    card.querySelector(".prev")?.addEventListener("click", () => go(-1));
    card.querySelector(".next")?.addEventListener("click", () => go(1));
    slides.addEventListener("scroll", () => {
      const i = Math.round(slides.scrollLeft / slides.clientWidth);
      dots.forEach((d, j) => d.classList.toggle("on", i === j));
    }, { passive: true });
  }

  function updateBids() {
    const closed = isClosed();
    for (const e of entries) {
      const card = document.getElementById(e.id);
      if (!card) continue;
      const list = bidsFor(e.id);
      const top = list[0];
      card.querySelector(".label").textContent = top ? (closed ? "Winning bid" : "Current bid") : "Starting price";
      card.querySelector(".amount").textContent = fmt(top ? top.amount : e.start);
      card.querySelector(".leader").textContent = top
        ? `by ${top.name} · ${list.length} bid${list.length > 1 ? "s" : ""}`
        : closed ? "No bids" : "No bids yet — be the first!";
      const input = card.querySelector('input[name="amount"]');
      const min = minimumBid(e.id);
      input.min = min;
      input.placeholder = `${fmt(min)} or more`;
      card.querySelector(".history").hidden = !list.length;
      card.querySelector(".history ol").innerHTML = list.map((b) =>
        `<li><span>${esc(b.name)}</span><span>${fmt(b.amount)}</span></li>`).join("");
      card.querySelectorAll("form input, form button").forEach((el) => (el.disabled = closed));
      card.classList.toggle("closed", !!closed);
    }
    renderStatus();
  }

  function renderStatus() {
    const el = $("#status");
    if (!closesAt) { el.textContent = ""; return; }
    const when = closesAt.toLocaleString(CFG.locale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
    if (isClosed()) { el.textContent = `Bidding closed on ${when}. Thank you for taking part!`; return; }
    const ms = closesAt - Date.now();
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    const left = d > 0 ? `${d} day${d > 1 ? "s" : ""} ${h} hr` : h > 0 ? `${h} hr ${m} min` : `${Math.max(m, 1)} min`;
    el.textContent = `Bidding closes ${when} (${left} left)`;
  }

  function savedBidder() {
    try { return JSON.parse(localStorage.getItem(BIDDER_KEY) || "{}"); } catch { return {}; }
  }

  async function onSubmit(ev, entry) {
    ev.preventDefault();
    const form = ev.target;
    const msg = form.querySelector(".msg");
    const btn = form.querySelector("button");
    const name = form.name.value.trim();
    const contact = form.contact ? form.contact.value.trim() : "";
    const amount = round2(parseFloat(form.amount.value));
    const say = (text, kind) => { msg.textContent = text; msg.className = "msg " + (kind || ""); };

    if (isClosed()) return say("Sorry, bidding has closed.", "err");
    if (!name) return say("Please enter your name.", "err");
    if (CFG.askForContact && !contact) return say("Please enter an email or phone number so we can contact you if you win.", "err");
    if (!isFinite(amount)) return say("Please enter a bid amount.", "err");

    btn.disabled = true;
    say("Checking the latest bids…");
    try {
      bids = await loadBids();          // make sure we compare against the newest bid
      updateBids();
      const min = minimumBid(entry.id);
      if (amount < min) { btn.disabled = false; return say(`Your bid must be at least ${fmt(min)}.`, "err"); }
      const max = maximumBid(entry.id);
      if (amount > max) { btn.disabled = false; return say(`Bids can go up by at most ${fmt(Number(CFG.maxJump))} at a time, so the highest bid allowed right now is ${fmt(max)}.`, "err"); }
      say("Placing your bid…");
      const res = await sendBid({ item: entry.id, title: entry.title, name, contact, amount, startingBid: entry.start, minIncrement: CFG.minIncrement });
      if (!res.ok) throw new Error(res.error || "Something went wrong.");
      try { localStorage.setItem(BIDDER_KEY, JSON.stringify({ name, contact })); } catch {}
      form.amount.value = "";
      bids = await loadBids();
      updateBids();
      say(`Thank you, ${name}! Your bid of ${fmt(amount)} is in.`, "ok");
    } catch (err) {
      say(err.message || "Could not place the bid. Please try again.", "err");
      try { bids = await loadBids(); updateBids(); } catch {}
    } finally {
      btn.disabled = isClosed();
    }
  }

  /* ---------------- Start ---------------- */

  async function start() {
    try {
      const res = await fetch("entries.md", { cache: "no-cache" });
      if (!res.ok) throw new Error("entries.md not found");
      const page = parseEntries(await res.text());
      entries = page.entries;
      renderPage(page);
    } catch (err) {
      $("#items").innerHTML = `<p class="loading">Could not load the items (${esc(err.message)}). If you opened this file directly from your computer, see the README for how to preview it.</p>`;
      return;
    }
    const refresh = async () => {
      try { bids = await loadBids(); updateBids(); }
      catch (err) { $("#status").textContent = "Could not load the latest bids — retrying shortly."; }
    };
    await refresh();
    setInterval(refresh, Math.max(10, CFG.refreshSeconds) * 1000);
    setInterval(renderStatus, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  }

  // Exposed for testing
  window.__auction = { parseEntries, renderMarkdown };
  start();
})();
