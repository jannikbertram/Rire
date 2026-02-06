import React, {useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';
import {verifyApiKey, type Provider} from '@grim/translator';
import Spinner from 'ink-spinner';

type Props = {
	readonly provider: Provider;
	readonly onSubmit: (apiKey: string) => void;
};

/** Provider display names. */
const providerNames: Record<Provider, string> = {
	gemini: 'Google AI Studio',
	openai: 'OpenAI',
	anthropic: 'Anthropic',
};

/** Provider API key URLs. */
const providerUrls: Record<Provider, string> = {
	gemini: 'https://aistudio.google.com/apikey',
	openai: 'https://platform.openai.com/api-keys',
	anthropic: 'https://console.anthropic.com/settings/keys',
};

/**
 * Component for inputting and verifying an API key for a provider.
 */
export function ApiKeyInput({provider, onSubmit}: Props) {
	const [value, setValue] = useState('');
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | undefined>();

	const handleSubmit = async (submittedValue: string) => {
		const trimmedValue = submittedValue.trim();
		if (!trimmedValue) {
			return;
		}

		setIsLoading(true);
		setError(undefined);

		try {
			const isValid = await verifyApiKey(trimmedValue, provider);
			if (isValid) {
				onSubmit(trimmedValue);
			} else {
				setError('Invalid API Key. Please check and try again.');
			}
		} catch {
			setError('Failed to verify API key. Please check your connection.');
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Box flexDirection='column'>
			<Text bold>Enter your {providerNames[provider]} API Key:</Text>
			<Text dimColor>(Get one at {providerUrls[provider]})</Text>
			<Box marginTop={1}>
				<Text>API Key: </Text>
				<TextInput
					mask='*'
					value={value}
					onChange={newValue => {
						setValue(newValue);
						setError(undefined);
					}}
					onSubmit={handleSubmit}
				/>
			</Box>
			{isLoading && (
				<Box marginTop={1}>
					<Text color='blue'>
						<Spinner type='dots' /> Verifying API key...
					</Text>
				</Box>
			)}
			{error && (
				<Box marginTop={1}>
					<Text color='red'>✖ {error}</Text>
				</Box>
			)}
		</Box>
	);
}
