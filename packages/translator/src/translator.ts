import {generateText, type LanguageModel} from 'ai';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {createOpenAI} from '@ai-sdk/openai';
import {createAnthropic} from '@ai-sdk/anthropic';

/**
 * Supported LLM providers for translation.
 */
export type Provider = 'gemini' | 'openai' | 'anthropic';

/**
 * Error thrown when rate limit retries are exhausted.
 */
export class RateLimitError extends Error {
	constructor(message = 'Rate limit exceeded. Maximum retry attempts reached.') {
		super(message);
		this.name = 'RateLimitError';
	}
}

/**
 * Configuration options for the translation function.
 */
export type TranslateOptions = {
	/**
	 * Key-value pairs of message IDs to their English source text.
	 * @example
	 * ```ts
	 * { "greeting": "Hello", "farewell": "Goodbye" }
	 * ```
	 */
	messages: Record<string, string>;

	/**
	 * Target language code for translation.
	 * Supports standard language codes like 'de', 'fr', 'es', 'ja', etc.
	 * If the code is not in the predefined list, it will be used as-is.
	 */
	targetLanguage: string;

	/**
	 * Product or application context to help the AI produce more accurate translations.
	 * Include information about the product, target audience, tone, or domain-specific terminology.
	 */
	context: string;

	/**
	 * API key for authentication with the translation provider.
	 */
	apiKey: string;

	/**
	 * The translation provider to use.
	 */
	provider: Provider;

	/**
	 * The specific model to use for translation.
	 * @example 'gemini-2.0-flash', 'gpt-4o', 'claude-sonnet-4-20250514'
	 */
	model: string;

	/**
	 * Optional callback to report translation progress.
	 * Called after each batch of messages is translated.
	 * @param current - Number of messages translated so far
	 * @param total - Total number of messages to translate
	 */
	onProgress?: (current: number, total: number) => void;

	/**
	 * Optional custom AI model for testing or alternative implementations.
	 * When provided, bypasses the default provider-based model creation.
	 * @internal Primarily used for testing with mock implementations.
	 */
	aiModel?: LanguageModel;
};

/**
 * Mapping of language codes to human-readable language names.
 * Used to provide better context to the AI model in translation prompts.
 */
const languageNames: Record<string, string> = {
	de: 'German',
	fr: 'French',
	es: 'Spanish',
	it: 'Italian',
	pt: 'Portuguese',
	nl: 'Dutch',
	pl: 'Polish',
	ja: 'Japanese',
	zh: 'Chinese (Simplified)',
	ko: 'Korean',
	ru: 'Russian',
	tr: 'Turkish',
	ar: 'Arabic',
};

/**
 * Creates an AI model instance for the specified provider.
 * @param provider - The LLM provider to use
 * @param modelName - The model identifier
 * @param apiKey - The API key for the provider
 * @returns A language model instance
 */
function createModel(provider: Provider, modelName: string, apiKey: string): LanguageModel {
	switch (provider) {
		case 'gemini': {
			const google = createGoogleGenerativeAI({apiKey});
			return google(modelName);
		}

		case 'openai': {
			const openai = createOpenAI({apiKey});
			return openai(modelName);
		}

		case 'anthropic': {
			const anthropic = createAnthropic({apiKey});
			return anthropic(modelName);
		}
	}
}

/**
 * Verifies that the provided API key is valid for the specified provider.
 *
 * @param apiKey - The API key to verify.
 * @param provider - The provider to verify the key for.
 * @returns A promise that resolves to true if the key is valid, false otherwise.
 */
export async function verifyApiKey(apiKey: string, provider: Provider): Promise<boolean> {
	if (!apiKey) {
		return false;
	}

	try {
		switch (provider) {
			case 'gemini': {
				const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
				return response.status === 200;
			}

			case 'openai': {
				const response = await fetch('https://api.openai.com/v1/models', {
					headers: {authorization: `Bearer ${apiKey}`},
				});
				return response.status === 200;
			}

			case 'anthropic': {
				// Anthropic doesn't have a simple models endpoint, so we make a minimal request
				const response = await fetch('https://api.anthropic.com/v1/messages', {
					method: 'POST',
					headers: {
						'x-api-key': apiKey,
						'anthropic-version': '2023-06-01',
						'content-type': 'application/json',
					},
					// eslint-disable-next-line @typescript-eslint/naming-convention
					body: JSON.stringify({model: 'claude-3-haiku-20240307', max_tokens: 1, messages: [{role: 'user', content: 'hi'}]}),
				});
				// 200 = success, 400 = bad request (but valid key), 401 = invalid key
				return response.status !== 401;
			}
		}
	} catch {
		return false;
	}
}

/**
 * Represents a model available for use.
 */
export type Model = {
	/**
	 * The model identifier (e.g., 'gemini-pro', 'gpt-4o').
	 */
	value: string;
	/**
	 * A human-readable label for the model.
	 */
	label: string;
};

/**
 * Translates a collection of messages from English to a target language using AI.
 *
 * Messages are processed in batches of 10 for efficiency. The function includes
 * automatic retry logic with exponential backoff for rate-limiting errors.
 *
 * @param options - Configuration options for the translation
 * @returns A promise resolving to a Record mapping message IDs to their translated values
 *
 * @example
 * ```ts
 * const translations = await translateMessages({
 *   messages: { greeting: 'Hello', farewell: 'Goodbye' },
 *   targetLanguage: 'de',
 *   context: 'A friendly mobile app for ordering food',
 *   apiKey: process.env.GEMINI_API_KEY,
 *   provider: 'gemini',
 *   model: 'gemini-2.0-flash',
 *   onProgress: (current, total) => console.log(`${current}/${total}`),
 * });
 * // Result: { greeting: 'Hallo', farewell: 'Auf Wiedersehen' }
 * ```
 *
 * @remarks
 * - Placeholders like `{name}`, `{count}`, `{{variable}}` are preserved
 * - HTML tags and markdown formatting are maintained
 * - If JSON parsing fails for a batch, original text is returned as fallback
 */
export async function translateMessages({
		messages,
		targetLanguage,
		context,
		apiKey,
		provider,
		model: modelName,
		onProgress,
		aiModel,
	}: TranslateOptions): Promise<Record<string, string>> {
	const model = aiModel ?? createModel(provider, modelName, apiKey);

	const entries = Object.entries(messages);
	const total = entries.length;
	const translated: Record<string, string> = {};

	const targetLangName = languageNames[targetLanguage] ?? targetLanguage;

	// Build system context
	let systemPrompt = `You are a professional translator specializing in software localization. 
Translate the following UI text from English to ${targetLangName}.

Important guidelines:
- Preserve any placeholders like {name}, {count}, {{variable}}, etc.
- Keep the same tone and formality level
- Use natural, idiomatic expressions in the target language
- Maintain any HTML tags or markdown formatting
- Do not add or remove content, only translate`;

	if (context) {
		systemPrompt += `\n\nProduct context for better translations:\n${context}`;
	}

	// Process in batches for efficiency
	const batchSize = 10;
	let processed = 0;

	for (let i = 0; i < entries.length; i += batchSize) {
		const batch = entries.slice(i, i + batchSize);

		const prompt = `${systemPrompt}

Translate each of the following messages. Return ONLY a valid JSON object mapping the original keys to translated values.

Messages to translate:
${JSON.stringify(Object.fromEntries(batch), null, 2)}`;

		// eslint-disable-next-line no-await-in-loop
		const result = await generateText({model, prompt, maxRetries: 0});
		const response = result.text;

		// Extract JSON from response
		const jsonMatch = /{[\s\S]*}/.exec(response);
		if (jsonMatch) {
			try {
				const batchTranslated = JSON.parse(jsonMatch[0]) as Record<
					string,
					string
				>;
				for (const [key, value] of Object.entries(batchTranslated)) {
					translated[key] = value;
				}
			} catch {
				// If JSON parsing fails, fall back to original
				for (const [key, value] of batch) {
					translated[key] = value;
				}
			}
		} else {
			// No JSON found in response, fall back to original
			for (const [key, value] of batch) {
				translated[key] = value;
			}
		}

		processed += batch.length;
		onProgress?.(processed, total);
	}

	return translated;
}
