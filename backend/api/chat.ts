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

function cleanAIResponse(reply: string): any {
  // If reply is not a string, return as-is
  if (typeof reply !== 'string') {
    return reply;
  }

  // Strip markdown code blocks
  let cleaned = reply.replace(/```json\s*\n?/gi, '').replace(/```\s*\n?/gi, '').trim();
  
  // Try to parse as JSON
  try {
    const parsed = JSON.parse(cleaned);
    console.log('Successfully parsed AI response as JSON');
    
    // Enforce exactly 2 alternatives per input
    if (parsed.inputs && Array.isArray(parsed.inputs)) {
      parsed.inputs = parsed.inputs.map((input: any) => {
        if (!input.alternatives || !Array.isArray(input.alternatives)) {
          input.alternatives = [];
        }
        
        // Trim to 2 if more
        if (input.alternatives.length > 2) {
          console.log(`Trimming alternatives from ${input.alternatives.length} to 2 for ${input.label}`);
          input.alternatives = [input.alternatives[0], input.alternatives[input.alternatives.length - 1]];
        }
        
        // Auto-generate if fewer than 2
        if (input.alternatives.length < 2) {
          console.log(`Auto-generating alternatives for ${input.label} (currently ${input.alternatives.length})`);
          const defaults = ['Alternative 1', 'Alternative 2'];
          if (input.alternatives.length === 0) {
            input.alternatives = defaults;
          } else {
            input.alternatives.push(defaults[0]);
          }
        }
        
        return input;
      });
    }
    
    return parsed;
  } catch (e) {
    console.log('Could not parse as JSON, returning as string');
    // If not valid JSON, return the cleaned string
    return cleaned;
  }
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
        `You are acting as a senior product-photography art director. For the subject(s) provided, produce SUBJECT-SPECIFIC, rich defaults and alternatives for each input (Background, Surface, Arrangement, Camera, Lighting, Style Preset, Branding, plus 1–2 category-relevant contextual inputs from the Smart Contextual Input System).`,
        ``,
        `Rules:`,
        ``,
        `Each default must be a full descriptive phrase (8–18 words), not a one-word dropdown value. Example for a ceramic mug: 'Soft warm off-white textured backdrop with subtle gradient falloff' — not 'Clean studio'.`,
        `Each alternative must be equally specific and visually distinct from the default.`,
        `Surface defaults should honor the seamless background-surface merge rule unless the subject demands a real surface (wood, marble, linen).`,
        `Camera defaults come from Camera Intelligence by scale (style-engine.md): small tabletop → 15° elevated front-three-quarter, deep vessels → side profile, flat products → top-down, vertical subjects → side profile or 15°, large items → low hero angle.`,
        `Lighting defaults come from Material-Aware Lighting rules: metal → specular with rim, ceramic → soft glaze sheen, glass → back-lit with crisp rim, fabric → diffused with weave emphasis, etc.`,
        `For multi-subject modes (Consistent / Variation / One Composition), tailor each subject's defaults to that subject's material and scale. Do NOT give all subjects the same inputs.`,
        `Hide Food input for electronics, mobility, tools, gadgets, decor, fashion.`,
        ``,
        `Mode: ${mode}${variationLevel ? ' (' + variationLevel + ')' : ''}`,
        `Subjects: ${subjects}`,
        `Product Ref: ${productRef}`,
        `Scene Ref: ${sceneRef}`,
        ``,
        `If sceneRef=yes with images attached, derive background/lighting/surface/camera from the image.`,
        ``,
        `Return JSON in this exact shape:`,
        `{ inputs: [{ label, default, alternatives: [a, b, c] }, ...] }`,
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

    const rawReply = completion.content[0].type === 'text' ? completion.content[0].text : '';
    
    // Clean and normalize the AI response
    const cleanedReply = cleanAIResponse(rawReply);
    
    console.log('=== BACKEND RESPONSE CLEANING ===');
    console.log('Raw reply length:', rawReply.length);
    console.log('Cleaned reply type:', typeof cleanedReply);
    
    return res.status(200).json({ reply: cleanedReply });
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
