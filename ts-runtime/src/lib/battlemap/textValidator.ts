/**
 * Vision-based text detection for generated battlemaps.
 *
 * Uses a lightweight GPT-4o-mini vision call to detect any readable text,
 * legends, labels, watermarks, or UI overlays in the generated image.
 * Returns a structured result used by the retry loop in service.ts.
 */

type JsonRecord = Record<string, unknown>

export type TextValidationResult = {
  /** Whether any text was detected in the image. */
  containsText: boolean
  /** Brief explanation of what was found (empty when clean). */
  explanation: string
  /** Confidence 0–1 in the detection. */
  confidence: number
  /** Time taken for the validation call in ms. */
  validationMs: number
  /**
   * Set when the validator itself encountered an error (HTTP failure, timeout,
   * non-JSON response, etc.). Callers must not treat this as a clean pass.
   * The value is a short description of what went wrong.
   */
  validationError?: string
}

export type TextValidationConfig = {
  /** OpenAI API key. */
  apiKey: string
  /** Vision model to use (default: gpt-4o-mini). */
  model?: string
  /** Request timeout in ms (default: 15000). */
  timeoutMs?: number
}

const TEXT_DETECTION_PROMPT = [
  'You are a strict quality-control inspector for top-down tactical battlemaps.',
  'Examine this image and determine if it contains ANY readable text or text-like elements.',
  '',
  'Flag as CONTAINS_TEXT if you see ANY of:',
  '- Labels, titles, or headings',
  '- Legend or key boxes',
  '- Compass rose with letters (N, S, E, W)',
  '- Scale bar text or distance markers',
  '- Watermarks, signatures, or credits',
  '- Coordinate numbers or grid labels',
  '- Room numbers or area labels',
  '- Banners, signs, or plaques with writing',
  '- Any readable letters, words, or numbers',
  '- UI-like overlays or frames with text',
  '',
  'Do NOT flag:',
  '- Purely decorative rune-like patterns that are not readable',
  '- Texture artifacts that vaguely resemble letters',
  '- Grid lines without labels',
  '',
  'Return strict JSON: {"contains_text": boolean, "explanation": "brief description of what was found or empty string if clean", "confidence": number between 0 and 1}',
].join('\n')

export async function validateNoText(
  imageUrl: string,
  config: TextValidationConfig,
): Promise<TextValidationResult> {
  const model = config.model ?? 'gpt-4o-mini'
  const timeoutMs = config.timeoutMs ?? 15_000
  const started = Date.now()

  const controller = new AbortController()
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)

  type OpenAiChatResponse = {
    choices?: Array<{ message?: { content?: string } }>
  }

  let response: OpenAiChatResponse
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'Return only valid JSON.' },
          {
            role: 'user',
            content: [
              { type: 'text', text: TEXT_DETECTION_PROMPT },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const errorDesc = `HTTP ${res.status}`
      console.warn(`[textValidator] OpenAI ${errorDesc}: ${text.slice(0, 200)}`)
      return {
        containsText: true,
        explanation: '',
        confidence: 0,
        validationMs: Date.now() - started,
        validationError: errorDesc,
      }
    }

    response = (await res.json()) as OpenAiChatResponse
  } catch (error) {
    const errorDesc = error instanceof Error ? error.message : String(error)
    console.warn(`[textValidator] Request failed: ${errorDesc}`)
    return {
      containsText: true,
      explanation: '',
      confidence: 0,
      validationMs: Date.now() - started,
      validationError: errorDesc,
    }
  } finally {
    clearTimeout(timeoutHandle)
  }

  const rawContent = response.choices?.[0]?.message?.content
  if (!rawContent || typeof rawContent !== 'string') {
    return {
      containsText: true,
      explanation: '',
      confidence: 0,
      validationMs: Date.now() - started,
      validationError: 'empty response from model',
    }
  }

  let parsed: JsonRecord | null = null
  try {
    const obj = JSON.parse(rawContent)
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      parsed = obj as JsonRecord
    }
  } catch {
    // non-JSON response — fall through to the error return below
  }

  if (!parsed) {
    return {
      containsText: true,
      explanation: '',
      confidence: 0,
      validationMs: Date.now() - started,
      validationError: 'non-JSON response from model',
    }
  }

  const containsText = parsed.contains_text === true
  const explanation = typeof parsed.explanation === 'string' ? parsed.explanation : ''
  const rawConfidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0
  const confidence = Math.max(0, Math.min(1, rawConfidence))

  return {
    containsText,
    explanation,
    confidence,
    validationMs: Date.now() - started,
  }
}
