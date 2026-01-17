#!/usr/bin/env node

import { chromium } from 'playwright';

const PLATFORMS = {
  ubereats: {
    name: 'Uber Eats',
    url: 'https://www.ubereats.com/',
    loginIndicator: 'account',
  },
  doordash: {
    name: 'DoorDash',
    url: 'https://www.doordash.com/',
    loginIndicator: 'account',
  },
};

async function captureSession(platformKey) {
  const platform = PLATFORMS[platformKey];
  if (!platform) {
    console.error(`Unknown platform: ${platformKey}`);
    console.error(`Available platforms: ${Object.keys(PLATFORMS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nCapturing session for ${platform.name}...`);
  console.log('A browser window will open. Please log in to your account.');
  console.log('Once logged in, press Enter in this terminal to capture the session.\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  await page.goto(platform.url);

  // Wait for user to press Enter
  await new Promise(resolve => {
    process.stdin.setRawMode?.(false);
    process.stdin.resume();
    console.log('\n>>> Press Enter after logging in to capture session <<<\n');
    process.stdin.once('data', resolve);
  });

  const storageState = await context.storageState();
  await browser.close();

  console.log('\n=== SESSION CAPTURED ===\n');
  console.log('Copy the JSON below and paste it into the session upload form:\n');
  console.log(JSON.stringify(storageState, null, 2));
  console.log('\n========================\n');

  process.exit(0);
}

const platformArg = process.argv[2];

if (!platformArg) {
  console.error('Usage: node scripts/capture-session.js <platform>');
  console.error(`Available platforms: ${Object.keys(PLATFORMS).join(', ')}`);
  process.exit(1);
}

captureSession(platformArg);
