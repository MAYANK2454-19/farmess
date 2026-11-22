# Contributing to Farmess

1. Read ARCHITECTURE.md and the relevant UX/Figma source documents before changing a feature.
2. Pick one GitHub issue and create a focused branch from main.
3. Do not push directly to main. Open a pull request and request a review from the relevant lane owner.
4. Before pushing, run npm run format, npm run lint, npm run typecheck, npm test and npm run build.
5. Run `npm ci` after cloning; this installs the local pre-commit hook. The hook automatically formats supported staged files with Prettier and re-stages them before each commit. CI separately checks only files changed in the PR or push; it does not rewrite contributor branches.
6. Coordinate shared files before editing them: package configuration, global CSS, shared layouts, Supabase migrations and generated database types.
7. Never commit secrets, service-role credentials, private farmer information or unverified personal details.
8. Do not fabricate prices, buyers, offers, provider capacity or completed sales. Unknown costs remain unknown; enter zero only when zero is known.
9. State what was tested, what remains incomplete and whether any data is a clearly labelled demo fixture in every PR.
