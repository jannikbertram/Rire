import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {translateMessages, RateLimitError} from '../src/translator.js';

const fixturesPath = path.join(process.cwd(), 'test', 'fixtures');
const enJson = JSON.parse(fs.readFileSync(path.join(fixturesPath, 'en.json'), 'utf8')) as Record<string, string>;

/**
 * Creates a mock GenAI client for testing.
 * @param responseHandler - Function that returns the mocked response text
 */
function createMockClient(responseHandler: (prompt: string) => string) {
	return {
		getGenerativeModel: () => ({
			async generateContent(prompt: string) {
				return {
					response: {
						text: () => responseHandler(prompt),
					},
				};
			},
		}),
	};
}

/**
 * Creates a mock client that fails a specified number of times before succeeding.
 * @param failuresBeforeSuccess - Number of times to fail before returning success
 * @param successResponse - The successful response text
 * @param errorMessage - The error message for failures
 */
function createRetryMockClient(
	failuresBeforeSuccess: number,
	successResponse: string,
	errorMessage: string,
) {
	let callCount = 0;
	return {
		getGenerativeModel: () => ({
			async generateContent() {
				callCount++;
				if (callCount <= failuresBeforeSuccess) {
					throw new Error(errorMessage);
				}

				return {
					response: {
						text: () => successResponse,
					},
				};
			},
		}),
		getCallCount: () => callCount,
	};
}

// ============================================================================
// Basic Translation Tests
// ============================================================================

test('translateMessages translates en.json fixture using mocked Gemini API', async t => {
	const mockTranslatedMessages = Object.fromEntries(Object.entries(enJson).map(([key, value]) => [key, `[DE] ${value}`]));

	const mockGenAiClient = createMockClient(() => JSON.stringify(mockTranslatedMessages));

	const result = await translateMessages({
		messages: enJson,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	t.deepEqual(result, mockTranslatedMessages);
});

test('translateMessages handles empty messages object', async t => {
	const mockGenAiClient = createMockClient(() => '{}');

	const result = await translateMessages({
		messages: {},
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	t.deepEqual(result, {});
});

test('translateMessages handles single message', async t => {
	const messages = {hello: 'Hello'};
	const translated = {hello: 'Hallo'};

	const mockGenAiClient = createMockClient(() => JSON.stringify(translated));

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	t.deepEqual(result, translated);
});

// ============================================================================
// Fallback Behavior Tests
// ============================================================================

test('translateMessages handles malformed JSON response by falling back to original text', async t => {
	const messages = {hello: 'Hello'};

	const mockGenAiClient = createMockClient(() => 'This is not JSON');

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	// Falls back to original text when no JSON is found
	t.deepEqual(result, messages);
});

test('translateMessages handles invalid JSON structure by falling back to original text', async t => {
	const messages = {hello: 'Hello', world: 'World'};

	// Return something that looks like JSON but is syntactically invalid
	const mockGenAiClient = createMockClient(() => '{ "hello": "Hallo", "world": }');

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	t.deepEqual(result, messages);
});

test('translateMessages extracts JSON from response with surrounding text', async t => {
	const messages = {hello: 'Hello'};
	const translated = {hello: 'Hallo'};

	// Response has text before and after the JSON
	const mockGenAiClient = createMockClient(() => `Here is the translation:\n${JSON.stringify(translated)}\n\nHope this helps!`);

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	t.deepEqual(result, translated);
});

// ============================================================================
// Batch Processing Tests
// ============================================================================

test('translateMessages processes large message sets in batches', async t => {
	// Create 25 messages to trigger 3 batches (10 + 10 + 5)
	const messages: Record<string, string> = {};
	for (let i = 0; i < 25; i++) {
		messages[`key${i}`] = `Message ${i}`;
	}

	let batchCount = 0;

	const mockGenAiClient = {
		getGenerativeModel: () => ({
			async generateContent(prompt: string) {
				batchCount++;
				// Find the last JSON object in the prompt (the messages to translate)
				const lastBraceIndex = prompt.lastIndexOf('{');
				const jsonPart = prompt.slice(lastBraceIndex);
				const batchMessages = JSON.parse(jsonPart) as Record<string, string>;
				const translated = Object.fromEntries(Object.entries(batchMessages).map(([key, value]) => [
					key,
					`[DE] ${value}`,
				]));
				return {
					response: {
						text: () => JSON.stringify(translated),
					},
				};
			},
		}),
	};

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	// Should have made 3 batches
	t.is(batchCount, 3);

	// All messages should be translated
	t.is(Object.keys(result).length, 25);
	for (let i = 0; i < 25; i++) {
		t.is(result[`key${i}`], `[DE] Message ${i}`);
	}
});

// ============================================================================
// Progress Callback Tests
// ============================================================================

test('translateMessages calls onProgress callback after each batch', async t => {
	// Create 15 messages to trigger 2 batches (10 + 5)
	const messages: Record<string, string> = {};
	for (let i = 0; i < 15; i++) {
		messages[`key${i}`] = `Message ${i}`;
	}

	const progressCalls: Array<{current: number; total: number}> = [];

	const mockGenAiClient = createMockClient(prompt => {
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
		genAiClient: mockGenAiClient,
		onProgress(current, total) {
			progressCalls.push({current, total});
		},
	});

	// Should have made 2 progress calls
	t.is(progressCalls.length, 2);

	// First batch: 10/15
	t.deepEqual(progressCalls[0], {current: 10, total: 15});

	// Second batch: 15/15
	t.deepEqual(progressCalls[1], {current: 15, total: 15});
});

test('translateMessages does not fail when onProgress is not provided', async t => {
	const messages = {hello: 'Hello'};
	const translated = {hello: 'Hallo'};

	const mockGenAiClient = createMockClient(() => JSON.stringify(translated));

	// This should not throw even without onProgress
	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	t.deepEqual(result, translated);
});

// ============================================================================
// Language Name Resolution Tests
// ============================================================================

test('translateMessages uses full language name for known language codes', async t => {
	const messages = {hello: 'Hello'};
	let capturedPrompt = '';

	const mockGenAiClient = {
		getGenerativeModel: () => ({
			async generateContent(prompt: string) {
				capturedPrompt = prompt;
				return {
					response: {
						text: () => JSON.stringify({hello: 'Bonjour'}),
					},
				};
			},
		}),
	};

	await translateMessages({
		messages,
		targetLanguage: 'fr',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	// Prompt should contain "French" rather than just "fr"
	t.true(capturedPrompt.includes('French'));
	t.false(capturedPrompt.includes('to fr.'));
});

test('translateMessages uses language code as-is for unknown languages', async t => {
	const messages = {hello: 'Hello'};
	let capturedPrompt = '';

	const mockGenAiClient = {
		getGenerativeModel: () => ({
			async generateContent(prompt: string) {
				capturedPrompt = prompt;
				return {
					response: {
						text: () => JSON.stringify({hello: 'Translated'}),
					},
				};
			},
		}),
	};

	await translateMessages({
		messages,
		targetLanguage: 'unknown-lang',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
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

	const mockGenAiClient = {
		getGenerativeModel: () => ({
			async generateContent(prompt: string) {
				capturedPrompt = prompt;
				return {
					response: {
						text: () => JSON.stringify({hello: 'Hallo'}),
					},
				};
			},
		}),
	};

	await translateMessages({
		messages,
		targetLanguage: 'de',
		context: 'This is a food delivery app for restaurants',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	t.true(capturedPrompt.includes('food delivery app for restaurants'));
	t.true(capturedPrompt.includes('Product context'));
});

test('translateMessages omits context section when context is empty', async t => {
	const messages = {hello: 'Hello'};
	let capturedPrompt = '';

	const mockGenAiClient = {
		getGenerativeModel: () => ({
			async generateContent(prompt: string) {
				capturedPrompt = prompt;
				return {
					response: {
						text: () => JSON.stringify({hello: 'Hallo'}),
					},
				};
			},
		}),
	};

	await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockGenAiClient,
	});

	t.false(capturedPrompt.includes('Product context'));
});

// ============================================================================
// Retry Logic Tests
// ============================================================================

test('translateMessages retries on 429 rate limit error', async t => {
	const messages = {hello: 'Hello'};
	const translated = {hello: 'Hallo'};

	// Fail the first attempt, succeed on the second (within the 3 attempts limit)
	const mockClient = createRetryMockClient(
		1,
		JSON.stringify(translated),
		'Error 429: Too many requests',
	);

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockClient,
	});

	t.deepEqual(result, translated);
	// Should have been called 2 times (1 failure + 1 success)
	t.is(mockClient.getCallCount(), 2);
});

test('translateMessages retries on Resource exhausted error', async t => {
	const messages = {hello: 'Hello'};
	const translated = {hello: 'Hallo'};

	const mockClient = createRetryMockClient(
		1,
		JSON.stringify(translated),
		'Resource exhausted. Try again later.',
	);

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockClient,
	});

	t.deepEqual(result, translated);
	t.is(mockClient.getCallCount(), 2);
});

test('translateMessages retries on quota exceeded error', async t => {
	const messages = {hello: 'Hello'};
	const translated = {hello: 'Hallo'};

	const mockClient = createRetryMockClient(
		1,
		JSON.stringify(translated),
		'API quota exceeded',
	);

	const result = await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-2.0-flash',
		genAiClient: mockClient,
	});

	t.deepEqual(result, translated);
	t.is(mockClient.getCallCount(), 2);
});

test('translateMessages throws immediately for non-rate-limit errors', async t => {
	const messages = {hello: 'Hello'};

	let callCount = 0;
	const mockGenAiClient = {
		getGenerativeModel: () => ({
			async generateContent() {
				callCount++;
				throw new Error('Authentication failed');
			},
		}),
	};

	await t.throwsAsync(
		async () =>
			translateMessages({
				messages,
				targetLanguage: 'de',
				context: '',
				apiKey: 'fake-api-key',
				provider: 'gemini',
				model: 'gemini-2.0-flash',
				genAiClient: mockGenAiClient,
			}),
		{message: 'Authentication failed'},
	);

	// Should only be called once, no retry
	t.is(callCount, 1);
});

test('translateMessages throws RateLimitError after max retries exceeded', async t => {
	const messages = {hello: 'Hello'};

	let callCount = 0;
	const mockGenAiClient = {
		getGenerativeModel: () => ({
			async generateContent() {
				callCount++;
				throw new Error('Error 429: Rate limited');
			},
		}),
	};

	const error = await t.throwsAsync(async () =>
		translateMessages({
			messages,
			targetLanguage: 'de',
			context: '',
			apiKey: 'fake-api-key',
			provider: 'gemini',
			model: 'gemini-2.0-flash',
			genAiClient: mockGenAiClient,
		}));

	// Should throw RateLimitError with specific message
	t.true(error instanceof RateLimitError);
	t.is(error?.message, 'Rate limit exceeded. Maximum retry attempts reached.');

	// Should be called 3 times (3 total attempts)
	t.is(callCount, 3);
});

test('translateMessages RateLimitError has correct name property', async t => {
	const messages = {hello: 'Hello'};

	const mockGenAiClient = {
		getGenerativeModel: () => ({
			async generateContent() {
				throw new Error('Resource exhausted');
			},
		}),
	};

	const error = await t.throwsAsync(async () =>
		translateMessages({
			messages,
			targetLanguage: 'de',
			context: '',
			apiKey: 'fake-api-key',
			provider: 'gemini',
			model: 'gemini-2.0-flash',
			genAiClient: mockGenAiClient,
		}));

	// Verify the error name property for proper identification
	t.is(error?.name, 'RateLimitError');
});

// ============================================================================
// Model Configuration Tests
// ============================================================================

test('translateMessages passes configured model to the AI client', async t => {
	const messages = {hello: 'Hello'};
	let capturedModelName = '';

	const mockGenAiClient = {
		getGenerativeModel(options: {model: string}) {
			capturedModelName = options.model;
			return {
				async generateContent() {
					return {
						response: {
							text: () => JSON.stringify({hello: 'Hallo'}),
						},
					};
				},
			};
		},
	};

	await translateMessages({
		messages,
		targetLanguage: 'de',
		context: '',
		apiKey: 'fake-api-key',
		provider: 'gemini',
		model: 'gemini-1.5-pro',
		genAiClient: mockGenAiClient,
	});

	t.is(capturedModelName, 'gemini-1.5-pro');
});
