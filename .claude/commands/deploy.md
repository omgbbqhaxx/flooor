Run the deploy pipeline for this project: clean the output, build, and publish to GitHub Pages.

```bash
rm -rf out && npm run build && npm run gh
```

## Critical copy rules — check before every deploy

- **"every sale feeds the vault"** — NOT "every bid feeds the vault". Sales feed the vault, bids do not. This is a protocol-level distinction and must never be changed.
- All user-facing text must be in **English**. Never write Turkish copy in the UI.
