import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const config = { maxDuration: 120 };

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
        ``,
        `Return per-subject Step 3 input configurations as STRICT JSON (no markdown, no prose, no code fences).`,
        ``,
        `Mode: ${mode}${variationLevel ? ' (' + variationLevel + ')' : ''}`,
        `Subjects: ${subjects}`,
        `Product Ref: ${productRef}`,
        `Scene Ref: ${sceneRef}`,
        ``,
        `For EACH subject, apply:`,
        `- Category detection (cookware/electronics/lifestyle/tools/decor) per Smart Contextual Input System`,
        `- Material-aware lighting (metal/ceramic/glass/plastic etc) per Material-Aware Lighting rules`,
        `- Camera intelligence by scale and silhouette per Camera Intelligence rules`,
        `- If sceneRef=yes with images attached, derive background/lighting/surface/camera from the image and mark derived=true`,
        ``,
        `Return schema:`,
        `{`,
        `  "shared": {`,
        `    "styleSuggestion": "ikea|luxury|genz|apple",`,
        `    "moodNote": "one-line editorial direction for the set"`,
        `  },`,
        `  "subjects": [`,
        `    {`,
        `      "name": "<subject>",`,
        `      "category": "...",`,
        `      "material": "...",`,
        `      "base_inputs": {`,
        `        "background":  { "default": "...", "alternatives": ["", "", ""], "derived": bool },`,
        `        "surface":     { "default": "...", "alternatives": [...], "derived": bool },`,
        `        "arrangement": { "default": "...", "alternatives": [...], "derived": false },`,
        `        "camera":      { "default": "...", "alternatives": [...], "derived": bool },`,
        `        "lighting":    { "default": "...", "alternatives": [...], "derived": bool }`,
        `      },`,
        `      "contextual_inputs": [ { "key":"", "label":"", "default":"", "alternatives":[] } ]`,
        `    }`,
        `  ]`,
        `}`,
        ``,
        `For Consistent mode: the "shared" block drives the BASE STYLE DNA; per-subject inputs still differ in camera/angle where material demands it.`,
        `For Variation mode: return variationLevel-appropriate alternatives per Variation Architecture.`,
        `For Composition mode: shared scene + per-subject positioning notes.`,
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
        ``,
        `IMPORTANT: Return ONLY the final prompt as plain prose. Do not wrap in JSON. Do not include menus, options, or routing data. The last sentence of your response must be the Quality Seal verbatim: "Ensure strong subject-background separation, realistic shadows with natural grounding, clean composition with generous breathing space, ultra-realistic materials with accurate reflections, zero noise or clutter. Premium e-commerce, Apple and IKEA catalog quality, professional studio product photography."`,
        ``,
        `RENDER per SKILL.md STEP 5.`,
        ``,
        `If mode=single:`,
        `Output exactly:`,
        `🎨 FINAL PROMPT`,
        ``,
        `[one clean ultra-realistic prompt paragraph, professional product-photography language, no bullet points, no labels]`,
        ``,
        `[Quality Seal verbatim]`,
        ``,
        `If mode in (consistent, variation, composition):`,
        `Output exactly:`,
        `🎨 FIXED SYSTEM (LOCKED FOR ALL)`,
        ``,
        `[one paragraph describing background, lighting, camera, mood, branding, quality rules — shared across all images]`,
        ``,
        `INDIVIDUAL INPUT SETS`,
        ``,
        `Set 1 — <subject>: <config summary>`,
        `Set 2 — <subject>: <config summary>`,
        `...`,
        ``,
        `PROMPTS`,
        ``,
        `Prompt 1 — <subject>`,
        ``,
        `[full prompt ending with Quality Seal]`,
        ``,
        `*`,
        ``,
        `Prompt 2 — <subject>`,
        ``,
        `[full prompt ending with Quality Seal]`,
        ``,
        `*`,
        ``,
        `...`,
        ``,
        `Quality Seal (append to every prompt, verbatim, no paraphrasing):`,
        `"Ensure strong subject-background separation, realistic shadows with natural grounding, clean composition with generous breathing space, ultra-realistic materials with accurate reflections, zero noise or clutter. Premium e-commerce, Apple and IKEA catalog quality, professional studio product photography."`,
        ``,
        `Inject image-to-image lock clause if productRef=yes:`,
        `"Faithfully replicate the exact product from the reference image with precise geometry, proportions, materials, and surface finish. Product identity must remain unchanged."`,
        ``,
        `Inject scene reference clause if sceneRef=yes:`,
        `"Maintain the background, lighting style, and composition inspired by the provided reference image."`,
        ``,
        `Inject branding clause based on state.branding (ON=preserve, OFF=remove) per SKILL.md Brand Preservation Toggle.`,
        ``,
        `Locked Config:`,
        ...Object.entries(lockedConfig).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`),
      ].join('\n');
      imageBlocks = [
        ...(productImages || []).map((img: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: stripBase64Prefix(img) } })),
        ...(sceneImages || []).map((img: string) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: stripBase64Prefix(img) } })),
      ];
    } else if (phase === 'ai_suggestion') {
      const { lockedConfig, excludePrevious } = req.body;
      userMessage = [
        `Phase: ai_suggestion`,
        ``,
        `Analyze the current locked config and suggest a single meaningful improvement.`,
        ``,
        `Every regeneration must change at least one of: background, lighting, depth, camera angle, color palette, composition, scene/action.`,
        ``,
        `Suggest in this exact format:`,
        `"I have a suggestion: We can try a [clear visual improvement] to enhance [specific outcome]. Can we try this?"`,
        ``,
        `Example: "I have a suggestion: We can try a darker background with stronger side lighting to improve contrast and make the product stand out more. Can we try this?"`,
        ``,
        `Locked Config:`,
        ...Object.entries(lockedConfig || {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`),
        ``,
        excludePrevious ? `Exclude previous suggestion. Suggest a different angle.` : '',
      ].join('\n');
    } else if (phase === 'iterate_user') {
      const { lockedConfig, userRequest } = req.body;
      if (!userRequest) return res.status(400).json({ error: 'Missing userRequest' });
      userMessage = [
        `Phase: iterate_user`,
        ``,
        `User requested changes: ${userRequest}`,
        ``,
        `Interpret user intent even if vague. Map natural-language changes to system inputs: subject / background / lighting / camera / mood / scene / color / accents.`,
        ``,
        `Update only the relevant parts of the locked config. Keep remaining system consistent unless user implies otherwise.`,
        ``,
        `Every regeneration must change at least one of: background, lighting, depth, camera angle, color palette, composition, scene/action.`,
        ``,
        `Generate the updated prompt per SKILL.md STEP 5 format.`,
        ``,
        `Locked Config:`,
        ...Object.entries(lockedConfig || {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`),
      ].join('\n');
    } else if (phase === 'iterate_ai') {
      const { lockedConfig, suggestion } = req.body;
      if (!suggestion) return res.status(400).json({ error: 'Missing suggestion' });
      userMessage = [
        `Phase: iterate_ai`,
        ``,
        `Apply this AI suggestion and regenerate: ${suggestion}`,
        ``,
        `Every regeneration must change at least one of: background, lighting, depth, camera angle, color palette, composition, scene/action.`,
        ``,
        `Generate the updated prompt per SKILL.md STEP 5 format.`,
        ``,
        `Locked Config:`,
        ...Object.entries(lockedConfig || {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`),
      ].join('\n');
    } else {
      return res.status(400).json({ error: `Unknown phase: ${phase}` });
    }

    const content = imageBlocks.length > 0
      ? [...imageBlocks, { type: 'text', text: userMessage }]
      : userMessage;

    const model = (phase === 'final_prompt' || phase === 'iterate_user' || phase === 'iterate_ai') ? 'claude-opus-4-6' : 'claude-sonnet-4-6';
    const maxTokens = phase === 'final_prompt' ? 4096 : 2048;

    const completion = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
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
