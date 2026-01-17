import { createBrowserContext, safeCloseContext, randomDelay, waitForNetworkIdle, createApiResponseCollector, checkForBlock } from './baseAgent.js';

export async function searchStore(storageState, storeName) {
  const { context, page } = await createBrowserContext(storageState);

  try {
    const collector = createApiResponseCollector(page, [
      'api', 'graphql', 'v3', 'store', 'search', 'items', 'products'
    ]);

    await page.goto('https://www.instacart.com/', { waitUntil: 'domcontentloaded' });
    await randomDelay(1000, 2000);

    const blockCheck = await checkForBlock(page);
    if (blockCheck.blocked) {
      return { items: [], error: `Blocked: ${blockCheck.reason}`, updatedStorageState: null };
    }

    const searchSelectors = [
      'input[placeholder*="Search"]',
      'input[aria-label*="search"]',
      'input[type="search"]',
      '[data-testid="search-input"]',
      '#search-bar-input'
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
      'api', 'graphql', 'v3', 'store', 'items', 'products', 'aisles', 'departments'
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

export async function fetchOrderHistory(storageState) {
  const { context, page } = await createBrowserContext(storageState);

  try {
    const collector = createApiResponseCollector(page, [
      'orders', 'graphql', 'order_history', 'past-orders', 'v3'
    ]);

    await page.goto('https://www.instacart.com/store/account/orders', { waitUntil: 'domcontentloaded' });
    await randomDelay(2000, 3000);

    const blockCheck = await checkForBlock(page);
    if (blockCheck.blocked) {
      return { orders: [], error: `Blocked: ${blockCheck.reason}` };
    }

    // Scroll to load more orders
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await randomDelay(1000, 1500);
    }

    await waitForNetworkIdle(page);

    const orders = extractOrdersFromResponses(collector.getResponses());
    collector.stop();

    const domOrders = await extractOrdersFromDOM(page);
    const allOrders = deduplicateOrders([...orders, ...domOrders]);

    const updatedStorageState = await context.storageState();

    return { orders: allOrders, updatedStorageState };
  } finally {
    await safeCloseContext(context);
  }
}

export async function addToCart(storageState, storeUrl, items) {
  const { context, page } = await createBrowserContext(storageState);

  try {
    await page.goto(storeUrl, { waitUntil: 'domcontentloaded' });
    await randomDelay(2000, 3000);

    const blockCheck = await checkForBlock(page);
    if (blockCheck.blocked) {
      return { success: false, error: `Blocked: ${blockCheck.reason}` };
    }

    const addedItems = [];
    const failedItems = [];

    for (const item of items) {
      try {
        const added = await addSingleItem(page, item.name, item.quantity || 1);
        if (added) {
          addedItems.push(item.name);
        } else {
          failedItems.push(item.name);
        }
        await randomDelay(1500, 2500);
      } catch (err) {
        failedItems.push(item.name);
      }
    }

    const updatedStorageState = await context.storageState();

    return {
      success: true,
      addedItems,
      failedItems,
      updatedStorageState,
    };
  } finally {
    await safeCloseContext(context);
  }
}

async function addSingleItem(page, itemName, quantity) {
  // Search for item
  const searchInput = await page.$('input[placeholder*="Search"]') ||
                      await page.$('#search-bar-input') ||
                      await page.$('[data-testid="search-input"]');

  if (searchInput) {
    await searchInput.click();
    await randomDelay(300, 500);
    await searchInput.fill(itemName);
    await randomDelay(500, 1000);
    await page.keyboard.press('Enter');
    await waitForNetworkIdle(page);
    await randomDelay(1500, 2000);
  }

  // Find item in results
  const itemSelectors = [
    `[data-testid="item-card"]:has-text("${itemName}")`,
    `[class*="ProductCard"]:has-text("${itemName}")`,
    `[class*="ItemCard"]:has-text("${itemName}")`,
  ];

  let itemElement = null;
  for (const selector of itemSelectors) {
    try {
      itemElement = await page.$(selector);
      if (itemElement) break;
    } catch {
      continue;
    }
  }

  if (!itemElement) {
    return false;
  }

  // Look for add button within the item card
  const addButton = await itemElement.$('button:has-text("Add")') ||
                    await itemElement.$('[data-testid="add-button"]') ||
                    await itemElement.$('button[aria-label*="Add"]');

  if (addButton) {
    await addButton.click();
    await randomDelay(500, 800);

    // Handle quantity if > 1
    if (quantity > 1) {
      for (let i = 1; i < quantity; i++) {
        const plusButton = await itemElement.$('button[aria-label*="Increment"]') ||
                          await itemElement.$('button:has-text("+")');
        if (plusButton) {
          await plusButton.click();
          await randomDelay(300, 500);
        }
      }
    }

    return true;
  }

  return false;
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

    const containerKeys = ['items', 'products', 'data', 'results', 'modules', 'tracking'];
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

  const hasName = obj.name || obj.title || obj.product_name || obj.displayName;
  const hasPrice = obj.price !== undefined || obj.pricing !== undefined ||
                   obj.unit_price !== undefined || obj.base_price !== undefined;

  return hasName && hasPrice;
}

function normalizeItem(obj) {
  const name = obj.name || obj.title || obj.product_name || obj.displayName || 'Unknown';

  let price = null;
  if (typeof obj.price === 'number') {
    price = obj.price;
  } else if (obj.pricing?.price) {
    price = obj.pricing.price;
  } else if (obj.base_price) {
    price = obj.base_price;
  } else if (obj.unit_price) {
    price = obj.unit_price;
  }

  // Instacart often stores prices in cents
  if (price && price > 100) {
    price = price / 100;
  }

  return {
    name,
    price,
    unit: obj.unit || obj.unit_size || obj.size || null,
    inStock: obj.in_stock !== false && obj.available !== false,
    category: obj.category || obj.aisle || obj.department || null,
    platform: 'instacart'
  };
}

function extractOrdersFromResponses(responses) {
  const orders = [];

  for (const response of responses) {
    const extracted = findOrdersInObject(response.data);
    orders.push(...extracted);
  }

  return orders;
}

function findOrdersInObject(obj, depth = 0) {
  const orders = [];
  if (depth > 8 || !obj) return orders;

  if (Array.isArray(obj)) {
    for (const element of obj) {
      if (isOrderLike(element)) {
        orders.push(normalizeOrder(element));
      } else {
        orders.push(...findOrdersInObject(element, depth + 1));
      }
    }
  } else if (typeof obj === 'object') {
    if (isOrderLike(obj)) {
      orders.push(normalizeOrder(obj));
    }

    const containerKeys = ['orders', 'order_history', 'data', 'results'];
    for (const key of containerKeys) {
      if (obj[key]) {
        orders.push(...findOrdersInObject(obj[key], depth + 1));
      }
    }
  }

  return orders;
}

function isOrderLike(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return obj.items || obj.order_items || obj.line_items || obj.retailer;
}

function normalizeOrder(obj) {
  const storeName = obj.retailer?.name || obj.store_name || obj.retailer_name || 'Unknown Store';
  const items = extractItemsFromOrder(obj);
  const orderDate = obj.created_at || obj.order_date || obj.placed_at;

  return {
    platform: 'instacart',
    storeName,
    items,
    orderDate: orderDate ? new Date(orderDate).toISOString() : null,
    orderId: obj.id || obj.order_id || null,
  };
}

function extractItemsFromOrder(obj) {
  const items = [];
  const rawItems = obj.items || obj.order_items || obj.line_items || [];

  for (const item of rawItems) {
    const name = item.name || item.product_name || item.title;
    if (name) {
      items.push({
        name,
        quantity: item.quantity || 1,
        price: item.price || item.unit_price || null,
      });
    }
  }

  return items;
}

async function extractOrdersFromDOM(page) {
  try {
    return await page.evaluate(() => {
      const results = [];
      const orderCards = document.querySelectorAll('[data-testid="order-card"], [class*="OrderCard"], [class*="order-item"]');

      for (const card of orderCards) {
        const storeEl = card.querySelector('h2, h3, [class*="retailer"], [class*="store"]');
        const storeName = storeEl?.textContent?.trim() || 'Unknown';

        const itemEls = card.querySelectorAll('li, [class*="item"], [class*="product"]');
        const items = [];
        for (const itemEl of itemEls) {
          const text = itemEl.textContent?.trim();
          if (text && text.length < 100) {
            items.push({ name: text, quantity: 1 });
          }
        }

        if (storeName !== 'Unknown' || items.length > 0) {
          results.push({
            platform: 'instacart',
            storeName,
            items,
            orderDate: null,
            orderId: null,
          });
        }
      }

      return results;
    });
  } catch {
    return [];
  }
}

function deduplicateOrders(orders) {
  const seen = new Set();
  const unique = [];

  for (const order of orders) {
    const key = `${order.storeName}:${order.items.length}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(order);
    }
  }

  return unique;
}
