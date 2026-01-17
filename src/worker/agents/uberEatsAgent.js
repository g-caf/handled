import { createBrowserContext, randomDelay, waitForNetworkIdle, createApiResponseCollector } from './baseAgent.js';

export async function searchStore(storageState, storeName) {
  const { browser, context, page } = await createBrowserContext(storageState);
  
  try {
    const collector = createApiResponseCollector(page, [
      'api', 'getStoreV1', 'getFeed', 'store', 'menu', 'catalog', 'items', 'products'
    ]);
    
    await page.goto('https://www.ubereats.com/', { waitUntil: 'domcontentloaded' });
    await randomDelay(1000, 2000);
    
    // Look for search input
    const searchSelectors = [
      'input[placeholder*="search"]',
      'input[placeholder*="Search"]',
      'input[aria-label*="search"]',
      'input[type="search"]',
      '[data-testid="search-input"]'
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
    await browser.close();
  }
}

export async function captureStoreItems(page, storeUrl) {
  const collector = createApiResponseCollector(page, [
    'api', 'getStoreV1', 'getFeed', 'store', 'menu', 'catalog', 'items', 'products', 'sections'
  ]);
  
  await page.goto(storeUrl, { waitUntil: 'domcontentloaded' });
  await randomDelay(1000, 2000);
  
  // Scroll to trigger lazy loading of menu sections
  await autoScroll(page);
  
  await waitForNetworkIdle(page);
  await randomDelay(1000, 2000);
  
  const items = extractItemsFromResponses(collector.getResponses());
  collector.stop();
  
  return items;
}

async function autoScroll(page, maxScrolls = 10) {
  for (let i = 0; i < maxScrolls; i++) {
    const previousHeight = await page.evaluate(() => document.body.scrollHeight);
    
    await page.evaluate(() => {
      window.scrollBy(0, window.innerHeight);
    });
    
    await randomDelay(800, 1200);
    
    const newHeight = await page.evaluate(() => document.body.scrollHeight);
    if (newHeight === previousHeight) break;
  }
  
  // Scroll back to top
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
    
    // Check common container keys
    const containerKeys = ['items', 'products', 'menuItems', 'data', 'results', 'catalog', 'sections', 'catalogItems'];
    for (const key of containerKeys) {
      if (obj[key]) {
        items.push(...findItemsInObject(obj[key], depth + 1));
      }
    }
    
    // Recurse into other object properties
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
  
  const hasName = obj.name || obj.title || obj.itemName || obj.productName;
  const hasPrice = obj.price !== undefined || obj.priceAmount !== undefined || 
                   obj.unitPrice !== undefined || obj.displayPrice;
  
  return hasName && hasPrice;
}

function normalizeItem(obj) {
  const name = obj.name || obj.title || obj.itemName || obj.productName || 'Unknown';
  
  let price = null;
  if (typeof obj.price === 'number') {
    price = obj.price;
  } else if (obj.price?.amount) {
    price = obj.price.amount;
  } else if (obj.priceAmount) {
    price = obj.priceAmount;
  } else if (obj.unitPrice) {
    price = obj.unitPrice;
  } else if (typeof obj.displayPrice === 'string') {
    const match = obj.displayPrice.match(/[\d.]+/);
    price = match ? parseFloat(match[0]) : null;
  }
  
  return {
    name,
    price,
    unit: obj.unit || obj.unitOfMeasure || obj.quantityUnit || null,
    inStock: obj.inStock !== false && obj.available !== false && obj.isAvailable !== false,
    category: obj.category || obj.categoryName || obj.section || null
  };
}
