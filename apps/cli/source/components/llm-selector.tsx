import React from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';

type LlmProvider = 'gemini';

type Props = {
	readonly onSelect: (provider: LlmProvider) => void;
};

const items = [
	{label: '🤖 Google Gemini', value: 'gemini' as LlmProvider},
	// Future providers can be added here:
	// {label: '🧠 OpenAI GPT-4', value: 'openai' as LlmProvider},
	// {label: '🔮 Anthropic Claude', value: 'anthropic' as LlmProvider},
];

export function LlmSelector({onSelect}: Props) {
	const handleSelect = (item: {label: string; value: LlmProvider}) => {
		onSelect(item.value);
	};

	return (
		<Box flexDirection='column'>
			<Text bold>Select LLM Provider:</Text>
			<Box marginTop={1}>
				<SelectInput items={items} onSelect={handleSelect} />
			</Box>
		</Box>
	);
}
