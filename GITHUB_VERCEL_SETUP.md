# Farmess — GitHub and Vercel setup

## Current shared status

- Private repository: https://github.com/MAYANK2454-19/farmess
- Default branch: `main`
- The repository has an initial README commit. The app starter is prepared in this ZIP but has not yet been pushed into the remote repository.
- Six contributor issues have been created: https://github.com/MAYANK2454-19/farmess/issues
- Vercel team-access consent has been approved. The Vercel project will be linked after the application source is pushed, so the first deployment builds the real app rather than an empty repository.

## 1. Push the starter into the existing repository

1. Download and extract `farmess-starter.zip`.
2. Open PowerShell in the extracted `farmess` folder.
3. Make sure Node.js 22 or newer is installed.
4. Run:

```powershell
npm install
npm run format
npm run format:check
npm run lint
npm run typecheck
npm run build
```

The local starter did not include a lockfile because dependency installation was blocked by a DNS/network error in the authoring environment. `npm install` creates `package-lock.json`; commit it with the application.

5. Initialize Git and connect to the already-created remote. The remote currently has one README-only commit, so the merge command below preserves the local starter README when the two initial histories meet:

```powershell
git init
git add .
git commit -m "chore: bootstrap Farmess app shell"
git branch -M main
git remote add origin https://github.com/MAYANK2454-19/farmess.git
git fetch origin
git merge origin/main --allow-unrelated-histories --no-edit -X ours
git push -u origin main
```

If Git says the branch is already a repository or the `origin` remote already exists, do not repeat the initialization steps blindly. Check with `git status` and `git remote -v`; keep the existing local history and use the matching fetch/merge/push steps.

## 2. Connect Vercel and deploy

The Vercel team-access approval is complete. After the source push above:

1. Open the Vercel dashboard and choose **Add New → Project** (or let the connected Vercel integration create/link the Git project).
2. Import `MAYANK2454-19/farmess` from GitHub.
3. Select **Next.js**, root directory `.`, and production branch `main`.
4. Keep Preview Deployments enabled. Pull requests / feature branches should receive preview URLs; merges to `main` should update the production deployment.
5. Use the build command `npm run build` and let Vercel detect `npm install`.

No Supabase environment variables are required by this starter shell. Do not enter placeholder or empty secrets. Add real Supabase values only after Prince provisions and reviews the shared project; service-role keys must remain server-only.

## 3. Team workflow

- `main` is the integration branch; do not push feature work directly to it.
- Take one of the six GitHub issues and create its named feature branch from the latest `main`.
- Keep changes focused and open a pull request. Request a reviewer outside your main ownership lane.
- Coordinate shared files before editing them. No schema migration is merged without Prince's review and an RLS test plan.
- Run formatting, lint, typecheck and build before opening a PR.

## 4. Important implementation boundaries

The initial app shell is a starting point, not a complete production service. Authentication, Supabase persistence, source-backed mandi prices, buyer offers, logistics workflows and persistent notifications still need to be implemented. Do not display fabricated market prices, buyer records, provider availability or farmer records as real data. Unknown cost inputs must not be treated as zero, and an incomplete net-return estimate must be labelled incomplete.

## 5. Figma visual QA

The connected Figma MCP account reached its Starter-plan tool-call limit during bootstrap. The initial UI follows the documented Round 2 tokens and screen inventory, but it has not been verified pixel-for-pixel against the original Figma frames. Bhavishya should compare the deployed 1440 px and 390 px screens against the actual frames and attach before/after screenshots to the UI issue. Request frame exports/screenshots if Figma access remains unavailable.
