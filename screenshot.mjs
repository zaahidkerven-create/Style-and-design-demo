import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3];

const dir = './temporary screenshots';
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const existing = fs.readdirSync(dir).filter(f => /^screenshot-\d+/.test(f));
const nextN = existing.reduce((max, f) => {
  const m = f.match(/^screenshot-(\d+)/);
  return m ? Math.max(max, parseInt(m[1], 10)) : max;
}, 0) + 1;

const filename = label ? `screenshot-${nextN}-${label}.png` : `screenshot-${nextN}.png`;
const outPath = path.join(dir, filename);

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle0' });

// Scroll through the full page first so any scroll-triggered reveal
// animations (IntersectionObserver, etc.) fire before we capture.
await page.evaluate(async () => {
  await new Promise((resolve) => {
    let total = 0;
    const step = 400;
    const timer = setInterval(() => {
      window.scrollBy(0, step);
      total += step;
      if (total >= document.body.scrollHeight) {
        clearInterval(timer);
        window.scrollTo(0, 0);
        setTimeout(resolve, 300);
      }
    }, 80);
  });
});

// Belt-and-braces: force any scroll-triggered reveal animations (common
// class names below) to their final visible state before capturing, so
// screenshots always show the settled page rather than a mid-animation
// glitch caused by IntersectionObserver timing during the programmatic
// scroll above.
await page.evaluate(() => {
  document.querySelectorAll('.reveal, [class*="reveal"], [class*="animate-in"], [class*="fade-in"]').forEach((el) => {
    el.classList.add('is-in', 'is-visible', 'visible', 'in-view');
    el.style.transition = 'none';
    el.style.opacity = '1';
    el.style.transform = 'none';
  });
});
// Force a reflow so the transition:none takes effect before we read back
// the styles, then let one animation frame pass so the browser actually
// paints the settled state before the screenshot is captured.
await page.evaluate(() => document.body.offsetHeight);
await new Promise((r) => setTimeout(r, 50));

await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`Saved ${outPath}`);
