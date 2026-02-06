import React from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import type {Provider} from '@grim/translator';

type Props = {
	readonly onSelect: (provider: Provider) => void;
};

const items = [
	{label: '🤖 Google Gemini', value: 'gemini' as Provider},
	{label: '🧠 OpenAI ChatGPT', value: 'openai' as Provider},
	{label: '🔮 Anthropic Claude', value: 'anthropic' as Provider},
];

/**
 * Component for selecting an LLM provider.
 */
export function LlmSelector({onSelect}: Props) {
	const handleSelect = (item: {label: string; value: Provider}) => {
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
