import fs from 'node:fs';
import process from 'node:process';
import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {
	adviseWebsite,
	type RevisionErrorType,
	type RevisionSuggestion,
} from '@jive/core';
import {z} from 'zod/v4';
import Spinner from 'ink-spinner';
import {AdviseReview} from '../components/advise-review.js';
import {ApiKeyInput} from '../components/api-key-input.js';
import {ErrorTypeSelector} from '../components/error-type-selector.js';
import {ModelSelector} from '../components/model-selector.js';

export const args = z.tuple([
	z.string().describe('URL of the website to advise'),
]);

export const options = z.object({
	model: z.string().optional().describe('Gemini model to use for analysis'),
	'api-key': z.string().optional().describe('Google API key'),
	'error-types': z.string().optional().describe('Comma-separated error types: grammar,wording,phrasing'),
});

type Props = {
	readonly args: z.infer<typeof args>;
	readonly options: z.infer<typeof options>;
};

type Step =
	| 'apiKey'
	| 'model'
	| 'errorTypes'
	| 'analyzing'
	| 'review'
	| 'done';

function getApiKeyFromEnv(): string | undefined {
	return process.env['GOOGLE_API_KEY'];
}

function parseErrorTypes(errorTypesOption: string | undefined): RevisionErrorType[] | undefined {
	if (!errorTypesOption) {
		return undefined;
	}

	const validTypes = new Set<RevisionErrorType>(['spelling', 'grammar', 'inconsistency', 'wordiness', 'ai-tone', 'ambiguity', 'seo']);
	const parsed = errorTypesOption.split(',').map(s => s.trim().toLowerCase());
	const filtered = parsed.filter((t): t is RevisionErrorType => validTypes.has(t as RevisionErrorType));
	return filtered.length > 0 ? filtered : undefined;
}

/**
 * Normalizes a URL to ensure it has a protocol.
 */
function normalizeUrl(url: string): string {
	if (!/^https?:\/\//i.test(url)) {
		return `https://${url}`;
	}

	return url;
}

/**
 * Generates a markdown report from the suggestions.
 */
function escapeCell(text: string): string {
	return text.replaceAll('|', String.raw`\|`).replaceAll('\n', ' ');
}

function generateMarkdownReport(
	websiteUrl: string,
	suggestions: RevisionSuggestion[],
): string {
	const lines: string[] = [
		`# Suggestions for ${websiteUrl}`,
		'',
		'| Key | Type | Original | Suggested | Reason |',
		'| --- | --- | --- | --- | --- |',
	];

	for (const s of suggestions) {
		lines.push(`| ${escapeCell(s.key)} | ${s.type} | ${escapeCell(s.original)} | ${escapeCell(s.suggested)} | ${escapeCell(s.reason)} |`);
	}

	lines.push('');
	return lines.join('\n');
}

export default function Advise({args: commandArgs, options: commandOptions}: Props) {
	const [url] = commandArgs;
	const websiteUrl = normalizeUrl(url);

	const initialApiKey = commandOptions['api-key'] ?? getApiKeyFromEnv();
	const initialModel = commandOptions.model;
	const initialErrorTypes = parseErrorTypes(commandOptions['error-types']);

	const getInitialStep = (): Step => {
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
	const [model, setModel] = useState<string>(initialModel ?? 'gemini-2.5-flash');
	const [apiKey, setApiKey] = useState<string>(initialApiKey ?? '');
	const [errorTypes, setErrorTypes] = useState<RevisionErrorType[]>(initialErrorTypes ?? ['grammar']);
	const [error, setError] = useState<string>('');
	const [suggestions, setSuggestions] = useState<RevisionSuggestion[]>([]);
	const [savedPath, setSavedPath] = useState<string>('');
	const [hasStartedAnalysis, setHasStartedAnalysis] = useState(false);

	const startAnalysis = () => {
		setStep('analyzing');
		setHasStartedAnalysis(true);

		void (async () => {
			try {
				const result = await adviseWebsite({
					websiteUrl,
					errorTypes,
					apiKey,
					model,
				});

				setSuggestions(result);

				if (result.length === 0) {
					setStep('done');
				} else {
					setStep('review');
				}
			} catch (error_) {
				setError(error_ instanceof Error ? error_.message : 'Unknown error');
				setStep('done');
			}
		})();
	};

	const handleSave = (filePath: string) => {
		try {
			const report = generateMarkdownReport(websiteUrl, suggestions);
			fs.writeFileSync(filePath, report);
			setSavedPath(filePath);
		} catch (error_) {
			setError(error_ instanceof Error ? error_.message : 'Failed to write file');
		}

		setStep('done');
	};

	const handleQuit = () => {
		setStep('done');
	};

	// Auto-start analysis when all CLI options are provided
	if (step === 'analyzing' && !hasStartedAnalysis) {
		startAnalysis();
	}

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
		startAnalysis();
	};

	return (
		<Box flexDirection='column' padding={1}>
			<Box marginBottom={1}>
				<Text bold color='cyan'>
					🔍 Jive Adviser
				</Text>
			</Box>

			<Box marginBottom={1}>
				<Text dimColor>Website: {websiteUrl}</Text>
			</Box>

			{step === 'apiKey' && (
				<ApiKeyInput provider='gemini' onSubmit={handleApiKeySubmit} />
			)}

			{step === 'model' && (
				<ModelSelector provider='gemini' onSelect={handleModelSelect} />
			)}

			{step === 'errorTypes' && (
				<ErrorTypeSelector onSubmit={handleErrorTypesSubmit} />
			)}

			{step === 'analyzing' && (
				<Box>
					<Text color='cyan'>
						<Spinner type='dots' />
					</Text>
					<Text> Analyzing website...</Text>
				</Box>
			)}

			{step === 'review' && suggestions.length > 0 && (
				<AdviseReview
					suggestions={suggestions}
					onQuit={handleQuit}
					onSave={handleSave}
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
								<Text color='green'>✓ Analysis complete!</Text>
								<Text>Found {suggestions.length} suggestions</Text>
								{savedPath && (
									<Text>Saved to {savedPath}</Text>
								)}
							</>
						)}
				</Box>
			)}
		</Box>
	);
}
