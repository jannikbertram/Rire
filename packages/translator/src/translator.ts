import {GoogleGenerativeAI} from '@google/generative-ai';

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
 * Executes an async function with exponential backoff retry logic.
 * Only retries on rate-limiting errors (429, Resource exhausted, quota).
 * @param function_ - The async function to execute
 * @param maxAttempts - Maximum number of total attempts (default: 3)
 * @param baseDelayMs - Base delay in milliseconds for exponential backoff (default: 2000)
 * @returns The result of the function if successful
 * @throws RateLimitError if rate limit errors persist after all retry attempts
 * @throws The original error immediately if it's a non-rate-limiting error
 */
async function withRetry<T>(
	function_: () => Promise<T>,
	maxAttempts = 3,
	baseDelayMs = 2000,
): Promise<T> {
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			// eslint-disable-next-line no-await-in-loop
			return await function_();
		} catch (error) {
			const isRateLimited = error instanceof Error
				&& (error.message.includes('429')
					|| error.message.includes('Resource exhausted')
					|| error.message.includes('quota'));

			// Non-rate-limit errors are thrown immediately
			if (!isRateLimited) {
				throw error;
			}

			// If this was the last attempt, throw a specific rate limit error
			if (attempt === maxAttempts - 1) {
				throw new RateLimitError();
			}

			// Exponential backoff: 2s, 4s, 8s
			const delay = baseDelayMs * (2 ** attempt);
			// eslint-disable-next-line no-await-in-loop
			await new Promise<void>(resolve => {
				setTimeout(resolve, delay);
			});
		}
	}

	// This should never be reached due to the loop logic, but TypeScript needs it
	throw new RateLimitError();
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
	 * The translation provider to use. Currently only 'gemini' is supported.
	 */
	provider: 'gemini';

	/**
	 * The specific model to use for translation.
	 * @example 'gemini-2.0-flash', 'gemini-1.5-pro'
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
	 * Optional custom AI client for testing or alternative implementations.
	 * When provided, bypasses the default GoogleGenerativeAI client.
	 * @internal Primarily used for testing with mock implementations.
	 */
	genAiClient?: {
		getGenerativeModel: (options: {model: string}) => {
			generateContent: (prompt: string) => Promise<{
				response: {
					text: () => string;
				};
			}>;
		};
	};
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
export async function translateMessages(options: TranslateOptions): Promise<Record<string, string>> {
	const {
		messages,
		targetLanguage,
		context,
		apiKey,
		model: modelName,
		onProgress,
		genAiClient,
	} = options;

	const genAi = genAiClient ?? new GoogleGenerativeAI(apiKey);
	const model = genAi.getGenerativeModel({model: modelName});

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
		const result = await withRetry(async () => model.generateContent(prompt));
		const response = result.response.text();

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
