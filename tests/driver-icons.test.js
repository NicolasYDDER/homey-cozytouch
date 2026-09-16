'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Store guideline 1.6 (Driver icons — https://apps.developer.homey.app/app-store/guidelines#id-1.6.-driver-icons)
// is a separate asset from the 1.4 driver *images* fixed in 1.3.7: each driver's
// icon.svg must be a transparent, vector line drawing — no background colour, no
// filled silhouette, and never the app's own icon. pass_cozytouch and
// zone_control hardcoded stroke="#000"/fill="#000" instead of following the rest
// of the set with currentColor; nothing catches that at `homey app validate`
// (it only checks the manifest, not icon content), so it is checked here.
//
// Homey mobile converts SVG → bitmap and does NOT inherit fill="none" from the
// root <svg>. A stroked <rect>/<circle>/<path> without its own fill="none" is
// painted solid black on the phone while desktop still looks fine — so every
// stroked shape must set fill explicitly (none or currentColor for intentional
// dots).
const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const appIcon = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');

function driverIconPath(driverId) {
  return path.join(ROOT, 'drivers', driverId, 'assets', 'icon.svg');
}

describe('driver icons (App Store guideline 1.6)', () => {
  for (const driver of manifest.drivers) {
    describe(driver.id, () => {
      const svg = fs.readFileSync(driverIconPath(driver.id), 'utf8');

      it('has a square viewBox (uses the full canvas)', () => {
        const match = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
        assert.ok(match, 'expected a "viewBox=\\"0 0 W H\\"" attribute');
        assert.equal(match[1], match[2], 'viewBox width and height must match');
      });

      it('has a transparent background (no full-canvas rect)', () => {
        const [, size] = svg.match(/viewBox="0 0 (\d+) \d+"/);
        const fullCanvasRect = new RegExp(`<rect[^>]*width="${size}"[^>]*height="${size}"`);
        assert.doesNotMatch(svg, fullCanvasRect);
      });

      it('only uses currentColor or none — no hardcoded colours or gradients', () => {
        const colors = [...svg.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]);
        for (const color of colors) {
          assert.ok(
            color === 'none' || color === 'currentColor',
            `found hardcoded color "${color}" — use currentColor so the icon follows the theme`,
          );
        }
        assert.doesNotMatch(svg, /<(linearGradient|radialGradient)/);
      });

      it('sets fill on every stroked shape (Homey mobile does not inherit svg fill="none")', () => {
        const tags = [...svg.matchAll(/<(rect|circle|ellipse|path|line|polyline|polygon)\b[^>/]*(?:\/)?>/g)]
          .map((m) => m[0]);
        assert.ok(tags.length > 0, 'expected at least one shape element');
        for (const tag of tags) {
          if (!/\bstroke=/.test(tag)) continue;
          assert.match(
            tag,
            /\bfill="(none|currentColor)"/,
            `stroked shape missing explicit fill="none" (renders solid black on Homey mobile):\n${tag}`,
          );
        }
      });

      it('is not the app icon reused as a driver icon', () => {
        assert.notEqual(svg.trim(), appIcon.trim());
      });
    });
  }
});
