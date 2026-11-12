# WhatsAppify

1. In `C:\Users\Fabrice\My_Documents\Programming\NodeJs\whatsappify`, run `npm run dev`.
2. Open **http://127.0.0.1:8080**. Write or paste a report and format it with the toolbar.
3. Click **Copy for WhatsApp** or **Copy as Markdown**, then paste into your destination.

Requires Node.js 18 or newer. No install or build step. Alternatively, open `frontend/index.html` using Live Server. This is a local browser app; it has not been deployed.

- **Ctrl+B / Ctrl+I:** bold / italic. **Ctrl+Z:** undo. **Ctrl+Shift+Z / Ctrl+Y:** redo. On Mac, use Command.
- **Enter:** new paragraph; **Shift+Enter:** a new line within a paragraph.
- **Enter** in an empty list item exits the list. **Tab / Shift+Tab** in a list nest / unnest an item. The toolbar has the same controls for phones.
- Pasting inserts plain text. Select the words you want to format afterward.
- The editor fills the available window, with longer reports scrolling inside the writing area. Keyboard shortcuts and WhatsApp formatting notes are under **Tips** in the compact header.
- A draft is saved in this browser's local storage. Clearing browser data removes it. Storage restrictions are shown in the editor status. Clear draft can be undone in the current editing session.
- Markdown retains nested lists. WhatsApp uses standard top-level list markers and indented `•` for nested bullets. Its rendering can vary between WhatsApp clients. Clipboard output is plain text containing the relevant formatting symbols.

All assets are local. There are no analytics, third-party scripts, accounts, or report uploads. The frontend is in `frontend/`; `scripts/dev.mjs` only serves static files on localhost. Stop the server with **Ctrl+C**. To choose another port in PowerShell: `$env:PORT=8081; npm run dev`.

Run focused formatting tests with `npm test`.

## VPS deployment

Deployment files are prepared for your existing Docker + Caddy setup. Open [deploy/README.md](deploy/README.md) for the GitHub push, SSH, pull, build, verification, and rollback steps. For a new domain, Caddy must use **`frontend_whatsappify:80`** on **`caddy_network`**; supply your actual domain and chosen VPS folder. This is prepared for deployment, not verified live.

The Compose YAML parsed successfully, the network/upstream and static file references were checked, and all 10 formatting tests passed using `node --preserve-symlinks --preserve-symlinks-main --test tests/format.test.js` (the flags avoid a local Windows sandbox path-resolution restriction). Docker, Nginx runtime, Caddy, and public HTTPS checks still need the VPS; no local Docker was used.

## Verification

The 10 formatting tests pass. The local browser checks covered both clipboard formats, plain-text paste, inline formatting, numbered lists, nesting and unnesting, paragraph and line breaks, undo and redo, clearing a draft, and restoring a saved draft after refresh. Layouts were checked at 1280px, 390px, and 360px, plus reflow at 640px. There was no horizontal page overflow, supporting text was at least 14px, and the browser reported no console errors. Actual WhatsApp-client rendering and browser zoom at 200% remain unverified.
