# Repository workflow

- All project changes must be tracked in Git and pushed to origin after appropriate checks. Keep unrelated user files out of the repository.
- RETEST-*.md files are local-only. Never stage or include them in release assets; do not delete the local copies.
- Maintain CHANGELOG.md for every release. For extension changes update manifest.json, package.json and UI version labels consistently.
- Publish releases to GitHub yourself. Do not stop at a local ZIP: use a version tag vX.Y.Z and attach the packaged extension. Do not move an existing tag or overwrite a published release silently.
- Run npm test and relevant browser checks. No requests to the user's corporate Jira: use mocked data.
- Build the distributable with python scripts/package.py; CI publishes it when a v* tag is pushed.
- Preserve the product name Jira Board Plus. Do not reintroduce company branding, corporate Jira URLs or role-specific naming.
