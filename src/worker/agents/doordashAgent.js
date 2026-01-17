import { createBrowserContext, safeCloseContext, randomDelay, waitForNetworkIdle, createApiResponseCollector, checkForBlock } from './baseAgent.js';

export async function searchStore(storageState, storeName) {
  const { context, page } = await createBrowserContext(storageState);

  try {
    const collector = createApiResponseCollector(page, [
      'api', 'graphql', 'store', 'menu', 'items', 'products', 'search'
    ]);

    await page.goto('https://www.doordash.com/', { waitUntil: 'domcontentloaded' });
    await randomDelay(1000, 2000);

    const blockCheck = await checkForBlock(page);
    if (blockCheck.blocked) {
      return { items: [], error: `Blocked: ${blockCheck.reason}`, updatedStorageState: null };
    }

    const searchSelectors = [
      'input[placeholder*="search"]',
      'input[placeholder*="Search"]',
      'input[aria-label*="search"]',
      'input[type="search"]',
      '[data-testid="SearchInput"]',
      '[data-anchor-id="SearchInput"]'
    ];

    let searchInput = null;
    for (const selector of searchSelectors) {
      searchInput = await page.$(selector);
      if (searchInput) break;
    }

    if (searchInput) {
      await searchInput.click();
      await randomDelay();
      await searchInput.fill(storeName);
      await randomDelay(500, 1000);
      await page.keyboard.press('Enter');
    }

    await waitForNetworkIdle(page);
    await randomDelay(2000, 3000);

    const items = extractItemsFromResponses(collector.getResponses());
    collector.stop();

    const updatedStorageState = await context.storageState();

    return { items, updatedStorageState };
  } finally {
    await safeCloseContext(context);
  }
}

export async function captureStoreItems(storageState, storeUrl) {
  const { context, page } = await createBrowserContext(storageState);

  try {
    const collector = createApiResponseCollector(page, [
      'api', 'graphql', 'store', 'menu', 'items', 'products', 'categories'
    ]);

    await page.goto(storeUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay(1000, 2000);

    const blockCheck = await checkForBlock(page);
    if (blockCheck.blocked) {
      return { items: [], error: `Blocked: ${blockCheck.reason}` };
    }

    await autoScroll(page);
    await waitForNetworkIdle(page);
    await randomDelay(1000, 2000);

    const items = extractItemsFromResponses(collector.getResponses());
    collector.stop();

    return { items };
  } finally {
    await safeCloseContext(context);
  }
}

async function autoScroll(page, maxScrolls = 8) {
  for (let i = 0; i < maxScrolls; i++) {
    const previousHeight = await page.evaluate(() => document.body.scrollHeight);

    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });

    await randomDelay(800, 1200);

    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === previousHeight) break;
  }

  await page.evaluate(() => window.scrollTo(0, 0));
}

function extractItemsFromResponses(responses) {
  const items = [];
  const seenNames = new Set();

  for (const response of responses) {
    const extracted = findItemsInObject(response.data);
    for (const item of extracted) {
      if (item.name && !seenNames.has(item.name)) {
        seenNames.add(item.name);
        items.push(item);
      }
    }
  }

  return items;
}

function findItemsInObject(obj, depth = 0) {
  const items = [];
  if (depth > 10 || !obj) return items;

  if (Array.isArray(obj)) {
    for (const element of obj) {
      if (isProductLike(element)) {
        items.push(normalizeItem(element));
      } else {
        items.push(...findItemsInObject(element, depth + 1));
      }
    }
  } else if (typeof obj === 'object') {
    if (isProductLike(obj)) {
      items.push(normalizeItem(obj));
    }

    const containerKeys = ['items', 'products', 'menuItems', 'data', 'results', 'storeMenuItems', 'itemList'];
    for (const key of containerKeys) {
      if (obj[key]) {
        items.push(...findItemsInObject(obj[key], depth + 1));
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      if (!containerKeys.includes(key) && typeof value === 'object') {
        items.push(...findItemsInObject(value, depth + 1));
      }
    }
  }

  return items;
}

function isProductLike(obj) {
  if (!obj || typeof obj !== 'object') return false;

  const hasName = obj.name || obj.title || obj.displayName || obj.itemName;
  const hasPrice = obj.price !== undefined || obj.displayPrice !== undefined ||
                   obj.unitPrice !== undefined || obj.monetaryFields;

  return hasName && hasPrice;
}

function normalizeItem(obj) {
  const name = obj.name || obj.title || obj.displayName || obj.itemName || 'Unknown';

  let price = null;
  if (typeof obj.price === 'number') {
    price = obj.price / 100; // DoorDash often uses cents
  } else if (obj.price?.unitAmount) {
    price = obj.price.unitAmount / 100;
  } else if (obj.displayPrice) {
    const match = String(obj.displayPrice).match(/[\d.]+/);
    price = match ? parseFloat(match[0]) : null;
  } else if (obj.unitPrice) {
    price = typeof obj.unitPrice === 'number' ? obj.unitPrice / 100 : null;
  }

  return {
    name,
    price,
    unit: obj.unit || obj.unitOfMeasure || null,
    inStock: obj.isAvailable !== false && obj.isSoldOut !== true,
    category: obj.category || obj.categoryName || null,
    platform: 'doordash'
  };
}
