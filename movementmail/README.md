# Movement Mail overlay

Runtime branding and UX patches applied on top of Mailflow for [mail.movementmail.org](https://mail.movementmail.org).

| File | Served as |
|---|---|
| `brand.js` | `/mm-brand.js` |
| `theme.css` | `/mm-theme.css` |
| `manifest.json` | `/mm-manifest.json` (or replace `/manifest.json`) |

When building this fork from source, the same files are also copied into `frontend/public/` and loaded from `frontend/index.html`.

Equivalent About / product-link changes also live in `frontend/src` so a source build does not depend on DOM rewriting alone.
