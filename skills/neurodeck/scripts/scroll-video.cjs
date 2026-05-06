const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

(async () => {
  const url = process.argv[2] || "https://example.com";
  const outDir = process.argv[3] || "./videos";
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    recordVideo: {
      dir: outDir,
      size: { width: 1440, height: 900 },
    },
  });

  const page = await context.newPage();

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const scrollHeight = await page.evaluate(() => document.body.scrollHeight);
  const viewportHeight = 900;
  const scrollDistance = scrollHeight - viewportHeight;
  const scrollDuration = Math.max(3000, scrollDistance * 3);
  const steps = 60;
  const stepDelay = scrollDuration / steps;
  const stepSize = scrollDistance / steps;

  for (let i = 0; i <= steps; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), i * stepSize);
    await page.waitForTimeout(stepDelay);
  }

  await page.waitForTimeout(1000);
  const video = page.video();
  await context.close();
  const videoPath = video ? await video.path() : "";
  await browser.close();

  console.log(`VIDEO_PATH: ${videoPath ? path.resolve(videoPath) : outDir}`);
})();
