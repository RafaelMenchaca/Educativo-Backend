import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a visual search assistant for educational illustrations.

Given a school subject, grade level, topic, and activity description, output 2-3 English keywords to find a relevant educational illustration on Pixabay.

Requirements:
- Keywords must be specific academic/scientific/historical/mathematical visual concepts
- Do NOT use generic terms: education, school, student, teacher, classroom, learning, lesson, study, class
- Think about what the illustration would VISUALLY SHOW — a mathematical graph, a historical battle, a cell diagram, a physics circuit
- Output ONLY the keywords separated by spaces — no punctuation, no explanation, nothing else`;

/**
 * Calls GPT-4o-mini to generate 2-3 precise English image search keywords
 * for the given educational moment context.
 * Returns null on failure so callers can fall back to heuristics.
 */
export async function generateImageQuery({ materia, nivel, tema, actividades }) {
  const lines = [
    `Subject: ${materia || ''}`,
    nivel ? `Grade: ${nivel}` : null,
    `Topic: ${tema || ''}`,
    actividades ? `Activity: ${String(actividades).slice(0, 300)}` : null
  ].filter(Boolean);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: lines.join('\n') + '\n\nKeywords:' }
      ],
      max_tokens: 20,
      temperature: 0.2
    });

    const raw = response.choices[0]?.message?.content?.trim() || '';
    // Strip anything that's not letters or spaces (quotes, commas, etc.)
    const keywords = raw
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    return keywords || null;
  } catch (err) {
    console.warn('[image-query-gpt] Error al generar query:', err?.message || err);
    return null;
  }
}
