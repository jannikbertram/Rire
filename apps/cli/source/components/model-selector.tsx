import React, {useState} from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import type {Provider} from '@grim/translator';

type Props = {
	readonly provider: Provider;
	readonly onSelect: (model: string) => void;
};

/** Provider-specific model documentation URLs */
const modelDocsUrls: Record<Provider, string> = {
	gemini: 'https://ai.google.dev/gemini-api/docs/models',
	openai: 'https://platform.openai.com/docs/models',
	anthropic: 'https://docs.anthropic.com/en/docs/about-claude/models',
};

/** Hardcoded recommended models per provider, ordered by suitability */
const providerModels: Record<Provider, Array<{value: string; label: string}>> = {
	gemini: [
		{value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (recommended)'},
		{value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro'},
		{value: 'gemini-3-flash-preview', label: 'Gemini 3 Flash Preview'},
		{value: 'gemini-3-pro-preview', label: 'Gemini 3 Pro Preview'},
	],
	openai: [
		{value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini (recommended)'},
		{value: 'gpt-4.1', label: 'GPT-4.1'},
		{value: 'gpt-4o', label: 'GPT-4o'},
		{value: 'gpt-4o-mini', label: 'GPT-4o Mini'},
	],
	anthropic: [
		{value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (recommended)'},
		{value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku'},
		{value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet'},
		{value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet'},
	],
};

/**
 * Component for selecting a model from recommended options or entering a custom model.
 */
export function ModelSelector({provider, onSelect}: Props) {
	const [isCustomInput, setIsCustomInput] = useState(false);
	const [customModel, setCustomModel] = useState('');

	const models = providerModels[provider];
	const docsUrl = modelDocsUrls[provider];

	const items = [
		...models,
		{value: '__custom__', label: 'Enter custom model...'},
	];

	const handleSelect = (item: {label: string; value: string}) => {
		if (item.value === '__custom__') {
			setIsCustomInput(true);
		} else {
			onSelect(item.value);
		}
	};

	const handleCustomSubmit = () => {
		if (customModel.trim()) {
			onSelect(customModel.trim());
		}
	};

	if (isCustomInput) {
		return (
			<Box flexDirection='column'>
				<Text bold>Enter Model Name:</Text>
				<Text dimColor>(See available models at {docsUrl})</Text>
				<Box marginTop={1}>
					<Text>Model: </Text>
					<TextInput
						value={customModel}
						onChange={setCustomModel}
						onSubmit={handleCustomSubmit}
					/>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection='column'>
			<Text bold>Select Model:</Text>
			<Text dimColor>(See all models at {docsUrl})</Text>
			<Box marginTop={1}>
				<SelectInput items={items} onSelect={handleSelect} />
			</Box>
		</Box>
	);
}
