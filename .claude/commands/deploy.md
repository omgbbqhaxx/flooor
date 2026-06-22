Run the deploy pipeline for this project: clean the output, build, and publish to GitHub Pages.

```bash
rm -rf out && npm run build && npm run gh
```

## Critical copy rules — check before every deploy

- **"every sale feeds the vault"** — NOT "every bid feeds the vault". Sales feed the vault, bids do not. This is a protocol-level distinction and must never be changed.
- All user-facing text must be in **English**. Never write Turkish copy in the UI.

## Version bump — before every deploy

- Bump the patch number in the footer's "Front-end vX.Y.Z" string (e.g. `v3.0.1` → `v3.0.2`) in `app/page.tsx` and `app/beta/page.tsx` before building. Both files must always show the same version.
- Do not touch `app/genesis/page.tsx`'s version string — it tracks separately.
- Do not bump "Contract v1.0" — that version is independent and only changes when the smart contract itself changes.
