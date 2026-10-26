# Clotheric welcome promotion

The homepage (`/`) displays a Clotheric promotion once per browser-tab session.
**Continue to OUTPUTTRACER** immediately opens the existing IDE and records
`outputtracer:clotheric-welcome:v1=1` in session storage. If storage is blocked,
the button still works for the current page. No timer, account, or purchase is
required. Project, assignment, assembly, Python and classroom routes are outside
this integration.

**Shop now** opens `https://clotheric.com/` in a separate tab with
`noopener noreferrer sponsored`. It does not add anything to a cart or perform
a purchase. There are no embedded marketplace scripts or new analytics.

The site was inspected at `https://clotheric.com/` on 26 October 2026. Its
ivory/gold branding, independent clothing positioning and visible streetwear,
sweatshirt and sportswear catalog informed the design. No prices, stock levels,
shipping promises or discounts are advertised. The generated campaign image
is general fashion imagery, not a representation of a specific catalog SKU.

## Artwork

- Generator: built-in `image_gen` tool; no CLI/API fallback.
- Generated original: PNG, 1122 × 1402, retained in the image generator's output
  directory.
- Project asset: `public/promotions/clotheric-editorial-v1.webp`, 1122 × 1402,
  198,868 bytes. Converted to WebP for delivery without cropping or composition
  changes. The welcome screen uses the self-hosted file directly.

Exact generation prompt:

> Use case: ads-marketing. Asset type: editorial photographic artwork for a Clotheric clothing marketplace promotional welcome screen on OutputTracer. Generate one polished photorealistic fashion still-life, portrait 4:5 composition. Clotheric's observed visual identity is warm ivory, restrained antique gold typography, white space, and independent streetwear/sportswear. Scene: a beautifully art-directed modern studio arrangement of a rich navy cotton T-shirt, a soft warm-ivory crewneck sweatshirt, folded charcoal sport trousers, and one muted cocoa sweatshirt draped naturally over low sandstone display plinths. Precise natural fabric texture, thoughtful folds, no fake logos or labels. Off-white seamless backdrop, warm natural side light, delicate long shadows, subtle gold-beige accents. Premium independent fashion editorial, calm and contemporary, sophisticated rather than busy, realistic materials. Keep all garments legible with generous breathing room and safe margins so the image can crop gracefully in a website hero panel. No people, no text, no numbers, no logos, no watermark, no website interface, no buttons, no prices or discount claims. The artwork is general fashion campaign imagery, not a depiction of a specific catalog SKU.

## Release and verification

Deployed application commit: `b6c5772`.
Production release: `clotheric-welcome-20261026-v1`.

- TypeScript, changed-component ESLint and the production build passed.
- Existing app suite: 569 passed, 2 existing skips.
- All 15 guarded production route health checks passed. The live artwork
  returns HTTP 200 and the expected 198,868-byte WebP.
- Browser preview verified the complete banner, automatic keyboard focus on
  Continue, Shop opening Clotheric in a separate tab, Continue loading the
  existing editor, refresh retaining the dismissed state, a fresh tab showing
  the banner again, and direct `/assembly` navigation bypassing the promotion.
- Public production browser checks verified the banner, image and links,
  Continue opening the ready editor, refresh skipping the dismissed promotion,
  and a fresh tab displaying it. That fresh live tab was left open as the
  deliverable. Screenshot: `/tmp/outputtracer-clotheric-welcome-live.png`.
- The storage-denied fallback was code-reviewed; browser storage preferences
  were not changed. The ad content scrolls independently of the always-visible
  Continue bar for short/narrow viewports.

The temporary preview service, SSH tunnel, research and test tabs were closed
after verification. No database or compiler changes were required.
