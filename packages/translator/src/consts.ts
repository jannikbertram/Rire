/**
 * The number of messages to translate in each batch.
 */
export const TRANSLATION_BATCH_SIZE = 100;

/**
 * Mapping of language codes to human-readable language names.
 * Used to provide better context to the AI model in translation prompts.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
	de: 'German',
	fr: 'French',
	es: 'Spanish',
	it: 'Italian',
	pt: 'Portuguese',
	nl: 'Dutch',
	pl: 'Polish',
	ja: 'Japanese',
	zh: 'Chinese (Simplified)',
	ko: 'Korean',
	ru: 'Russian',
	tr: 'Turkish',
	ar: 'Arabic',
};