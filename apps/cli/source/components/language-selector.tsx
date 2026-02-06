import React from 'react';
import {Box, Text} from 'ink';
import SelectInput from 'ink-select-input';

type Props = {
	readonly onSelect: (language: string) => void;
};

const languages = [
	{label: '🇩🇪 German (de)', value: 'de'},
	{label: '🇫🇷 French (fr)', value: 'fr'},
	{label: '🇪🇸 Spanish (es)', value: 'es'},
	{label: '🇮🇹 Italian (it)', value: 'it'},
	{label: '🇵🇹 Portuguese (pt)', value: 'pt'},
	{label: '🇳🇱 Dutch (nl)', value: 'nl'},
	{label: '🇵🇱 Polish (pl)', value: 'pl'},
	{label: '🇯🇵 Japanese (ja)', value: 'ja'},
	{label: '🇨🇳 Chinese Simplified (zh)', value: 'zh'},
	{label: '🇰🇷 Korean (ko)', value: 'ko'},
	{label: '🇷🇺 Russian (ru)', value: 'ru'},
	{label: '🇹🇷 Turkish (tr)', value: 'tr'},
	{label: '🇸🇦 Arabic (ar)', value: 'ar'},
];

export function LanguageSelector({onSelect}: Props) {
	const handleSelect = (item: {label: string; value: string}) => {
		onSelect(item.value);
	};

	return (
		<Box flexDirection='column'>
			<Text bold>Select target language:</Text>
			<Box marginTop={1}>
				<SelectInput items={languages} onSelect={handleSelect} />
			</Box>
		</Box>
	);
}
