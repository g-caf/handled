import { createBrowserContext, safeCloseContext, randomDelay, waitForNetworkIdle, createApiResponseCollector, checkForBlock } from './baseAgent.js';

export async function fetchUberEatsOrderHistory(storageState) {
  const { context, page } = await createBrowserContext(storageState);

  try {
    const collector = createApiResponseCollector(page, [
      'orders', 'eats/v1/orders', 'getOrders', 'order-history', 'past-orders'
    ]);

    await page.goto('https://www.ubereats.com/orders', { waitUntil: 'domcontentloaded' });
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

    const orders = extractOrdersFromResponses(collector.getResponses(), 'ubereats');
    collector.stop();

    // Also try to extract from the page DOM as fallback
    const domOrders = await extractOrdersFromDOM(page, 'ubereats');

    const allOrders = deduplicateOrders([...orders, ...domOrders]);
    const updatedStorageState = await context.storageState();

    return { orders: allOrders, updatedStorageState };
  } finally {
    await safeCloseContext(context);
  }
}

export async function fetchDoorDashOrderHistory(storageState) {
  const { context, page } = await createBrowserContext(storageState);

  try {
    const collector = createApiResponseCollector(page, [
      'orders', 'graphql', 'order-history', 'consumer/orders'
    ]);

    await page.goto('https://www.doordash.com/orders', { waitUntil: 'domcontentloaded' });
    await randomDelay(2000, 3000);

    const blockCheck = await checkForBlock(page);
    if (blockCheck.blocked) {
      return { orders: [], error: `Blocked: ${blockCheck.reason}` };
    }

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await randomDelay(1000, 1500);
    }

    await waitForNetworkIdle(page);

    const orders = extractOrdersFromResponses(collector.getResponses(), 'doordash');
    collector.stop();

    const domOrders = await extractOrdersFromDOM(page, 'doordash');

    const allOrders = deduplicateOrders([...orders, ...domOrders]);
    const updatedStorageState = await context.storageState();

    return { orders: allOrders, updatedStorageState };
  } finally {
    await safeCloseContext(context);
  }
}

function extractOrdersFromResponses(responses, platform) {
  const orders = [];

  for (const response of responses) {
    const extracted = findOrdersInObject(response.data, platform);
    orders.push(...extracted);
  }

  return orders;
}

function findOrdersInObject(obj, platform, depth = 0) {
  const orders = [];
  if (depth > 8 || !obj) return orders;

  if (Array.isArray(obj)) {
    for (const element of obj) {
      if (isOrderLike(element)) {
        orders.push(normalizeOrder(element, platform));
      } else {
        orders.push(...findOrdersInObject(element, platform, depth + 1));
      }
    }
  } else if (typeof obj === 'object') {
    if (isOrderLike(obj)) {
      orders.push(normalizeOrder(obj, platform));
    }

    const containerKeys = ['orders', 'pastOrders', 'orderHistory', 'data', 'results', 'items'];
    for (const key of containerKeys) {
      if (obj[key]) {
        orders.push(...findOrdersInObject(obj[key], platform, depth + 1));
      }
    }
  }

  return orders;
}

function isOrderLike(obj) {
  if (!obj || typeof obj !== 'object') return false;

  const hasItems = obj.items || obj.orderItems || obj.lineItems || obj.cart;
  const hasStore = obj.store || obj.storeName || obj.restaurant || obj.merchantName;

  return hasItems || hasStore;
}

function normalizeOrder(obj, platform) {
  const storeName = obj.store?.name || obj.storeName || obj.restaurant?.name ||
                    obj.merchantName || obj.businessName || 'Unknown Store';

  const items = extractItemsFromOrder(obj);
  const orderDate = obj.createdAt || obj.orderDate || obj.placedAt || obj.timestamp;

  return {
    platform,
    storeName,
    items,
    orderDate: orderDate ? new Date(orderDate).toISOString() : null,
    orderId: obj.id || obj.orderId || obj.uuid || null,
  };
}

function extractItemsFromOrder(obj) {
  const items = [];
  const rawItems = obj.items || obj.orderItems || obj.lineItems || obj.cart?.items || [];

  for (const item of rawItems) {
    const name = item.name || item.title || item.itemName || item.displayName;
    if (name) {
      items.push({
        name,
        quantity: item.quantity || 1,
        price: item.price || item.unitPrice || null,
      });
    }
  }

  return items;
}

async function extractOrdersFromDOM(page, platform) {
  try {
    const orders = await page.evaluate((plat) => {
      const results = [];

      // Look for order cards/containers
      const orderSelectors = [
        '[data-testid="order-card"]',
        '[data-testid="order-item"]',
        '.order-card',
        '.past-order',
        '[class*="OrderCard"]',
        '[class*="order-history"]'
      ];

      for (const selector of orderSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const text = el.textContent || '';
          // Extract store name (usually prominent)
          const storeEl = el.querySelector('h2, h3, [class*="store"], [class*="merchant"]');
          const storeName = storeEl?.textContent?.trim() || 'Unknown';

          // Extract item names
          const itemEls = el.querySelectorAll('li, [class*="item"], [class*="product"]');
          const items = [];
          for (const itemEl of itemEls) {
            const itemText = itemEl.textContent?.trim();
            if (itemText && itemText.length < 100) {
              items.push({ name: itemText, quantity: 1 });
            }
          }

          if (storeName !== 'Unknown' || items.length > 0) {
            results.push({
              platform: plat,
              storeName,
              items,
              orderDate: null,
              orderId: null,
            });
          }
        }
      }

      return results;
    }, platform);

    return orders;
  } catch {
    return [];
  }
}

function deduplicateOrders(orders) {
  const seen = new Set();
  const unique = [];

  for (const order of orders) {
    const key = `${order.platform}:${order.storeName}:${order.items.length}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(order);
    }
  }

  return unique;
}

export function extractUniqueItemsFromOrders(orders) {
  const itemCounts = new Map();

  for (const order of orders) {
    for (const item of order.items) {
      const key = item.name.toLowerCase().trim();
      if (!itemCounts.has(key)) {
        itemCounts.set(key, {
          name: item.name,
          count: 0,
          lastOrdered: order.orderDate,
          prices: [],
        });
      }
      const entry = itemCounts.get(key);
      entry.count += item.quantity || 1;
      if (order.orderDate && (!entry.lastOrdered || order.orderDate > entry.lastOrdered)) {
        entry.lastOrdered = order.orderDate;
      }
      // Track prices from different platforms/stores
      if (item.price) {
        entry.prices.push({
          price: item.price,
          platform: order.platform,
          storeName: order.storeName,
          storeUrl: order.storeUrl || null,
        });
      }
    }
  }

  // Process prices to find lowest and highest
  for (const entry of itemCounts.values()) {
    if (entry.prices.length > 0) {
      entry.prices.sort((a, b) => a.price - b.price);
      entry.lowestPrice = entry.prices[0];
      entry.highestPrice = entry.prices[entry.prices.length - 1];
    } else {
      entry.lowestPrice = null;
      entry.highestPrice = null;
    }
  }

  return Array.from(itemCounts.values())
    .sort((a, b) => b.count - a.count);
}
