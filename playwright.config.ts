import { defineConfig, devices } from '@playwright/test';

/**
 * Browser suites run against the PRODUCTION build served by `vite preview`, so
 * what passes here is what ships.
 *
 *   a11y.spec.ts    the axe WCAG A/AA gate, plus the oracles axe has no rule
 *                   for, at 1280 / 390 / 320 px.
 *   claims.spec.ts  what the page SAYS, and what it does not promise (§4.1b,
 *                   §4.1d). One engine: copy does not vary by browser.
 *
 * Port 4213 is unique to this lab across the fleet and is never the Vite default
 * 4173. `node tools/port-sync.js` in the catalog reported it as the next free
 * port on 2026-10-04, against a registry of 208 labs. A shared port means
 * `reuseExistingServer` silently scans a DIFFERENT lab's preview, and during a
 * mutation check it can scan an UNMUTATED checkout still running from a previous
 * run -- which reads as "the mutation was not caught" and sends someone to fix a
 * check that works.
 */
const PORT = 4213;
const BASE = `http://localhost:${PORT}/crypto-lab-good-randomness/`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  // The a11y drive walks every state and scans after each one; the exhaustive
  // ten-thousand-candidate searches run several times along the way and are
  // genuinely slow in a headless browser.
  timeout: 300_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE,
    colorScheme: 'dark', // dark is the only theme
  },
  projects: [
    { name: 'a11y', testMatch: /a11y\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'claims', testMatch: /claims\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Build before serving. `vite preview` serves whatever is already in dist/,
    // so without the build in front a run tests a stale bundle -- and a build
    // that FAILS leaves the previous good bundle in place, so the whole suite
    // passes green against source that no longer compiles. That silently
    // invalidates mutation checking, which is the only way a test is ever shown
    // to have teeth.
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
