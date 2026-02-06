import { LANGUAGE_NAMES } from "./consts.js";

/**
 * Builds the system prompt for translation.
 * @param targetLanguage - The target language code
 * @param context - Optional product context
 * @returns The system prompt string
 */
export function buildSystemPrompt(targetLanguage: string, context: string): string {
	const targetLangName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;

	let prompt = `You are a professional translator specializing in software localization. 
Translate the following UI text from English to ${targetLangName}.

Important guidelines:
- Preserve any placeholders like {name}, {count}, {{variable}}, etc.
- Keep the same tone and formality level
- Use natural, idiomatic expressions in the target language
- Maintain any HTML tags or markdown formatting
- Do not add or remove content, only translate`;

	if (context) {
		prompt += `\n\nProduct context for better translations:\n${context}`;
	}

	return prompt;
}

/**
 * Builds the full translation prompt for a batch of messages.
 * @param systemPrompt - The system prompt from buildSystemPrompt
 * @param batch - Array of [key, value] entries to translate
 * @returns The complete prompt string
 */
export function buildTranslationPrompt(systemPrompt: string, batch: Array<[string, string]>): string {
	return `${systemPrompt}

Translate each of the following messages:

${JSON.stringify(Object.fromEntries(batch), null, 2)}`;
}
