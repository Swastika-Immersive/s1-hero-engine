import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

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
    const { messages } = req.body;

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
  } catch (error: any) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
