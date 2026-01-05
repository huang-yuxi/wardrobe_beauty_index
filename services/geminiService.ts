
import { GoogleGenAI, Type } from "@google/genai";
import { ItemType } from "../types";

const getAI = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
};

export const analyzeProduct = async (imageBase64: string, type: ItemType) => {
  const ai = getAI();
  
  const prompt = type === 'clothing'
    ? `Analyze this clothing item. Identify the brand, the specific garment type (e.g., "Oversized Blazer", "Midi Floral Dress", "High-waisted Jeans"), and a brief description including color or style. Return as JSON.`
    : `Analyze this beauty/skincare product. Identify the brand, the product type (e.g., "Hyaluronic Acid Serum", "Mineral Sunscreen", "Liquid Lipstick"), and a brief description of its purpose. Return as JSON.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } },
          { text: prompt }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING, description: "Specific product or model name" },
          brand: { type: Type.STRING, description: "Brand name" },
          category: { type: Type.STRING, description: "Specific sub-category/type" },
          description: { type: Type.STRING, description: "Short stylistic or functional description" }
        },
        required: ["name", "brand", "category", "description"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

export const parseReceipt = async (data: string, isImage: boolean) => {
  // Use Gemini 3 Pro for higher reasoning and Search grounding to identify cryptic receipt codes
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `Act as a personal shopper. I am providing a ${isImage ? 'photo' : 'text copy'} of a receipt or order confirmation. 
  1. Find all physical items (clothing, cosmetics, skincare). Ignore tax, shipping, and discounts.
  2. For cryptic names (e.g., "LL ALGN TANK 24"), use your knowledge or Google Search to find the REAL name (e.g., "Lululemon Align Tank 24").
  3. Categorize each as "clothing" or "beauty".
  4. Return a JSON list of items.`;

  const contentParts: any[] = [{ text: prompt }];
  if (isImage) {
    contentParts.push({ inlineData: { data: data, mimeType: 'image/jpeg' } });
  } else {
    contentParts.push({ text: `RECEIPT TEXT:\n${data}` });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: [{ parts: contentParts }],
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            brand: { type: Type.STRING },
            category: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['clothing', 'beauty'] },
            notes: { type: Type.STRING }
          },
          required: ["name", "brand", "category", "type", "notes"]
        }
      }
    }
  });

  return JSON.parse(response.text || '[]');
};

export const getSmartAdvice = async (item: any) => {
  const ai = getAI();
  const prompt = item.type === 'clothing' 
    ? `You are a fashion stylist. Give 3 quick, chic styling tips for a ${item.brand} ${item.name} (${item.category}). Be specific about pairings.`
    : `You are a skincare/beauty expert. Give a quick usage tip or ingredient highlight for ${item.brand} ${item.name}. Mention if it's best for morning or night.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt
  });

  return response.text;
};
