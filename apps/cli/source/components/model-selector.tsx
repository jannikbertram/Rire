import React from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';

export type GeminiModel =
	| 'gemini-3-flash-preview'
	| 'gemini-3-pro-preview'
	| 'gemini-2.5-pro'
	| 'gemini-2.5-flash'
	| 'gemini-2.5-flash-lite'
	| 'gemini-2.0-flash'
	| 'gemini-2.0-flash-lite';

type Props = {
	readonly onSelect: (model: GeminiModel) => void;
};

const geminiModels: Array<{
	label: string;
	value: GeminiModel;
	description?: string;
}> = [
	{
		label: '⚡ Gemini 2.5 Flash (Recommended)',
		value: 'gemini-2.5-flash',
		description: 'Best balance of speed, quality & cost',
	},
	{
		label: '🧠 Gemini 2.5 Pro',
		value: 'gemini-2.5-pro',
		description: 'High intelligence for complex translations',
	},
	{
		label: '💨 Gemini 2.5 Flash Lite',
		value: 'gemini-2.5-flash-lite',
		description: 'Fastest & cheapest, good for high volume',
	},
	{
		label: '🌟 Gemini 3.0 Pro Preview',
		value: 'gemini-3-pro-preview',
		description: 'Next-gen reasoning and capability',
	},
	{
		label: '✨ Gemini 3.0 Flash Preview',
		value: 'gemini-3-flash-preview',
		description: 'Next-gen speed and efficiency',
	},
	{
		label: '🔹 Gemini 2.0 Flash',
		value: 'gemini-2.0-flash',
		description: 'Reliable previous generation',
	},
	{
		label: '🔸 Gemini 2.0 Flash Lite',
		value: 'gemini-2.0-flash-lite',
		description: 'Lightweight previous generation',
	},
];

export function ModelSelector({onSelect}: Props) {
	const handleSelect = (item: {label: string; value: GeminiModel}) => {
		onSelect(item.value);
	};

	return (
		<Box flexDirection='column'>
			<Text bold>Select Model:</Text>
			<Box marginTop={1}>
				<SelectInput items={geminiModels} onSelect={handleSelect} />
			</Box>
		</Box>
	);
}
