Run the deploy pipeline for this project: clean the output, build, and publish to GitHub Pages.

```bash
rm -rf out && npm run build && npm run gh
```

## Critical copy rules — check before every deploy

- **"every sale feeds the vault"** — NOT "every bid feeds the vault". Sales feed the vault, bids do not. This is a protocol-level distinction and must never be changed.
- All user-facing text must be in **English**. Never write Turkish copy in the UI.

## Version bump — before every deploy

- Bump the patch number of `FRONTEND_VERSION` in `app/lib/version.ts` (e.g. `3.0.1` → `3.0.2`) before building. It is the single source for the "Front-end vX.Y.Z" string in the shared `Footer.tsx` and in the Robinhood page's own footer; never hardcode the version in a page.
- Do not touch `app/genesis/page.tsx`'s version string — it tracks separately.
- Do not bump "Contract v1.0" — that version is independent and only changes when the smart contract itself changes.
