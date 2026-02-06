import React, {useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';

type Props = {
	readonly provider: string;
	readonly onSubmit: (apiKey: string) => void;
};

export function ApiKeyInput({provider, onSubmit}: Props) {
	const [value, setValue] = useState('');

	const handleSubmit = (submittedValue: string) => {
		if (submittedValue.trim()) {
			onSubmit(submittedValue.trim());
		}
	};

	const providerName
		= {
			gemini: 'Google AI Studio',
			openai: 'OpenAI',
			anthropic: 'Anthropic',
		}[provider] ?? provider;

	return (
		<Box flexDirection='column'>
			<Text bold>Enter your {providerName} API Key:</Text>
			<Text dimColor>(Get one at https://aistudio.google.com/apikey)</Text>
			<Box marginTop={1}>
				<Text>API Key: </Text>
				<TextInput
					mask='*'
					value={value}
					onChange={setValue}
					onSubmit={handleSubmit}
				/>
			</Box>
		</Box>
	);
}
