import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import type {RevisionSuggestion} from '@jive/core';

type Props = {
	readonly suggestions: RevisionSuggestion[];
	readonly onQuit: () => void;
	readonly onSave: (filePath: string) => void;
};

/**
 * Interactive component for browsing advise suggestions.
 * Users navigate with arrow keys, quit with Q/Esc, or save all to a markdown file.
 */
export function AdviseReview({suggestions, onQuit, onSave}: Props) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isSaving, setIsSaving] = useState(false);
	const [savePath, setSavePath] = useState('');

	const current = suggestions[currentIndex];

	useInput((input, key) => {
		if (isSaving) {
			return;
		}

		if (key.upArrow) {
			setCurrentIndex(previous => Math.max(0, previous - 1));
		} else if (key.downArrow) {
			setCurrentIndex(previous => Math.min(suggestions.length - 1, previous + 1));
		} else if (input === 'q' || input === 'Q' || key.escape) {
			onQuit();
		} else if (input === 's' || input === 'S') {
			setIsSaving(true);
		}
	});

	const handleSaveSubmit = (value: string) => {
		const filePath = value.trim() || './website_improvements.md';
		onSave(filePath);
	};

	if (!current) {
		return null;
	}

	return (
		<Box flexDirection='column'>
			<Box marginBottom={1}>
				<Text bold color='cyan'>
					Suggestions ({currentIndex + 1}/{suggestions.length})
				</Text>
			</Box>

			<Box flexDirection='column' borderStyle='round' borderColor='gray' paddingX={1}>
				<Box>
					<Text bold>Key: </Text>
					<Text>{current.key}</Text>
				</Box>

				<Box marginTop={1} flexDirection='column'>
					<Text bold color='red'>Original:</Text>
					<Text>{current.original}</Text>
				</Box>

				<Box marginTop={1} flexDirection='column'>
					<Text bold color='green'>Suggested:</Text>
					<Text>{current.suggested}</Text>
				</Box>

				<Box marginTop={1}>
					<Text bold>Reason: </Text>
					<Text dimColor>{current.reason}</Text>
				</Box>

				<Box marginTop={1}>
					<Text bold>Type: </Text>
					<Text color='yellow'>{current.type}</Text>
				</Box>
			</Box>

			{isSaving
				? (
					<Box marginTop={1} flexDirection='column'>
						<Text bold>Save to file:</Text>
						<Box marginTop={1}>
							<Text>Path: </Text>
							<TextInput
								value={savePath}
								placeholder='./website_improvements.md'
								onChange={setSavePath}
								onSubmit={handleSaveSubmit}
							/>
						</Box>
					</Box>
				)
				: (
					<Box marginTop={1}>
						<Text dimColor>
							[↑/↓] Navigate  [S] Save to file  [Q] Quit
						</Text>
					</Box>
				)}
		</Box>
	);
}
