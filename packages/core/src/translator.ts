import {
	generateText, streamText, Output, type LanguageModel,
} from 'ai';
import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {createOpenAI} from '@ai-sdk/openai';
import {createAnthropic} from '@ai-sdk/anthropic';
import {z} from 'zod';
import {
	TRANSLATION_BATCH_SIZE, REVISION_BATCH_SIZE, REVISION_ERROR_TYPES, type RevisionErrorType,
} from './consts.js';
import {
	buildSystemPrompt, buildTranslationPrompt, buildRevisionSystemPrompt, buildRevisionPrompt,
	buildAdviseWebsitePrompt,
} from './prompts.js';

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
 * Messages are processed in batches of 10 for efficiency. Uses structured output
 * to guarantee valid JSON responses from the AI model.
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
 *   apiKey: process.env.GOOGLE_API_KEY,
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

	const systemPrompt = buildSystemPrompt(targetLanguage, context);

	let processed = 0;
	for (let i = 0; i < entries.length; i += TRANSLATION_BATCH_SIZE) {
		const batch = entries.slice(i, i + TRANSLATION_BATCH_SIZE);

		const prompt = buildTranslationPrompt(systemPrompt, batch);

		// Schema for structured output: record of string keys to string values
		const translationSchema = z.record(z.string(), z.string().describe('Translated text'));

		// eslint-disable-next-line no-await-in-loop
		const result = await generateText({
			model,
			prompt,
			output: Output.object({schema: translationSchema}),
		});

		// Add translated messages to result
		if (result.output) {
			const batchTranslated = result.output;
			for (const [key, value] of Object.entries(batchTranslated)) {
				translated[key] = value;
			}
		}

		processed += batch.length;
		onProgress?.(processed, total);
	}

	return translated;
}

/**
 * A single revision suggestion for a message.
 */
export type RevisionSuggestion = {
	/** The message key that has an issue */
	key: string;
	/** Short description of where on the page the issue is found (advise only) */
	section?: string | undefined;
	/** How important this fix is (advise only) */
	severity?: 'high' | 'medium' | 'low' | 'very low' | undefined;
	/** The original message text */
	original: string;
	/** The suggested replacement text */
	suggested: string;
	/** Brief explanation of why this change is suggested */
	reason: string;
	/** The type/severity of the issue */
	type: RevisionErrorType;
};

/**
 * Configuration options for the revision function.
 */
export type ReviseOptions = {
	/**
	 * Key-value pairs of message IDs to their text content.
	 */
	messages: Record<string, string>;

	/**
	 * Error types to check for. Defaults to ['grammar'] if not specified.
	 */
	errorTypes: RevisionErrorType[];

	/**
	 * Product or application context to help the AI make better suggestions.
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
	 * The specific model to use for revision.
	 */
	model: string;

	/**
	 * Optional callback to report revision progress.
	 * Called after each batch of messages is analyzed.
	 * @param current - Number of messages analyzed so far
	 * @param total - Total number of messages to analyze
	 */
	onProgress?: (current: number, total: number) => void;

	/**
	 * Optional custom AI model for testing.
	 * @internal
	 */
	aiModel?: LanguageModel;
};

/**
 * Analyzes a collection of messages for grammar, wording, and phrasing issues.
 *
 * Messages are processed in batches of 100 for efficiency. Uses structured output
 * to guarantee valid JSON responses from the AI model.
 *
 * @param options - Configuration options for the revision
 * @returns A promise resolving to an array of revision suggestions
 *
 * @example
 * ```ts
 * const suggestions = await reviseMessages({
 *   messages: { greeting: 'Hello there friend' },
 *   errorTypes: ['grammar', 'wording'],
 *   context: 'A professional business application',
 *   apiKey: process.env.GOOGLE_API_KEY,
 *   provider: 'gemini',
 *   model: 'gemini-2.0-flash',
 *   onProgress: (current, total) => console.log(`${current}/${total}`),
 * });
 * ```
 */
export async function reviseMessages({
	messages,
	errorTypes,
	context,
	apiKey,
	provider,
	model: modelName,
	onProgress,
	aiModel,
}: ReviseOptions): Promise<RevisionSuggestion[]> {
	const model = aiModel ?? createModel(provider, modelName, apiKey);

	const entries = Object.entries(messages);
	const total = entries.length;
	const suggestions: RevisionSuggestion[] = [];

	const systemPrompt = buildRevisionSystemPrompt(errorTypes, context);

	// Schema for structured output: array of revision suggestions
	const suggestionSchema = z.object({
		key: z.string().describe('The message key'),
		original: z.string().describe('The original text'),
		suggested: z.string().describe('The suggested replacement'),
		reason: z.string().describe('Brief explanation for the suggestion'),
		type: z.enum(Object.keys(REVISION_ERROR_TYPES) as [RevisionErrorType, ...RevisionErrorType[]]).describe('The type of issue'),
	});

	const revisionsSchema = z.array(suggestionSchema);

	let processed = 0;
	for (let i = 0; i < entries.length; i += REVISION_BATCH_SIZE) {
		const batch = entries.slice(i, i + REVISION_BATCH_SIZE);

		const prompt = buildRevisionPrompt(systemPrompt, batch);

		// eslint-disable-next-line no-await-in-loop
		const result = await generateText({
			model,
			prompt,
			output: Output.object({schema: revisionsSchema}),
		});

		// Add suggestions from this batch
		if (result.output && Array.isArray(result.output)) {
			for (const suggestion of result.output) {
				suggestions.push(suggestion as RevisionSuggestion);
			}
		}

		processed += batch.length;
		onProgress?.(processed, total);
	}

	return suggestions;
}

/**
 * Configuration options for the advise function.
 */
export type AdviseOptions = {
	/**
	 * The URL of the website to analyze.
	 */
	websiteUrl: string;

	/**
	 * Error types to check for.
	 */
	errorTypes: RevisionErrorType[];

	/**
	 * API key for authentication with Google.
	 */
	apiKey: string;

	/**
	 * The specific Gemini model to use.
	 */
	model: string;
};

/**
 * Analyzes a website for grammar, wording, and phrasing issues using Gemini's URL context tool.
 *
 * The model visits the website directly and analyzes its content, eliminating the need
 * for manual crawling and DOM extraction.
 *
 * @param options - Configuration options for the analysis
 * @returns A promise resolving to an array of revision suggestions
 */
export async function adviseWebsite({
	websiteUrl,
	errorTypes,
	apiKey,
	model: modelName,
}: AdviseOptions): Promise<RevisionSuggestion[]> {
	const google = createGoogleGenerativeAI({apiKey});
	const model = google(modelName);

	const prompt = buildAdviseWebsitePrompt(errorTypes, websiteUrl);

	const result = await generateText({
		model,
		prompt,
		tools: {
			url_context: google.tools.urlContext({}),
		},
	});

	const suggestionSchema = z.array(z.object({
		key: z.string(),
		section: z.string().optional(),
		original: z.string(),
		suggested: z.string(),
		reason: z.string(),
		type: z.enum(Object.keys(REVISION_ERROR_TYPES) as [RevisionErrorType, ...RevisionErrorType[]]),
		severity: z.enum(['high', 'medium', 'low', 'very low']).optional(),
	}));

	const jsonMatch = /\[[\s\S]*]/.exec(result.text);
	if (!jsonMatch) {
		return [];
	}

	const parsed = suggestionSchema.safeParse(JSON.parse(jsonMatch[0]));
	return parsed.success ? parsed.data : [];
}

function tryParseJson(text: string): unknown {
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return undefined;
	}
}

/**
 * Incrementally parses a streaming JSON array, yielding each complete object as it appears.
 * Handles strings with escaped characters and nested objects correctly.
 */
async function * parseStreamingJsonArray(textStream: AsyncIterable<string>): AsyncGenerator {
	let inArray = false;
	let depth = 0;
	let inString = false;
	let escaped = false;
	let currentObject = '';

	for await (const chunk of textStream) {
		for (const char of chunk) {
			if (escaped) {
				escaped = false;
				if (depth > 0) {
					currentObject += char;
				}

				continue;
			}

			if (char === '\\' && inString) {
				escaped = true;
				if (depth > 0) {
					currentObject += char;
				}

				continue;
			}

			if (char === '"') {
				inString = !inString;
				if (depth > 0) {
					currentObject += char;
				}

				continue;
			}

			if (inString) {
				if (depth > 0) {
					currentObject += char;
				}

				continue;
			}

			if (char === '[' && !inArray) {
				inArray = true;
				continue;
			}

			if (!inArray) {
				continue;
			}

			if (char === '{') {
				depth++;
				currentObject += char;
				continue;
			}

			if (char === '}') {
				depth--;
				currentObject += char;
				if (depth !== 0) {
					continue;
				}

				const parsed = tryParseJson(currentObject);
				if (parsed !== undefined) {
					yield parsed;
				}

				currentObject = '';
				continue;
			}

			if (depth > 0) {
				currentObject += char;
			}
		}
	}
}

/**
 * Streaming version of adviseWebsite that yields individual suggestions as they're generated.
 *
 * Uses streaming text generation and incremental JSON parsing to emit suggestions
 * one at a time, enabling progressive UI updates.
 *
 * @param options - Configuration options for the analysis
 * @returns An async generator yielding individual revision suggestions
 */
export async function * adviseWebsiteStream({
	websiteUrl,
	errorTypes,
	apiKey,
	model: modelName,
}: AdviseOptions): AsyncGenerator<RevisionSuggestion> {
	const google = createGoogleGenerativeAI({apiKey});
	const model = google(modelName);

	const prompt = buildAdviseWebsitePrompt(errorTypes, websiteUrl);

	const result = streamText({
		model,
		prompt,
		tools: {
			url_context: google.tools.urlContext({}),
		},
	});

	const suggestionSchema = z.object({
		key: z.string(),
		section: z.string().optional(),
		original: z.string(),
		suggested: z.string(),
		reason: z.string(),
		type: z.enum(Object.keys(REVISION_ERROR_TYPES) as [RevisionErrorType, ...RevisionErrorType[]]),
		severity: z.enum(['high', 'medium', 'low', 'very low']).optional(),
	});

	for await (const object of parseStreamingJsonArray(result.textStream)) {
		const parsed = suggestionSchema.safeParse(object);
		if (parsed.success) {
			yield parsed.data;
		}
	}
}
