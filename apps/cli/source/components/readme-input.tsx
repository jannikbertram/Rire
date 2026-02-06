import React, {useState} from 'react';
import {Box, Text} from 'ink';
import TextInput from 'ink-text-input';

type Props = {
	readonly onSubmit: (readmePath: string) => void;
};

export function ReadmeInput({onSubmit}: Props) {
	const [value, setValue] = useState('');

	const handleSubmit = (submittedValue: string) => {
		onSubmit(submittedValue.trim());
	};

	return (
		<Box flexDirection='column'>
			<Text bold>Product context (optional):</Text>
			<Text dimColor>
				Enter path to a README or context file to help improve translations.
			</Text>
			<Text dimColor>Press Enter to skip.</Text>
			<Box marginTop={1}>
				<Text>Path: </Text>
				<TextInput
					placeholder='./README.md'
					value={value}
					onChange={setValue}
					onSubmit={handleSubmit}
				/>
			</Box>
		</Box>
	);
}
