# Verify page

Static pages for `unscratched.app/v/<code>` (verify) and `unscratched.app/a/<manifest hash>` (landlord acknowledgement). No build step: the files in this folder are the site.

## Configure

```sh
cp web/verify/config.example.js web/verify/config.js
```

Fill in the Supabase project URL and anon key. `config.js` is gitignored, so it has to be created on (or uploaded to) the host.

## Host

Serve this folder as the site root on any static host. Asset paths are absolute (`/main.js`, `/verify.css`), so the folder must be the root, not a subpath. Rewrite `/v/*` to `/index.html` (a rewrite, not a redirect, so the code stays in the URL):

- Netlify `_redirects`: `/v/*  /index.html  200`
- Vercel `vercel.json`: `{ "rewrites": [{ "source": "/v/:code*", "destination": "/index.html" }] }`
- Cloudflare Pages `_redirects`: `/v/*  /index.html  200`

Rewrite `/a/*` to `/acknowledge.html` the same way (Netlify and Cloudflare: `/a/*  /acknowledge.html  200`).

`/?code=<code>` and `/acknowledge.html?h=<hash>` work without any rewrite.

## Try it locally

```sh
cd web/verify && python3 -m http.server 8000
# open http://localhost:8000/?code=abcdef012345
```

Lookups need a Supabase project with the `lookup_receipt` RPC; acknowledgements need `acknowledge_report` and `lookup_acknowledgements`.
