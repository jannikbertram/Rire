import React from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';

type Props = {
	readonly current: number;
	readonly total: number;
};

export function TranslationProgress({current, total}: Props) {
	const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

	return (
		<Box flexDirection='column'>
			<Box>
				<Text color='cyan'>
					<Spinner type='dots' />
				</Text>
				<Text> Translating messages...</Text>
			</Box>
			{total > 0 && (
				<Box marginTop={1}>
					<Text>
						Progress: {current}/{total} ({percentage}%)
					</Text>
				</Box>
			)}
		</Box>
	);
}
