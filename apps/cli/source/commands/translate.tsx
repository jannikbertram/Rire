import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {translateMessages, type Provider} from '@grim/translator';
import {z} from 'zod/v4';
import {ApiKeyInput} from '../components/api-key-input.js';
import {ContextInput} from '../components/context-input.js';
import {LanguageSelector} from '../components/language-selector.js';
import {LlmSelector} from '../components/llm-selector.js';
import {ModelSelector} from '../components/model-selector.js';
import {OutputPathInput} from '../components/output-path-input.js';
import {TranslationProgress} from '../components/translation-progress.js';

export const args = z.tuple([
	z.string().describe('Path to the source JSON file (e.g., en.json)'),
]);

export const options = z.object({
	output: z.string().optional().describe('Output file path (defaults to {language}.json in the source directory)'),
	context: z.string().optional().describe('Direct context string to help improve translation quality'),
	contextPath: z.string().optional().describe('Path to a file containing context (e.g., README.md)'),
	provider: z.enum(['gemini', 'openai', 'anthropic']).optional().describe('LLM provider to use'),
	model: z.string().optional().describe('Model to use for translation (e.g., gemini-2.0-flash)'),
	apiKey: z.string().optional().describe('API key for the provider'),
	language: z.string().optional().describe('Target language code (e.g., de, fr, es)'),
});

type Props = {
	readonly args: z.infer<typeof args>;
	readonly options: z.infer<typeof options>;
};

type Step =
	| 'provider'
	| 'model'
	| 'apiKey'
	| 'language'
	| 'context'
	| 'outputPath'
	| 'translating'
	| 'done';

/** Environment variable names for API keys per provider */
const apiKeyEnvVars: Record<Provider, string> = {
	gemini: 'GOOGLE_API_KEY',
	openai: 'OPENAI_API_KEY',
	anthropic: 'ANTHROPIC_API_KEY',
};

/**
 * Gets API key from environment variable for the given provider.
 */
function getApiKeyFromEnv(provider: Provider): string | undefined {
	return process.env[apiKeyEnvVars[provider]];
}

export default function Translate({args: commandArgs, options: commandOptions}: Props) {
	const [filePath] = commandArgs;

	// Determine initial state based on CLI options
	const initialProvider = commandOptions.provider as Provider | undefined;
	const initialApiKey = commandOptions.apiKey ?? (initialProvider ? getApiKeyFromEnv(initialProvider) : undefined);
	const initialModel = commandOptions.model;
	const initialLanguage = commandOptions.language;

	// Determine which step to start on based on provided options
	const getInitialStep = (): Step => {
		if (!initialProvider) return 'provider';
		if (!initialApiKey) return 'apiKey';
		if (!initialModel) return 'model';
		if (!initialLanguage) return 'language';
		// All required options provided, we'll start translation in useEffect-like pattern
		return 'translating';
	};

	const [step, setStep] = useState<Step>(getInitialStep);
	const [provider, setProvider] = useState<Provider | undefined>(initialProvider);
	const [model, setModel] = useState<string>(initialModel ?? 'gemini-2.0-flash');
	const [apiKey, setApiKey] = useState<string>(initialApiKey ?? '');
	const [targetLanguage, setTargetLanguage] = useState<string>(initialLanguage ?? '');
	const [error, setError] = useState<string>('');
	const [progress, setProgress] = useState({current: 0, total: 0});
	const [outputPath, setOutputPath] = useState<string>('');
	const [contextContent, setContextContent] = useState<string>('');
	const [hasStarted, setHasStarted] = useState(false);

	// Validate file exists
	const absolutePath = path.resolve(filePath);
	if (!fs.existsSync(absolutePath)) {
		return (
			<Box flexDirection='column'>
				<Text color='red'>Error: File not found: {absolutePath}</Text>
			</Box>
		);
	}

	// Auto-start translation when all CLI options are provided
	if (step === 'translating' && !hasStarted) {
		// Get context from CLI options
		let context = commandOptions.context ?? '';
		if (commandOptions.contextPath && fs.existsSync(commandOptions.contextPath)) {
			context = fs.readFileSync(commandOptions.contextPath, 'utf8');
		}

		// Determine output path
		const dirName = path.dirname(absolutePath);
		const outPath = commandOptions.output
			? path.resolve(commandOptions.output)
			: path.join(dirName, `${targetLanguage}.json`);

		setHasStarted(true);
		setOutputPath(outPath);
		setContextContent(context);

		// Start translation immediately
		void (async () => {
			try {
				const sourceContent = fs.readFileSync(absolutePath, 'utf8');
				const messages = JSON.parse(sourceContent) as Record<string, string>;

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

				fs.writeFileSync(outPath, JSON.stringify(translated, null, 2));
				setStep('done');
			} catch (error_) {
				setError(error_ instanceof Error ? error_.message : 'Unknown error');
				setStep('done');
			}
		})();
	}

	const handleProviderSelect = (selectedProvider: Provider) => {
		setProvider(selectedProvider);

		// Check if API key is already set in environment
		const envApiKey = getApiKeyFromEnv(selectedProvider);
		if (envApiKey) {
			setApiKey(envApiKey);
			setStep('model'); // Skip API key input
		} else {
			setStep('apiKey');
		}
	};

	const handleApiKeySubmit = (key: string) => {
		setApiKey(key);
		setStep('model');
	};

	const handleModelSelect = (selectedModel: string) => {
		setModel(selectedModel);
		setStep('language');
	};

	const handleLanguageSelect = (lang: string) => {
		setTargetLanguage(lang);

		// If context is provided via CLI, skip the context step
		if (commandOptions.context || commandOptions.contextPath) {
			let context = commandOptions.context ?? '';
			if (commandOptions.contextPath && fs.existsSync(commandOptions.contextPath)) {
				context = fs.readFileSync(commandOptions.contextPath, 'utf8');
			}

			setContextContent(context);

			// Also check if output is provided to potentially skip that step too
			if (commandOptions.output) {
				setOutputPath(path.resolve(commandOptions.output));
				startTranslation(path.resolve(commandOptions.output), context);
			} else {
				setStep('outputPath');
			}
		} else {
			setStep('context');
		}
	};

	const handleContextSubmit = (contextInput: string) => {
		// contextInput could be a file path or direct text
		let context = contextInput;
		if (contextInput && fs.existsSync(contextInput)) {
			// It's a file path, read the content
			context = fs.readFileSync(contextInput, 'utf8');
		}

		setContextContent(context);

		// If --output was provided, skip to translating; otherwise ask for output path
		if (commandOptions.output) {
			setOutputPath(path.resolve(commandOptions.output));
			startTranslation(path.resolve(commandOptions.output), context);
		} else {
			setStep('outputPath');
		}
	};

	/**
	 * Computes the default output path based on the source file and target language.
	 */
	const getDefaultOutputPath = () => {
		const dirName = path.dirname(absolutePath);
		return path.join(dirName, `${targetLanguage}.json`);
	};

	const handleOutputPathSubmit = (outPath: string) => {
		const resolvedPath = path.resolve(outPath);
		setOutputPath(resolvedPath);
		startTranslation(resolvedPath, contextContent);
	};

	/**
	 * Starts the translation process with the given output path and context.
	 */
	const startTranslation = (outPath: string, context: string) => {
		setStep('translating');

		void (async () => {
			try {
				// Read source file
				const sourceContent = fs.readFileSync(absolutePath, 'utf8');
				const messages = JSON.parse(sourceContent) as Record<string, string>;

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
		})();
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

			{step === 'apiKey' && provider && (
				<ApiKeyInput provider={provider} onSubmit={handleApiKeySubmit} />
			)}

			{step === 'model' && provider && (
				<ModelSelector provider={provider} onSelect={handleModelSelect} />
			)}

			{step === 'language' && (
				<LanguageSelector onSelect={handleLanguageSelect} />
			)}

			{step === 'context' && <ContextInput onSubmit={handleContextSubmit} />}

			{step === 'outputPath' && (
				<OutputPathInput
					defaultPath={getDefaultOutputPath()}
					onSubmit={handleOutputPathSubmit}
				/>
			)}

			{step === 'translating' && (
				<TranslationProgress
					current={progress.current}
					total={progress.total}
				/>
			)}

			{step === 'done' && (
				<Box flexDirection='column'>
					{error
						? (
							<Text color='red'>Error: {error}</Text>
						)
						: (
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
