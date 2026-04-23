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

function stripBase64Prefix(s: any) {
  return typeof s === 'string' ? s.replace(/^data:image\/\w+;base64,/, '') : s;
}

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  console.log('=== INCOMING REQUEST ===');
  console.log('Method:', req.method);
  console.log('Body keys:', Object.keys(req.body || {}));
  console.log('Body:', JSON.stringify(req.body, null, 2).slice(0, 2000));

  try {
    const { phase } = req.body || {};
    if (!phase) return res.status(400).json({ error: "Missing 'phase' in request body" });

    let userMessage = '';
    let imageBlocks: any[] = [];

    if (phase === 'step3_config') {
      const { mode, variationLevel, subjects, productRef, sceneRef, sceneImages } = req.body;
      userMessage = [
        `Phase: step3_config`,
        `Mode: ${mode}${variationLevel ? ' (' + variationLevel + ')' : ''}`,
        `Subjects: ${subjects}`,
        `Product Ref: ${productRef}`,
        `Scene Ref: ${sceneRef}`,
        ``,
        `Return STRICT JSON only (no markdown, no prose) matching:`,
        `{ "category": "...", "base_inputs": { "background": { "default":"","alternatives":[],"derived":false }, "surface": {...}, "arrangement": {...}, "camera": {...}, "lighting": {...} }, "contextual_inputs": [ { "key":"","label":"","default":"","alternatives":[] } ] }`,
      ].join('\n');
      imageBlocks = (sceneImages || []).map((img: string) => ({
        type: 'image',
        source: { type: 'base64', media_type: 'image/png', data: stripBase64Prefix(img) },
      }));
    } else if (phase === 'final_prompt') {
      const { lockedConfig, productImages, sceneImages } = req.body;
      if (!lockedConfig) return res.status(400).json({ error: 'Missing lockedConfig' });
      userMessage = [
        `Phase: final_prompt`,
        `The user has confirmed this locked config at STEP 4. Generate the final prompt per SKILL.md STEP 5.`,
        `Close with the Quality Seal verbatim.`,
        ``,
        ...Object.entries(lockedConfig).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`),
      ].join('\n');
      imageBlocks = [
        ...(productImages || []).map((img: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: stripBase64Prefix(img) } })),
        ...(sceneImages || []).map((img: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: stripBase64Prefix(img) } })),
      ];
    } else {
      return res.status(400).json({ error: `Unknown phase: ${phase}` });
    }

    const content = imageBlocks.length > 0
      ? [...imageBlocks, { type: 'text', text: userMessage }]
      : userMessage;

    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    });

    const reply = completion.content[0].type === 'text' ? completion.content[0].text : '';
    return res.status(200).json({ reply });
  } catch (err: any) {
    console.error('BACKEND CRASH:', err);
    return res.status(500).json({
      error: err?.message || 'Unknown error',
      status: err?.status,
      type: err?.error?.type,
      stack: err?.stack?.split('\n').slice(0, 3).join(' | '),
    });
  }
}
