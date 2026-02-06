import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'ava';
import {translateMessages} from '../src/translator.js';

const fixturesPath = path.join(process.cwd(), 'test', 'fixtures');
const enJson = JSON.parse(
	fs.readFileSync(path.join(fixturesPath, 'en.json'), 'utf8'),
) as Record<string, string>;

test('translateMessages translates en.json fixture using mocked Gemini API', async t => {
	// Mock specific translation for the fixture
	const mockTranslatedMessages = Object.fromEntries(
		Object.entries(enJson).map(([key, value]) => [key, `[DE] ${value}`]),
	);

	const mockModel = {
		async generateContent() {
			return {
				response: {
					text: () => JSON.stringify(mockTranslatedMessages),
				},
			};
		},
	};

	const mockGenAiClient = {
		getGenerativeModel: () => mockModel,
	};

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

test('translateMessages handles malformed JSON response by falling back to original text', async t => {
	const messages = {
		hello: 'Hello',
	};

	const mockModel = {
		async generateContent() {
			return {
				response: {
					text: () => 'This is not JSON',
				},
			};
		},
	};

	const mockGenAiClient = {
		getGenerativeModel: () => mockModel,
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

	// Specific fallback behavior in translator.ts
	t.deepEqual(result, messages);
});
