/**
 * @jive/core - AI-powered translation engine for localization files
 *
 * This package provides utilities for translating localization files using AI.
 * It supports batch processing with automatic retry logic for rate limiting.
 *
 * @packageDocumentation
 */

export {
	translateMessages,
	verifyApiKey,
	RateLimitError,
	reviseMessages,
	adviseWebsite,
	adviseWebsiteStream,
	type TranslateOptions,
	type Model,
	type Provider,
	type ReviseOptions,
	type AdviseOptions,
	type RevisionSuggestion,
} from './translator.js';

export {
	type RevisionErrorType,
	REVISION_ERROR_TYPES,
} from './consts.js';
