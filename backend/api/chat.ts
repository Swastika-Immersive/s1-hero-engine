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

const QUALITY_SEAL = "Ensure strong subject-background separation, realistic shadows with natural grounding, clean composition with generous breathing space, ultra-realistic materials with accurate reflections, zero noise or clutter. Premium e-commerce, Apple and IKEA catalog quality, professional studio product photography.";

function validateAndNormalizeConfig(config: any): any {
  const normalized = { ...config };
  
  // Ensure required fields exist
  if (!normalized.mode) normalized.mode = 'single';
  if (!normalized.subjects) normalized.subjects = 'product';
  if (!normalized.preset) normalized.preset = 'ikea-minimal';
  
  // Ensure config object exists
  if (!normalized.config || typeof normalized.config !== 'object') {
    normalized.config = {
      background: 'clean studio backdrop',
      surface: 'neutral matte surface',
      arrangement: 'centered hero placement',
      camera: 'eye-level angle',
      lighting: 'soft diffused lighting',
      style: 'ecommerce clean',
      branding: 'off'
    };
  }
  
  // Ensure all config fields exist
  const requiredConfigFields = ['background', 'surface', 'arrangement', 'camera', 'lighting', 'style', 'branding'];
  requiredConfigFields.forEach(field => {
    if (!normalized.config[field]) {
      normalized.config[field] = 'default';
    }
  });
  
  return normalized;
}

function ensureQualitySeal(prompt: string): string {
  if (!prompt.includes(QUALITY_SEAL)) {
    return prompt.trim() + '\n\n' + QUALITY_SEAL;
  }
  return prompt;
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
      
      // Validate and normalize config before processing
      const normalizedConfig = validateAndNormalizeConfig(lockedConfig);
      console.log('Normalized config for final_prompt:', JSON.stringify(normalizedConfig, null, 2));
      
      userMessage = [
        `Phase: final_prompt`,
        ``,
        `CRITICAL: Follow STRICT format rules. No deviations allowed.`,
        ``,
        `MODE: ${normalizedConfig.mode}`,
        ``,
        `If mode=single:`,
        `Output EXACTLY this format (no extra text, no labels, no JSON):`,
        ``,
        `🎨 FINAL PROMPT`,
        ``,
        `[one clean ultra-realistic prompt paragraph using professional product-photography language. Include: subject description, background (${normalizedConfig.config.background}), surface (${normalizedConfig.config.surface}), arrangement (${normalizedConfig.config.arrangement}), camera (${normalizedConfig.config.camera}), lighting (${normalizedConfig.config.lighting}), style (${normalizedConfig.config.style}). No bullet points. No labels.]`,
        ``,
        `${QUALITY_SEAL}`,
        ``,
        `If mode in (consistent, variation, composition):`,
        `Output EXACTLY this format:`,
        ``,
        `🎨 FIXED SYSTEM (LOCKED FOR ALL)`,
        ``,
        `[one paragraph describing shared system: background (${normalizedConfig.config.background}), lighting (${normalizedConfig.config.lighting}), camera (${normalizedConfig.config.camera}), mood (${normalizedConfig.config.style}), branding (${normalizedConfig.config.branding === 'off' ? 'remove all logos and branding' : 'preserve original branding'}), quality rules - ultra-realistic materials, professional studio photography]`,
        ``,
        `INDIVIDUAL INPUT SETS`,
        ``,
        `Set 1 — ${normalizedConfig.subjects}: background=${normalizedConfig.config.background}, surface=${normalizedConfig.config.surface}, arrangement=${normalizedConfig.config.arrangement}, camera=${normalizedConfig.config.camera}, lighting=${normalizedConfig.config.lighting}`,
        ``,
        `PROMPTS`,
        ``,
        `Prompt 1 — ${normalizedConfig.subjects}`,
        ``,
        `[full prompt with subject, background, surface, arrangement, camera, lighting, style details. Professional product photography language.]`,
        ``,
        `${QUALITY_SEAL}`,
        ``,
        `*`,
        ``,
        `CRITICAL RULES:`,
        `- Every prompt MUST end with the Quality Seal verbatim (no paraphrasing)`,
        `- No missing fields from config`,
        `- No undefined values`,
        `- Proper subject insertion`,
        `- Background, lighting, camera, composition always included`,
        `- If productRef=yes: Add "Faithfully replicate the exact product from the reference image with precise geometry, proportions, materials, and surface finish. Product identity must remain unchanged."`,
        `- If sceneRef=yes: Add "Maintain the background, lighting style, and composition inspired by the provided reference image."`,
        `- If branding=off: Add "Remove all logos, text, and branding - keep surface clean and minimal."`,
        `- If branding=on: Add "Preserve all original branding, logos, and product markings exactly as per reference."`,
        ``,
        `Locked Config:`,
        ...Object.entries(normalizedConfig).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`),
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
    let cleanedReply = cleanAIResponse(rawReply);
    
    // For final_prompt phase, ensure Quality Seal is always appended
    if (phase === 'final_prompt' || phase === 'iterate_user' || phase === 'iterate_ai') {
      if (typeof cleanedReply === 'string') {
        cleanedReply = ensureQualitySeal(cleanedReply);
        console.log('Quality Seal ensured in final prompt');
      }
    }
    
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
