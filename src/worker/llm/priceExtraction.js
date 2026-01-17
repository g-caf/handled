const { model } = require("./geminiClient");
const { buildExtractionPrompt } = require("./prompts");

async function extractPricesFromScreenshot(imageBuffer, itemsToFind) {
  try {
    const prompt = buildExtractionPrompt(itemsToFind);

    const imagePart = {
      inlineData: {
        data: imageBuffer.toString("base64"),
        mimeType: "image/png",
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();

    const cleanedText = text
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const parsed = JSON.parse(cleanedText);

    return {
      success: true,
      data: parsed,
      rawResponse: text,
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        success: false,
        error: "Failed to parse Gemini response as JSON",
        details: error.message,
        rawResponse: error.message,
      };
    }

    return {
      success: false,
      error: "Gemini API request failed",
      details: error.message,
    };
  }
}

module.exports = { extractPricesFromScreenshot };
