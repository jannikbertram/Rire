import {LANGUAGE_NAMES, REVISION_ERROR_TYPES, type RevisionErrorType} from './consts.js';

/**
 * Builds the prompt for website advising using URL context.
 * @param errorTypes - Array of error types to check for
 * @param websiteUrl - The URL of the website to analyze
 * @returns The prompt string
 */
export function buildAdviseWebsitePrompt(errorTypes: RevisionErrorType[], websiteUrl: string): string {
	const typeDescriptions = errorTypes.map(type => {
		const info = REVISION_ERROR_TYPES[type];
		return `- ${type}: ${info.description}`;
	}).join('\n');

	return `You are a UX writing expert specializing in website copy and interface labels.

Visit this website and analyze its visible text content: ${websiteUrl}

Only analyze text that is directly visible to the user on the page. This includes headings, paragraphs, buttons, links, navigation items, form labels, and placeholders.

Do NOT analyze or report issues in hidden or non-rendered text such as image alt attributes, meta descriptions, page titles, aria-labels, HTML comments, or any other text that is not visually displayed on the page.

Find issues in the following categories:
${typeDescriptions}

Important guidelines:
- Focus on clarity, conciseness, and user-friendliness
- Only report actual issues, not stylistic preferences
- Suggest improvements that match the website's tone and purpose
- Be concise in your reasoning
- Use a descriptive key for each issue (e.g., "heading-1", "nav-about", "button-submit")
- Sort results by severity (high first), then group by error type within each severity level

Respond with ONLY a JSON array of objects, each with these fields:
- "key": descriptive label key
- "section": short description of where on the page the issue is found (e.g., "Hero section", "Navigation", "Footer", "Pricing table")
- "original": the original text
- "suggested": your suggested replacement
- "reason": brief explanation
- "type": one of "grammar", "wording", or "phrasing"
- "severity": one of "high", "medium", "low", or "very low" — rate how important this fix is

If there are no issues, respond with an empty array: []`;
}

/**
 * Builds the system prompt for translation.
 * @param targetLanguage - The target language code
 * @param context - Optional product context
 * @returns The system prompt string
 */
export function buildSystemPrompt(targetLanguage: string, context: string): string {
	const targetLangName = LANGUAGE_NAMES[targetLanguage] ?? targetLanguage;

	let prompt = `You are a professional translator specializing in software localization. 
Translate the following UI text from English to ${targetLangName}.

Important guidelines:
- Preserve any placeholders like {name}, {count}, {{variable}}, etc.
- Keep the same tone and formality level
- Use natural, idiomatic expressions in the target language
- Maintain any HTML tags or markdown formatting
- Do not add or remove content, only translate`;

	if (context) {
		prompt += `\n\nProduct context for better translations:\n${context}`;
	}

	return prompt;
}

/**
 * Builds the full translation prompt for a batch of messages.
 * @param systemPrompt - The system prompt from buildSystemPrompt
 * @param batch - Array of [key, value] entries to translate
 * @returns The complete prompt string
 */
export function buildTranslationPrompt(systemPrompt: string, batch: Array<[string, string]>): string {
	return `${systemPrompt}

Translate each of the following messages:

${JSON.stringify(Object.fromEntries(batch), null, 2)}`;
}

/**
 * Builds the system prompt for revision/proofreading.
 * @param errorTypes - Array of error types to check for
 * @param context - Optional product context
 * @returns The system prompt string
 */
export function buildRevisionSystemPrompt(errorTypes: RevisionErrorType[], context: string): string {
	const typeDescriptions = errorTypes.map(type => {
		const info = REVISION_ERROR_TYPES[type];
		return `- ${type}: ${info.description}`;
	}).join('\n');

	let prompt = `You are a professional editor and proofreader specializing in software localization content.
Analyze the following UI text and find issues that need improvement.

You should look for these types of issues:
${typeDescriptions}

Important guidelines:
- Only report actual issues, not stylistic preferences
- Preserve any placeholders like {name}, {count}, {{variable}}, etc.
- Maintain any HTML tags or markdown formatting
- Provide clear, actionable suggestions
- Be concise in your reasoning`;

	if (context) {
		prompt += `\n\nProduct context for better understanding:\n${context}`;
	}

	return prompt;
}

/**
 * Builds the full revision prompt for a batch of messages.
 * @param systemPrompt - The system prompt from buildRevisionSystemPrompt
 * @param batch - Array of [key, value] entries to revise
 * @returns The complete prompt string
 */
export function buildRevisionPrompt(systemPrompt: string, batch: Array<[string, string]>): string {
	return `${systemPrompt}

Analyze each of the following messages and return a JSON array of suggestions.
For each issue found, include: the message key, the original text, your suggested fix, a brief reason, and the error type.
If a message has no issues, do not include it in the output.

Messages to analyze:

${JSON.stringify(Object.fromEntries(batch), null, 2)}`;
}
