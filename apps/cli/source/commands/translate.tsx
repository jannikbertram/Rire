import fs from 'node:fs';
import path from 'node:path';
import React, {useState} from 'react';
import {Box, Text} from 'ink';
// eslint-disable-next-line n/file-extension-in-import
import {z} from 'zod/v4';
import {ApiKeyInput} from '../components/api-key-input.js';
import {LanguageSelector} from '../components/language-selector.js';
import {LlmSelector} from '../components/llm-selector.js';
import {ModelSelector, type GeminiModel} from '../components/model-selector.js';
import {ReadmeInput} from '../components/readme-input.js';
import {TranslationProgress} from '../components/translation-progress.js';
import {translateMessages} from '@grim/translator';

export const args = z.tuple([
	z.string().describe('Path to the source JSON file (e.g., en.json)'),
]);

type Props = {
	readonly args: z.infer<typeof args>;
};

type Step =
	| 'provider'
	| 'model'
	| 'apiKey'
	| 'language'
	| 'readme'
	| 'translating'
	| 'done';

type LlmProvider = 'gemini';

export default function Translate({args: commandArgs}: Props) {
	const [filePath] = commandArgs;
	const [step, setStep] = useState<Step>('provider');
	const [provider, setProvider] = useState<LlmProvider | undefined>(undefined);
	const [model, setModel] = useState<GeminiModel>('gemini-2.0-flash');
	const [apiKey, setApiKey] = useState<string>('');
	const [targetLanguage, setTargetLanguage] = useState<string>('');
	const [, setReadmePath] = useState<string>('');
	const [error, setError] = useState<string>('');
	const [progress, setProgress] = useState({current: 0, total: 0});
	const [outputPath, setOutputPath] = useState<string>('');

	// Validate file exists
	const absolutePath = path.resolve(filePath);
	if (!fs.existsSync(absolutePath)) {
		return (
			<Box flexDirection='column'>
				<Text color='red'>Error: File not found: {absolutePath}</Text>
			</Box>
		);
	}

	const handleProviderSelect = (selectedProvider: LlmProvider) => {
		setProvider(selectedProvider);
		setStep('model');
	};

	const handleModelSelect = (selectedModel: GeminiModel) => {
		setModel(selectedModel);
		setStep('apiKey');
	};

	const handleApiKeySubmit = (key: string) => {
		setApiKey(key);
		setStep('language');
	};

	const handleLanguageSelect = (lang: string) => {
		setTargetLanguage(lang);
		setStep('readme');
	};

	const handleReadmeSubmit = async (readme: string) => {
		setReadmePath(readme);
		setStep('translating');

		try {
			// Read source file
			const sourceContent = fs.readFileSync(absolutePath, 'utf8');
			const messages = JSON.parse(sourceContent) as Record<string, string>;

			// Read readme if provided
			let context = '';
			if (readme && fs.existsSync(readme)) {
				context = fs.readFileSync(readme, 'utf8');
			}

			// Generate output path
			const extension = path.extname(absolutePath);
			const baseName = path.basename(absolutePath, extension);
			const dirName = path.dirname(absolutePath);
			const outPath = path.join(
				dirName,
				`${baseName}.${targetLanguage}${extension}`,
			);

			// Translate
			const translated = await translateMessages({
				messages,
				targetLanguage,
				context,
				apiKey,
				provider: provider!,
				model,
				onProgress(current: number, total: number) {
					setProgress({current, total});
				},
			});

			// Write output
			fs.writeFileSync(outPath, JSON.stringify(translated, null, 2));
			setOutputPath(outPath);
			setStep('done');
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Unknown error');
			setStep('done');
		}
	};

	return (
		<Box flexDirection='column' padding={1}>
			<Box marginBottom={1}>
				<Text bold color='cyan'>
					🌐 Grim Translator
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Source: {absolutePath}</Text>
			</Box>

			{step === 'provider' && <LlmSelector onSelect={handleProviderSelect} />}

			{step === 'model' && provider && (
				<ModelSelector onSelect={handleModelSelect} />
			)}

			{step === 'apiKey' && provider && (
				<ApiKeyInput provider={provider} onSubmit={handleApiKeySubmit} />
			)}

			{step === 'language' && (
				<LanguageSelector onSelect={handleLanguageSelect} />
			)}

			{step === 'readme' && <ReadmeInput onSubmit={handleReadmeSubmit} />}

			{step === 'translating' && (
				<TranslationProgress
					current={progress.current}
					total={progress.total}
				/>
			)}

			{step === 'done' && (
				<Box flexDirection='column'>
					{error ? (
						<Text color='red'>Error: {error}</Text>
					) : (
						<>
							<Text color='green'>✓ Translation complete!</Text>
							<Text>Output: {outputPath}</Text>
						</>
					)}
				</Box>
			)}
		</Box>
	);
}
