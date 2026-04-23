import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const config = { maxDuration: 60 };

// Load system prompt at module load
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const systemPrompt = readFileSync(join(__dirname, '../system-prompt.md'), 'utf-8');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export default async function handler(req: any, res: any) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phase, messages, ...otherData } = req.body;

    // Branch on phase
    if (phase === 'step3_config') {
      return await handleStep3Config(otherData, res);
    } else if (phase === 'final_prompt') {
      return await handleFinalPrompt(otherData, res);
    } else {
      // Legacy mode: use messages array
      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: 'Invalid request body' });
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        system: systemPrompt,
        max_tokens: 4096,
        messages,
      });

      const assistantContent = response.content[0]?.text || '';

      // Post-process: trim, strip JSON fences, parse
      let cleaned = assistantContent.trim();
      
      // Strip ```json code fences if present
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      
      // Find first { and last }
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }

      // Try to parse as JSON
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (parseError) {
        // Fallback on parse failure
        parsed = {
          message: "Unexpected response — please try again",
          helper: "",
          inputType: "text",
          options: [],
          toggles: [],
          allowFreeText: true,
          step: 0
        };
      }

      return res.status(200).json(parsed);
    }
  } catch (error: any) {
    console.error('ANTHROPIC ERROR:', error);
    return res.status(500).json({
      error: error?.message ?? 'Unknown error',
      status: error?.status,
      type: error?.error?.type
    });
  }
}

async function handleStep3Config(data: any, res: any) {
  const { mode, variationLevel, subjects, productRef, sceneRef, sceneImages } = data;

  const prompt = `Analyze the following inputs and return strict JSON matching this schema:
{
  "category": "<cookware|electronics|lifestyle|tools|decor|generic>",
  "base_inputs": {
    "background":  { "default": "...", "alternatives": ["...", "...", "..."], "derived": bool },
    "surface":     { "default": "...", "alternatives": [...], "derived": bool },
    "arrangement": { "default": "...", "alternatives": [...], "derived": false },
    "camera":      { "default": "...", "alternatives": [...], "derived": bool },
    "lighting":    { "default": "...", "alternatives": [...], "derived": bool }
  },
  "contextual_inputs": [
    { "key": "food",   "label": "Food Context", "default": "...", "alternatives": [...] },
    { "key": "action", "label": "Action",       "default": "...", "alternatives": [...] }
  ]
}

Inputs:
- Mode: ${mode}
- Variation Level: ${variationLevel || 'none'}
- Subjects: ${subjects}
- Product Reference: ${productRef}
- Scene Reference: ${sceneRef}
- Scene Images: ${sceneImages ? sceneImages.length + ' images provided' : 'none'}

Return ONLY the JSON, no markdown, no prose.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      system: systemPrompt + '\n\nOutput strict JSON for the step3_config phase.',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const assistantContent = response.content[0]?.text || '';

    // Post-process: trim, strip JSON fences, parse
    let cleaned = assistantContent.trim();
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      parsed = {
        category: "generic",
        base_inputs: {
          background: { default: "Clean studio", alternatives: ["Dark moody", "Bright airy"], derived: false },
          surface: { default: "Matte surface", alternatives: ["Glossy", "Textured"], derived: false },
          arrangement: { default: "Centered", alternatives: ["Dynamic angle", "Flat lay"], derived: false },
          camera: { default: "45-degree angle", alternatives: ["Top-down", "Side view"], derived: false },
          lighting: { default: "Soft diffused", alternatives: ["Dramatic side", "Natural window"], derived: false }
        },
        contextual_inputs: []
      };
    }

    return res.status(200).json(parsed);
  } catch (error: any) {
    console.error('ANTHROPIC ERROR in handleStep3Config:', error);
    return res.status(500).json({
      error: error?.message ?? 'Unknown error',
      status: error?.status,
      type: error?.error?.type
    });
  }
}

async function handleFinalPrompt(data: any, res: any) {
  const { lockedConfig, productImages, sceneImages } = data;

  const prompt = `Generate the final prompt based on the locked configuration. Ensure the prompt ends with the verbatim Quality Seal.

Locked Config: ${JSON.stringify(lockedConfig, null, 2)}
Product Images: ${productImages ? productImages.length + ' images' : 'none'}
Scene Images: ${sceneImages ? sceneImages.length + ' images' : 'none'}

Generate the complete prompt following STEP 5 of the SKILL.md specification.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      system: systemPrompt,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const assistantContent = response.content[0]?.text || '';

    return res.status(200).json({ prompt: assistantContent.trim() });
  } catch (error: any) {
    console.error('ANTHROPIC ERROR in handleFinalPrompt:', error);
    return res.status(500).json({
      error: error?.message ?? 'Unknown error',
      status: error?.status,
      type: error?.error?.type
    });
  }
}
