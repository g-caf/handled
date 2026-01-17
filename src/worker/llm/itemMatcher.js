const { model } = require("./geminiClient");
const { buildMatchingPrompt } = require("./prompts");

async function matchCartToStore(cartItems, storeItems) {
  try {
    const prompt = buildMatchingPrompt(cartItems, storeItems);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(cleanedText);

    return parsed.matches.map((match) => ({
      cartItem: match.cartItem,
      matchedStoreItem: match.matchedStoreItem,
      confidence: match.confidence,
      reasoning: match.reasoning,
    }));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Failed to parse Gemini response as JSON: ${error.message}`);
    }
    throw new Error(`Gemini API request failed: ${error.message}`);
  }
}

module.exports = { matchCartToStore };
