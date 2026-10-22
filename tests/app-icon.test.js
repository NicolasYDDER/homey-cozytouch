'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Store guideline 1.5 (App icons — https://apps.developer.homey.app/app-store/guidelines#id-1.5.-app-icons):
// the app icon is a clean vector line drawing with a transparent background, on
// the full 960x960 canvas. No images, gradients or background colours — a filled
// icon is shown as a solid shape and is not approved. `homey app validate` does
// not look inside the SVG, so it is checked here.
//
// As for the driver icons, Homey mobile does not inherit fill="none" from the
// root <svg>: every stroked shape must set its fill explicitly.
const ROOT = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(ROOT, 'assets', 'icon.svg'), 'utf8');

describe('app icon (App Store guideline 1.5)', () => {
  it('uses the full 960x960 canvas', () => {
    assert.match(svg, /viewBox="0 0 960 960"/);
  });

  it('has a transparent background (no full-canvas rect)', () => {
    assert.doesNotMatch(svg, /<rect[^>]*width="960"[^>]*height="960"/);
    assert.doesNotMatch(svg, /<rect[^>]*height="960"[^>]*width="960"/);
  });

  it('has no images, gradients or hardcoded colours — currentColor or none only', () => {
    assert.doesNotMatch(svg, /<(image|linearGradient|radialGradient)/);
    const colors = [...svg.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map((m) => m[1]);
    for (const color of colors) {
      assert.ok(
        color === 'none' || color === 'currentColor',
        `found hardcoded color "${color}" — use currentColor so the icon follows the theme`,
      );
    }
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
});
