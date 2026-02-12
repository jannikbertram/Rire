import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {
	reviseMessages,
	type Provider,
	type RevisionErrorType,
	type RevisionSuggestion,
} from '@jive/core';
import {z} from 'zod/v4';
import Spinner from 'ink-spinner';
import {ApiKeyInput} from '../components/api-key-input.js';
import {ContextInput} from '../components/context-input.js';
import {ErrorTypeSelector} from '../components/error-type-selector.js';
import {LlmSelector} from '../components/llm-selector.js';
import {ModelSelector} from '../components/model-selector.js';
import {RevisionReview} from '../components/revision-review.js';

export const args = z.tuple([
	z.string().describe('Path to the JSON localization file to revise'),
]);

export const options = z.object({
	context: z.string().optional().describe('Direct context string to help improve revision quality'),
	'context-path': z.string().optional().describe('Path to a file containing context (e.g., README.md)'),
	provider: z.enum(['gemini', 'openai', 'anthropic']).optional().describe('LLM provider to use'),
	model: z.string().optional().describe('Model to use for revision'),
	'api-key': z.string().optional().describe('API key for the provider'),
	'error-types': z.string().optional().describe('Comma-separated error types: grammar,wording,phrasing'),
	'accept-all': z.boolean().optional().describe('Accept all suggestions without review'),
});

type Props = {
	readonly args: z.infer<typeof args>;
	readonly options: z.infer<typeof options>;
};

type Step =
	| 'provider'
	| 'model'
	| 'apiKey'
	| 'errorTypes'
	| 'context'
	| 'analyzing'
	| 'review'
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

/**
 * Parses error types from CLI option.
 */
function parseErrorTypes(errorTypesOption: string | undefined): RevisionErrorType[] | undefined {
	if (!errorTypesOption) {
		return undefined;
	}

	const validTypes = new Set<RevisionErrorType>(['spelling', 'grammar', 'inconsistency', 'wordiness', 'ai-tone', 'ambiguity', 'seo']);
	const parsed = errorTypesOption.split(',').map(s => s.trim().toLowerCase());
	const filtered = parsed.filter((t): t is RevisionErrorType => validTypes.has(t as RevisionErrorType));
	return filtered.length > 0 ? filtered : undefined;
}

export default function Revise({args: commandArgs, options: commandOptions}: Props) {
	const [filePath] = commandArgs;

	// Determine initial state based on CLI options
	const initialProvider = commandOptions.provider;
	const initialApiKey = commandOptions['api-key'] ?? (initialProvider ? getApiKeyFromEnv(initialProvider) : undefined);
	const initialModel = commandOptions.model;
	const initialErrorTypes = parseErrorTypes(commandOptions['error-types']);

	// Determine which step to start on
	const getInitialStep = (): Step => {
		if (!initialProvider) {
			return 'provider';
		}

		if (!initialApiKey) {
			return 'apiKey';
		}

		if (!initialModel) {
			return 'model';
		}

		if (!initialErrorTypes) {
			return 'errorTypes';
		}

		return 'analyzing';
	};

	const [step, setStep] = useState<Step>(getInitialStep);
	const [provider, setProvider] = useState<Provider | undefined>(initialProvider);
	const [model, setModel] = useState<string>(initialModel ?? 'gemini-2.0-flash');
	const [apiKey, setApiKey] = useState<string>(initialApiKey ?? '');
	const [errorTypes, setErrorTypes] = useState<RevisionErrorType[]>(initialErrorTypes ?? ['grammar']);
	const [error, setError] = useState<string>('');
	const [progress, setProgress] = useState({current: 0, total: 0});
	const [suggestions, setSuggestions] = useState<RevisionSuggestion[]>([]);
	const [acceptedSuggestions, setAcceptedSuggestions] = useState<RevisionSuggestion[]>([]);
	const [hasStarted, setHasStarted] = useState(false);
	const [contextContent, setContextContent] = useState<string>('');

	// Validate file exists
	const absolutePath = path.resolve(filePath);
	if (!fs.existsSync(absolutePath)) {
		return (
			<Box flexDirection='column'>
				<Text color='red'>Error: File not found: {absolutePath}</Text>
			</Box>
		);
	}

	/**
	 * Starts the revision analysis.
	 */
	const startAnalysis = (context: string) => {
		setStep('analyzing');
		setHasStarted(true);

		void (async () => {
			try {
				const sourceContent = fs.readFileSync(absolutePath, 'utf8');
				const messages = JSON.parse(sourceContent) as Record<string, string>;

				const result = await reviseMessages({
					messages,
					errorTypes,
					context,
					apiKey,
					provider: provider!,
					model,
					onProgress(current: number, total: number) {
						setProgress({current, total});
					},
				});

				setSuggestions(result);

				// If --accept-all is set or no suggestions found, skip review
				// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
				if (commandOptions['accept-all'] || result.length === 0) {
					applyChanges(result);
				} else {
					setStep('review');
				}
			} catch (error_) {
				setError(error_ instanceof Error ? error_.message : 'Unknown error');
				setStep('done');
			}
		})();
	};

	/**
	 * Applies accepted suggestions to the file.
	 */
	const applyChanges = (acceptedList: RevisionSuggestion[]) => {
		setAcceptedSuggestions(acceptedList);

		if (acceptedList.length > 0) {
			try {
				const sourceContent = fs.readFileSync(absolutePath, 'utf8');
				const messages = JSON.parse(sourceContent) as Record<string, string>;

				// Apply accepted changes
				for (const suggestion of acceptedList) {
					if (suggestion.key in messages) {
						messages[suggestion.key] = suggestion.suggested;
					}
				}

				// Write back to the file
				fs.writeFileSync(absolutePath, JSON.stringify(messages, null, 2));
			} catch (error_) {
				setError(error_ instanceof Error ? error_.message : 'Failed to write changes');
			}
		}

		setStep('done');
	};

	// Auto-start analysis when CLI options provide everything
	if (step === 'analyzing' && !hasStarted) {
		let context = commandOptions.context ?? '';
		if (commandOptions['context-path'] && fs.existsSync(commandOptions['context-path'])) {
			context = fs.readFileSync(commandOptions['context-path'], 'utf8');
		}

		setContextContent(context);
		startAnalysis(context);
	}

	const handleProviderSelect = (selectedProvider: Provider) => {
		setProvider(selectedProvider);
		const envApiKey = getApiKeyFromEnv(selectedProvider);
		if (envApiKey) {
			setApiKey(envApiKey);
			setStep('model');
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
		setStep('errorTypes');
	};

	const handleErrorTypesSubmit = (types: RevisionErrorType[]) => {
		setErrorTypes(types);

		// If context is provided via CLI, skip context step
		// eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
		if (commandOptions.context || commandOptions['context-path']) {
			let context = commandOptions.context ?? '';
			if (commandOptions['context-path'] && fs.existsSync(commandOptions['context-path'])) {
				context = fs.readFileSync(commandOptions['context-path'], 'utf8');
			}

			setContextContent(context);
			startAnalysis(context);
		} else {
			setStep('context');
		}
	};

	const handleContextSubmit = (contextInput: string) => {
		let context = contextInput;
		if (contextInput && fs.existsSync(contextInput)) {
			context = fs.readFileSync(contextInput, 'utf8');
		}

		setContextContent(context);
		startAnalysis(context);
	};

	const handleReviewComplete = (accepted: RevisionSuggestion[]) => {
		applyChanges(accepted);
	};

	return (
		<Box flexDirection='column' padding={1}>
			<Box marginBottom={1}>
				<Text bold color='cyan'>
					📝 Jive Reviser
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

			{step === 'errorTypes' && (
				<ErrorTypeSelector onSubmit={handleErrorTypesSubmit} />
			)}

			{step === 'context' && <ContextInput onSubmit={handleContextSubmit} />}

			{step === 'analyzing' && (
				<Box flexDirection='column'>
					<Box>
						<Text color='cyan'>
							<Spinner type='dots' />
						</Text>
						<Text> Analyzing messages for issues...</Text>
					</Box>
					{progress.total > 0 && (
						<Box marginTop={1}>
							<Text>
								Progress: {progress.current}/{progress.total} ({Math.round((progress.current / progress.total) * 100)}%)
							</Text>
						</Box>
					)}
				</Box>
			)}

			{step === 'review' && suggestions.length > 0 && (
				<RevisionReview
					suggestions={suggestions}
					onComplete={handleReviewComplete}
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
								<Text color='green'>✓ Revision complete!</Text>
								<Text>Found {suggestions.length} suggestions</Text>
								<Text>Applied {acceptedSuggestions.length} changes to {absolutePath}</Text>
							</>
						)}
				</Box>
			)}
		</Box>
	);
}
