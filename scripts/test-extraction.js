const { matchCartToStore } = require("../src/worker/llm/itemMatcher");

async function main() {
  const cartItems = [
    { name: "eggs", quantity: 2 },
    { name: "milk", quantity: 1 },
    { name: "bread", quantity: 1 },
    { name: "organic bananas", quantity: 3 },
    { name: "cheddar cheese", quantity: 1 },
  ];

  const storeItems = [
    { name: "Large Grade A Eggs 12ct", price: 5.99 },
    { name: "Organic Free-Range Eggs 12ct", price: 7.49 },
    { name: "Whole Milk 1 Gallon", price: 4.29 },
    { name: "2% Reduced Fat Milk 1 Gallon", price: 4.19 },
    { name: "Oat Milk Original 64oz", price: 4.99 },
    { name: "White Sandwich Bread 20oz", price: 3.49 },
    { name: "Whole Wheat Bread 24oz", price: 4.29 },
    { name: "Organic Bananas per lb", price: 0.79 },
    { name: "Bananas per lb", price: 0.59 },
    { name: "Sharp Cheddar Cheese 8oz", price: 4.99 },
    { name: "Mild Cheddar Cheese Block 16oz", price: 6.49 },
    { name: "Swiss Cheese Slices 8oz", price: 5.29 },
  ];

  console.log("Testing Gemini TEXT item matching...");
  console.log("\nCart Items:");
  cartItems.forEach((item) => console.log(`  - ${item.name} (qty: ${item.quantity})`));
  console.log("\nStore Catalog:");
  storeItems.forEach((item) => console.log(`  - ${item.name}: $${item.price}`));
  console.log("\nMatching...\n");

  try {
    const matches = await matchCartToStore(cartItems, storeItems);

    console.log("Matching Results:");
    console.log("=".repeat(60));

    matches.forEach((match) => {
      const cartName = match.cartItem.name;
      const storeName = match.matchedStoreItem?.name || "NO MATCH";
      const price = match.matchedStoreItem?.price;
      const confidence = (match.confidence * 100).toFixed(0);

      console.log(`\n${cartName} → ${storeName}`);
      if (price) console.log(`  Price: $${price}`);
      console.log(`  Confidence: ${confidence}%`);
      console.log(`  Reason: ${match.reasoning}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("Full response:");
    console.log(JSON.stringify(matches, null, 2));
  } catch (error) {
    console.error("Matching failed:");
    console.error(error.message);
    process.exit(1);
  }
}

main();
