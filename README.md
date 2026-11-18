# Community Auction Page

A simple online auction for a community fundraiser.

- **Items** are listed in `entries.md`, a plain text file anyone can edit.
- **Bids** (names and amounts) are saved in a **Google Sheet**.
- The website is **static**, so it runs for free on **GitHub Pages**.

```
index.html        the page (no need to edit)
style.css         colours and layout
app.js            how the page works (no need to edit)
config.js         settings: Google link, closing time, currency
entries.md        ← THE ITEMS. Edit this to add or change lots
images/           ← put item photos here
apps-script/Code.gs   code to paste into Google Sheets
```

---

## 1. Adding or editing items (for anyone)

Open `entries.md`. Each item looks like this:

```markdown
## Hand-stitched patchwork quilt
Lot: 1
Starting bid: 40
Donated by: The Tuesday Sewing Circle
Photos: images/quilt-1.jpg, images/quilt-2.jpg

A double-bed quilt made from upcycled fabric.
Took **three months** to finish!
```

| Line | What it means |
|---|---|
| `## Title` | Starts a new item. Use **two** `#` signs. |
| `Lot:` | A unique number for each item. **Don't change it once bidding has started**, because bids are linked to it. |
| `Starting bid:` | The opening price. A number only, e.g. `25`. |
| `Donated by:` | Optional. |
| `Photos:` | Optional. One or more photos, separated by commas. |
| Everything else | The description. Leave an empty line between paragraphs. `**bold**`, `*italic*`, `- bullet points` and `[links](https://…)` all work. |

To **add an item**, copy an existing block, paste it at the bottom and change the details.

The line at the very top that starts with a single `#` is the page title. The text under it is the introduction.

**Photos:** upload them to the `images` folder. On GitHub, open the folder and choose **Add file → Upload files**. Then list them, e.g. `Photos: images/teapot.jpg`. Phone photos work, but smaller files (under about 1 MB) load faster. You can also use a full web link (`https://…`) to an image.

If something is wrong (for example two items have the same Lot number), a yellow warning box appears at the top of the page.

### Editing on GitHub (no software needed)
1. Open the repository on github.com and click `entries.md`.
2. Click the ✏️ pencil icon (Edit).
3. Make your changes and click **Commit changes**.
4. The live page updates within a minute or two.

---

## 2. Setting up the Google Sheet (once)

1. Create a new Google Sheet (e.g. "Auction bids").
2. In the Sheet, choose **Extensions → Apps Script**.
3. Delete what's in the editor. Paste in the whole contents of `apps-script/Code.gs` and click 💾 **Save**.
   Keep the `/** @OnlyCurrentDoc */` line at the top. It means the script can only touch this one spreadsheet, not your other Google files. When you approve permissions in step 5, Google should ask only about "the current spreadsheet".
4. Optional: set `CLOSES_AT` near the top (e.g. `'2026-12-12 20:00'`) so late bids are refused.
   Check that **Project Settings ⚙️ → Time zone** is your time zone (e.g. London).
5. From the function menu at the top, select `setup` and click **▶ Run**. Google will ask for permission; approve it.
   (You may see "Google hasn't verified this app". Click **Advanced → Go to … (unsafe)**. It is your own script.)
   A **Bids** tab appears in your Sheet.
6. Click **Deploy → New deployment**. Click the ⚙️ gear and choose **Web app**:
   - *Execute as:* **Me**
   - *Who has access:* **Anyone**
7. Click **Deploy** and copy the **Web app URL** (it ends in `/exec`).
8. Paste that URL into `config.js`:
   ```js
   scriptUrl: "https://script.google.com/macros/s/AKfy…/exec",
   ```

> **If you change Code.gs later**, use **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**.
> That keeps the same URL. A "New deployment" would create a different URL.

The **Bids** tab records the time, lot, item name, bidder name, amount and contact details for every bid. Contact details are **never** sent to the web page. To find winners, sort by *Lot ID* and then *Bid* (descending), or filter on each lot.

---

## 3. Publishing on GitHub Pages

1. Create a free account at github.com. Then create a **New repository** (Public), e.g. `canalside-auction`.
2. Click **Add file → Upload files**. Drag in everything from this folder, including the `images` folder, and commit.
3. Go to **Settings → Pages**. Under *Build and deployment*, choose *Deploy from a branch*, then **main** / **(root)**, and click **Save**.
4. After a minute your auction is live at `https://<your-username>.github.io/canalside-auction/`.

---

## Settings (`config.js`)

| Setting | Meaning |
|---|---|
| `scriptUrl` | Your Google Apps Script web app URL. Leave empty for **demo mode**, where bids are saved only in your own browser. Useful for trying it out. |
| `closesAt` | Closing time, e.g. `"2026-12-12T20:00"`. Forms are disabled afterwards. Set the same time in `Code.gs` so the server enforces it too. |
| `maxJump` | The most one bid can raise the price by (default `100`). Stops joke bids like £99,999 that nobody can beat. `0` = no limit. Keep it the same as `MAX_JUMP` in `Code.gs`. |
| `minIncrement` | How much higher than the current bid a new bid must be (default `1`). Keep it the same as `MIN_INCREMENT` in `Code.gs`. |
| `currency`, `locale` | e.g. `"GBP"` / `"en-GB"`, or `"EUR"` / `"en-IE"`. |
| `askForContact` | Ask bidders for an email or phone number (kept private in the Sheet). |
| `privacyNote` | The privacy text shown at the bottom of the page. Edit it to name your group and say when details will be deleted. |
| `refreshSeconds` | How often the page fetches new bids (default 30). |

## Previewing on your own computer

Double-clicking `index.html` won't work, because browsers block reading `entries.md` from your disk. Instead, open a terminal in this folder and run:

```
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Looking after people's data

- Share the Google Sheet **only** with the people running the auction. Anyone who can *edit* the Sheet can also edit the script.
- Consider using a separate Google account for the group, not a personal or work account.
- Once winners have paid and collected, **delete the "Contact (private)" column** (or the whole Bids sheet), as promised in the privacy note.
- Joke bids or fake names: just delete the row in the Sheet and the page corrects itself on its next refresh.

## Good to know

- **Bids are checked twice.** The page checks a bid before sending it. The Google script then checks it again against the very latest bids, one bid at a time, so two people can't win at the same price.
- **This is a community-trust system.** There are no logins, so anyone could type any name. That is normally fine for a local fundraiser. Contact details let you confirm winners, and you can delete silly entries from the Sheet; the page updates automatically.
- **Names and bid amounts are public** on the page. A note in the footer says so.
- Google Apps Script has generous free daily limits, far more than a community auction needs.
