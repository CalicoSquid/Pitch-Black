# my quiet world

A quiet persistent nighttime world for an unused screen.

## Netlify

This project is configured for Netlify in `netlify.toml`.

- Build command: `npm run build`
- Publish directory: `dist`
- Node: `22.16.0`

For a Git-connected Netlify site, deploy the repository/root folder as-is; Netlify will install dependencies and build automatically.

For a manual drag-and-drop deployment, run `npm ci && npm run build` locally and upload the generated `dist` folder.
