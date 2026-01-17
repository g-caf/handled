import { createBrowserContext, safeCloseContext, randomDelay, waitForNetworkIdle, checkForBlock } from './baseAgent.js';

export async function addToUberEatsCart(storageState, storeUrl, items) {
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
        const added = await addSingleItemUberEats(page, item.name, item.quantity || 1);
        if (added) {
          addedItems.push(item.name);
        } else {
          failedItems.push(item.name);
        }
        await randomDelay(1000, 2000);
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

async function addSingleItemUberEats(page, itemName, quantity) {
  // Search for the item on the page
  const searchInput = await page.$('input[placeholder*="Search"]') ||
                      await page.$('input[type="search"]') ||
                      await page.$('[data-testid="search-input"]');

  if (searchInput) {
    await searchInput.click();
    await randomDelay(300, 500);
    await searchInput.fill(itemName);
    await randomDelay(500, 1000);
    await page.keyboard.press('Enter');
    await waitForNetworkIdle(page);
    await randomDelay(1000, 1500);
  }

  // Look for the item in results
  const itemSelectors = [
    `text="${itemName}"`,
    `[data-testid="store-item"]:has-text("${itemName}")`,
    `[class*="MenuItem"]:has-text("${itemName}")`,
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

  await itemElement.click();
  await randomDelay(500, 1000);

  // Look for add to cart button in modal
  const addButtonSelectors = [
    'button:has-text("Add to Cart")',
    'button:has-text("Add to Order")',
    'button:has-text("Add")',
    '[data-testid="add-to-cart-button"]',
  ];

  for (const selector of addButtonSelectors) {
    try {
      const addButton = await page.$(selector);
      if (addButton) {
        // Set quantity if > 1
        if (quantity > 1) {
          const plusButton = await page.$('button[aria-label*="increase"], button:has-text("+")');
          if (plusButton) {
            for (let i = 1; i < quantity; i++) {
              await plusButton.click();
              await randomDelay(200, 400);
            }
          }
        }

        await addButton.click();
        await randomDelay(500, 1000);
        return true;
      }
    } catch {
      continue;
    }
  }

  // Close modal if we couldn't add
  await page.keyboard.press('Escape');
  return false;
}

export async function addToDoorDashCart(storageState, storeUrl, items) {
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
        const added = await addSingleItemDoorDash(page, item.name, item.quantity || 1);
        if (added) {
          addedItems.push(item.name);
        } else {
          failedItems.push(item.name);
        }
        await randomDelay(1000, 2000);
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

async function addSingleItemDoorDash(page, itemName, quantity) {
  // Use search
  const searchInput = await page.$('input[placeholder*="Search"]') ||
                      await page.$('[data-anchor-id="SearchInput"]');

  if (searchInput) {
    await searchInput.click();
    await randomDelay(300, 500);
    await searchInput.fill(itemName);
    await randomDelay(500, 1000);
    await page.keyboard.press('Enter');
    await waitForNetworkIdle(page);
    await randomDelay(1000, 1500);
  }

  // Find item
  const itemElement = await page.$(`[data-testid="MenuItem"]:has-text("${itemName}")`) ||
                      await page.$(`[class*="ItemCard"]:has-text("${itemName}")`);

  if (!itemElement) {
    return false;
  }

  await itemElement.click();
  await randomDelay(500, 1000);

  // Add to cart
  const addButton = await page.$('button:has-text("Add to Cart")') ||
                    await page.$('button:has-text("Add")') ||
                    await page.$('[data-anchor-id="AddToCartButton"]');

  if (addButton) {
    if (quantity > 1) {
      const plusButton = await page.$('button[aria-label*="increase"], button:has-text("+")');
      if (plusButton) {
        for (let i = 1; i < quantity; i++) {
          await plusButton.click();
          await randomDelay(200, 400);
        }
      }
    }

    await addButton.click();
    await randomDelay(500, 1000);
    return true;
  }

  await page.keyboard.press('Escape');
  return false;
}
