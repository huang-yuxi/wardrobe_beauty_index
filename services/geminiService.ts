
import { GoogleGenAI, Type } from "@google/genai";
import { ItemType } from "../types";

/**
 * Single-product analysis for manual photo uploads
 */
export const analyzeProduct = async (imageBase64: string, type: ItemType) => {
  // Always create a new instance to catch the latest API key from the handshake
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = type === 'clothing'
    ? `Analyze this clothing item. Identify the brand, the specific garment type (e.g., "Oversized Blazer", "Midi Floral Dress"), and a brief description. Return as JSON.`
    : `Analyze this beauty/skincare product. Identify the brand, the product type (e.g., "Serum", "Sunscreen"), and a brief description. Return as JSON.`;

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
          name: { type: Type.STRING },
          brand: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING }
        },
        required: ["name", "brand", "category", "description"]
      }
    }
  });

  return JSON.parse(response.text || '{}');
};

/**
 * Complex parsing for multi-item receipts or text orders
 */
export const parseReceipt = async (data: string, isImage: boolean) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = `Act as a personal shopper. I am providing a ${isImage ? 'photo' : 'text copy'} of a receipt. 
  1. Extract all physical items.
  2. If a brand/item name is abbreviated or cryptic, use Google Search to find the actual market name.
  3. Categorize as "clothing" or "beauty".
  4. Return JSON list.`;

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
      // Pro model supports Google Search to identify unknown SKUs
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

/**
 * Styling/Usage advice for specific items
 */
export const getSmartAdvice = async (item: any) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  
  const prompt = item.type === 'clothing' 
    ? `You are a fashion stylist. Give 3 quick styling tips for a ${item.brand} ${item.name}.`
    : `You are a beauty expert. Give a quick usage tip for ${item.brand} ${item.name}.`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingBudget: 0 } // Fast response for UI convenience
    }
  });

  return response.text;
};
