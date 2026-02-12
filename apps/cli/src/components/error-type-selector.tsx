import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {REVISION_ERROR_TYPES, type RevisionErrorType} from '@jive/core';

type Props = {
	readonly onSubmit: (errorTypes: RevisionErrorType[]) => void;
};

const errorTypeItems = (Object.entries(REVISION_ERROR_TYPES) as Array<[RevisionErrorType, {label: string; description: string}]>).map(([value, info]) => ({value, label: info.label, description: info.description}));

/**
 * Multi-select component for choosing which error types to include in revision.
 * Default selection is 'grammar' only.
 */
export function ErrorTypeSelector({onSubmit}: Props) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selected, setSelected] = useState<Set<RevisionErrorType>>(new Set(['grammar']));

	useInput((input, key) => {
		if (key.downArrow) {
			setSelectedIndex(index => Math.min(index + 1, errorTypeItems.length - 1));
		} else if (key.upArrow) {
			setSelectedIndex(index => Math.max(index - 1, 0));
		} else if (input === ' ') {
			// Toggle selection
			const item = errorTypeItems[selectedIndex];
			if (item) {
				setSelected(previous => {
					const next = new Set(previous);
					if (next.has(item.value)) {
						next.delete(item.value);
					} else {
						next.add(item.value);
					}

					return next;
				});
			}
		} else if (key.return && selected.size > 0) {
			onSubmit([...selected]);
		}
	});

	return (
		<Box flexDirection='column'>
			<Text bold>Select error types to check (Space to toggle, Enter to confirm):</Text>
			<Box marginTop={1} flexDirection='column'>
				{errorTypeItems.map((item, index) => {
					const isHighlighted = index === selectedIndex;
					const isSelected = selected.has(item.value);
					return (
						<Box key={item.value}>
							{isHighlighted
								? (
									<Text color='cyan'>
										❯ {isSelected ? '◉' : '○'} {item.label}
									</Text>
								)
								: (
									<Text>
										{isSelected ? '◉' : '○'} {item.label}
									</Text>
								)}
							<Text dimColor> - {item.description}</Text>
						</Box>
					);
				})}
			</Box>
			<Box marginTop={1}>
				<Text dimColor>
					Selected: {selected.size > 0 ? [...selected].join(', ') : 'none'}
				</Text>
			</Box>
		</Box>
	);
}
