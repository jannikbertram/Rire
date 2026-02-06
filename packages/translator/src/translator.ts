import {GoogleGenerativeAI} from '@google/generative-ai';

async function withRetry<T>(
	function_: () => Promise<T>,
	maxRetries = 3,
	baseDelayMs = 2000,
): Promise<T> {
	let lastError: Error = new Error('Max retries exceeded');

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			// eslint-disable-next-line no-await-in-loop
			return await function_();
		} catch (error) {
			lastError = error as Error;
			const isRateLimited
				= error instanceof Error
				&& (error.message.includes('429')
					|| error.message.includes('Resource exhausted')
					|| error.message.includes('quota'));

			if (!isRateLimited || attempt === maxRetries) {
				throw error;
			}

			// Exponential backoff: 2s, 4s, 8s
			const delay = baseDelayMs * (2 ** attempt);
			// eslint-disable-next-line no-await-in-loop
			await new Promise<void>(resolve => {
				setTimeout(resolve, delay);
			});
		}
	}

	throw lastError;
}

export type TranslateOptions = {
	messages: Record<string, string>;
	targetLanguage: string;
	context: string;
	apiKey: string;
	provider: 'gemini';
	model: string;
	onProgress?: (current: number, total: number) => void;
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

export async function translateMessages(
	options: TranslateOptions,
): Promise<Record<string, string>> {
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
