import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import type {LanguageModel} from 'ai';
import {
	translateMessages,
	verifyApiKey,
} from '../src/index.js';

const fixturesPath = path.join(process.cwd(), 'test', 'fixtures');
const enJson = JSON.parse(fs.readFileSync(path.join(fixturesPath, 'en.json'), 'utf8')) as Record<string, string>;

// Original mock fetch
const originalFetch = globalThis.fetch;

test.after(() => {
	globalThis.fetch = originalFetch;
});

/** Prompt content type for mock model */
type PromptContent = {type: string; text?: string};
type PromptPart = {role: string; content: string | PromptContent[]};

/**
 * Extracts prompt text from the AI SDK options structure.
 */
function extractPromptText(options: unknown): string {
	const typedOptions = options as {prompt: PromptPart[]};
	return typedOptions.prompt
		.map(p => {
			if (typeof p.content === 'string') {
				return p.content;
			}

			return p.content
				.filter((c): c is {type: string; text: string} => 'text' in c)
				.map(c => c.text)
				.join('');
		})
		.join('');
}

/**
 * Creates a mock AI model for testing.
 * Uses type coercion since we're testing translation logic, not AI SDK compliance.
 * @param responseHandler - Function that returns the mocked response text
 */
function createMockModel(responseHandler: (prompt: string) => string): LanguageModel {
	return {
		specificationVersion: 'v3',
		provider: 'mock',
		modelId: 'mock-model',
		supportedUrls: {},
		async doGenerate(options: unknown) {
			const promptText = extractPromptText(options);
			const text = responseHandler(promptText);
			return {
				content: [{type: 'text', text}],
				finishReason: {unified: 'stop', raw: undefined},
				usage: {
					inputTokens: {total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined},
					outputTokens: {total: 10, text: undefined, reasoning: undefined},
				},
				rawCall: {rawPrompt: '', rawSettings: {}},
				warnings: [],
			};
		},
		async doStream() {
			throw new Error('Not implemented');
		},
	} as unknown as LanguageModel;
}

/**
 * Creates a mock model that fails a specified number of times before succeeding.
 * @param failuresBeforeSuccess - Number of times to fail before returning success
 * @param successResponse - The successful response text
 * @param errorMessage - The error message for failures
 */
function createRetryMockModel(
	failuresBeforeSuccess: number,
	successResponse: string,
	errorMessage: string,
) {
	let callCount = 0;
	const model = {
		specificationVersion: 'v3',
		provider: 'mock',
		modelId: 'mock-model',
		supportedUrls: {},
		async doGenerate() {
			callCount++;
			if (callCount <= failuresBeforeSuccess) {
				throw new Error(errorMessage);
			}

			return {
				content: [{type: 'text', text: successResponse}],
				finishReason: {unified: 'stop', raw: undefined},
				usage: {
					inputTokens: {total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined},
					outputTokens: {total: 10, text: undefined, reasoning: undefined},
				},
				rawCall: {rawPrompt: '', rawSettings: {}},
				warnings: [],
			};
		},
		async doStream() {
			throw new Error('Not implemented');
		},
	} as unknown as LanguageModel;
	return {
		model,
		getCallCount: () => callCount,
	};
}

// ============================================================================
// Basic Translation Tests
// ============================================================================

test('translateMessages translates en.json fixture using mocked AI model', async t => {
	const mockTranslatedMessages = Object.fromEntries(Object.entries(enJson).map(([key, value]) => [key, `[DE] ${value}`]));

	const mockModel = createMockModel(() => JSON.stringify(mockTranslatedMessages));

	const result = await translateMessages({
		messages: enJson,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	t.deepEqual(result, mockTranslatedMessages);
});

test('translateMessages handles empty messages object', async t => {
	const mockModel = createMockModel(() => '{}');

	const result = await translateMessages({
		messages: {},
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	t.deepEqual(result, {});
});

test('translateMessages handles single message', async t => {
	const messages = {hello: 'Hello'};
	const translated = {hello: 'Hallo'};

	const mockModel = createMockModel(() => JSON.stringify(translated));

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	t.deepEqual(result, translated);
});

// ============================================================================
// Batch Processing Tests
// ============================================================================

test('translateMessages processes large message sets in batches', async t => {
	const messageCount = 225;
	// Create 225 messages to trigger 3 batches (100 + 100 + 25)
	const messages: Record<string, string> = {};
	for (let i = 0; i < messageCount; i++) {
		messages[`key${i}`] = `Message ${i}`;
	}

	let batchCount = 0;

	const mockModel = {
		specificationVersion: 'v3',
		provider: 'mock',
		modelId: 'mock-model',
		supportedUrls: {},
		async doGenerate(options: unknown) {
			batchCount++;
			const promptText = extractPromptText(options);
			const lastBraceIndex = promptText.lastIndexOf('{');
			const jsonPart = promptText.slice(lastBraceIndex);
			const batchMessages = JSON.parse(jsonPart) as Record<string, string>;
			const translated = Object.fromEntries(Object.entries(batchMessages).map(([key, value]) => [
				key,
				`[DE] ${value}`,
			]));
			return {
				content: [{type: 'text', text: JSON.stringify(translated)}],
				finishReason: {unified: 'stop', raw: undefined},
				usage: {
					inputTokens: {total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined},
					outputTokens: {total: 10, text: undefined, reasoning: undefined},
				},
				rawCall: {rawPrompt: '', rawSettings: {}},
				warnings: [],
			};
		},
		async doStream() {
			throw new Error('Not implemented');
		},
	} as unknown as LanguageModel;

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	// Should have made 3 batches
	t.is(batchCount, 3);

	// All messages should be translated
	t.is(Object.keys(result).length, messageCount);
	for (let i = 0; i < messageCount; i++) {
		t.is(result[`key${i}`], `[DE] Message ${i}`);
	}
});

// ============================================================================
// Progress Callback Tests
// ============================================================================

test('translateMessages calls onProgress callback after each batch', async t => {
	// Create 125 messages to trigger 2 batches (100 + 25)
	const messageCount = 125;
	const messages: Record<string, string> = {};
	for (let i = 0; i < messageCount; i++) {
		messages[`key${i}`] = `Message ${i}`;
	}

	const progressCalls: Array<{current: number; total: number}> = [];

	const mockModel = createMockModel(prompt => {
		// Find the last JSON object in the prompt (the messages to translate)
		const lastBraceIndex = prompt.lastIndexOf('{');
		const jsonPart = prompt.slice(lastBraceIndex);
		const batchMessages = JSON.parse(jsonPart) as Record<string, string>;
		const translated = Object.fromEntries(Object.entries(batchMessages).map(([key, value]) => [
			key,
			`[DE] ${value}`,
		]));
		return JSON.stringify(translated);
	});

	await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
		onProgress(current, total) {
			progressCalls.push({current, total});
		},
	});

	// Should have made 2 progress calls
	t.is(progressCalls.length, 2);

	// First batch: 100/125
	t.deepEqual(progressCalls[0], {current: 100, total: 125});

	// Second batch: 125/125
	t.deepEqual(progressCalls[1], {current: 125, total: 125});
});

test('translateMessages does not fail when onProgress is not provided', async t => {
	const messages = {hello: 'Hello'};
	const translated = {hello: 'Hallo'};

	const mockModel = createMockModel(() => JSON.stringify(translated));

	// This should not throw even without onProgress
	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	t.deepEqual(result, translated);
});

// ============================================================================
// Language Name Resolution Tests
// ============================================================================

test('translateMessages uses full language name for known language codes', async t => {
	const messages = {hello: 'Hello'};
	let capturedPrompt = '';

	const mockModel = createMockModel(prompt => {
		capturedPrompt = prompt;
		return JSON.stringify({hello: 'Bonjour'});
	});

	await translateMessages({
		messages,
		targetLanguage: 'fr',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	// Prompt should contain "French" rather than just "fr"
	t.true(capturedPrompt.includes('French'));
	t.false(capturedPrompt.includes('to fr.'));
});

test('translateMessages uses language code as-is for unknown languages', async t => {
	const messages = {hello: 'Hello'};
	let capturedPrompt = '';

	const mockModel = createMockModel(prompt => {
		capturedPrompt = prompt;
		return JSON.stringify({hello: 'Translated'});
	});

	await translateMessages({
		messages,
		targetLanguage: 'unknown-lang',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	// Prompt should contain the raw code
	t.true(capturedPrompt.includes('unknown-lang'));
});

// ============================================================================
// Context Handling Tests
// ============================================================================

test('translateMessages includes context in the prompt when provided', async t => {
	const messages = {hello: 'Hello'};
	let capturedPrompt = '';

	const mockModel = createMockModel(prompt => {
		capturedPrompt = prompt;
		return JSON.stringify({hello: 'Hallo'});
	});

	await translateMessages({
		messages,
		targetLanguage: 'de',
		context: 'This is a food delivery app for restaurants',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	t.true(capturedPrompt.includes('food delivery app for restaurants'));
	t.true(capturedPrompt.includes('Product context'));
});

test('translateMessages omits context section when context is empty', async t => {
	const messages = {hello: 'Hello'};
	let capturedPrompt = '';

	const mockModel = createMockModel(prompt => {
		capturedPrompt = prompt;
		return JSON.stringify({hello: 'Hallo'});
	});

	await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		aiModel: mockModel,
	});

	t.false(capturedPrompt.includes('Product context'));
});

// ============================================================================
// API Verification & Model Fetching Tests
// ============================================================================

test('verifyApiKey returns true for valid Gemini key', async t => {
	globalThis.fetch = async url => {
		const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.href : url.url);
		if (urlString.includes('key=valid-key')) {
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			const response: Response = {
				status: 200,
				ok: true,
				json: async () => ({}),
			} as Response;
			return response;
		}

		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const response: Response = {status: 400, ok: false} as Response;
		return response;
	};

	const isValid = await verifyApiKey('valid-key', 'gemini');
	t.true(isValid);
});

test('verifyApiKey returns false for invalid Gemini key', async t => {
	globalThis.fetch = async () => {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const response: Response = {status: 400, ok: false} as Response;
		return response;
	};

	const isValid = await verifyApiKey('invalid-key', 'gemini');
	t.false(isValid);
});

test('verifyApiKey returns true for valid OpenAI key', async t => {
	globalThis.fetch = async (url, options) => {
		const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.href : url.url);
		const fetchOptions: {headers: {authorization: string}} = options as {headers: {authorization: string}};
		if (urlString.includes('openai.com') && fetchOptions.headers.authorization === 'Bearer valid-key') {
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			const response: Response = {
				status: 200,
				ok: true,
				json: async () => ({data: []}),
			} as Response;
			return response;
		}

		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const response: Response = {status: 401, ok: false} as Response;
		return response;
	};

	const isValid = await verifyApiKey('valid-key', 'openai');
	t.true(isValid);
});

test('verifyApiKey returns true for valid Anthropic key', async t => {
	globalThis.fetch = async (url, options) => {
		const urlString = typeof url === 'string' ? url : (url instanceof URL ? url.href : url.url);
		const fetchOptions: {headers: {'x-api-key': string}} = options as {headers: {'x-api-key': string}};
		if (urlString.includes('anthropic.com') && fetchOptions.headers['x-api-key'] === 'valid-key') {
			// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
			const response: Response = {
				status: 200,
				ok: true,
				json: async () => ({}),
			} as Response;
			return response;
		}

		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const response: Response = {status: 401, ok: false} as Response;
		return response;
	};

	const isValid = await verifyApiKey('valid-key', 'anthropic');
	t.true(isValid);
});
