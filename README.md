# SHATTERED REALMS

A pixel-art 2D platformer that runs in the browser. It uses plain HTML, CSS and JavaScript, with no libraries and no external assets. All art and sound are generated in code.

**Files:** `index.html`, `style.css`, `game.js`, `README.md`

## Controls
- Move: A / D or Arrow keys
- Jump: Space, W or Up (hold for a higher jump)
- Attack: J or X
- Interact / open chests: E (attacking a chest also opens it)
- Pause: Esc, Mute: M
- Mobile: on-screen buttons appear on touch devices

## Play locally
Download the four files into one folder and double-click `index.html`.

## Publish free with GitHub Pages
1. **Get the files:** keep all four files together in one folder.
2. **Create a repository:** sign in at github.com, click **New repository**, name it (e.g. `shattered-realms`), set it to **Public**, and click **Create repository**.
3. **Upload the files:** on the new repo page click **uploading an existing file**, drag in all four files (not a folder containing them), and click **Commit changes**. `index.html` must be at the top level of the repo.
4. **Enable Pages:** go to **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose branch **main** and folder **/ (root)**, then **Save**.
5. **Open your game:** after a minute or two the page shows your link:
   `https://YOUR-USERNAME.github.io/shattered-realms/`
   Share that link with anyone.
6. **Update the game:** edit a file on your computer, then in the repo click **Add file → Upload files** and upload the changed file (same name; it replaces the old one), then **Commit changes**. Pages redeploys in a minute or two. Hard-refresh (Ctrl/Cmd+Shift+R) to see changes. You can also click a file in the repo, then the pencil icon, to edit it online.

All file paths are relative, so the game works in a GitHub Pages subpath.

## Customizing
- Level settings (length, enemies, spikes, gaps): the `LV` array in `game.js`.
- Colours: the `TH` palettes.
- Player feel: constants in `updPlayer()` (jump -5.7, gravity .3, speed 1.7).
- Boss attacks: `updBoss()`.

## Saving
Progress (current level, crystals, stats) and settings are stored in your browser's localStorage. **Continue** resumes from the start of your latest level.
