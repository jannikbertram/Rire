import {adviseWebsiteStream, type RevisionErrorType} from '@jive/core';

export async function POST(request: Request) {
	const apiKey = process.env['GOOGLE_API_KEY'];
	if (!apiKey) {
		return Response.json({error: 'GOOGLE_API_KEY is not configured'}, {status: 500});
	}

	let body: {url: string; errorTypes?: RevisionErrorType[]};
	try {
		body = await request.json() as typeof body;
	} catch {
		return Response.json({error: 'Invalid JSON body'}, {status: 400});
	}

	let url = body.url.trim();
	if (!url.match(/^https?:\/\//)) {
		url = `https://${url}`;
	}

	try {
		new URL(url);
	} catch {
		return Response.json({error: 'Invalid URL provided'}, {status: 400});
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			try {
				for await (const suggestion of adviseWebsiteStream({
					websiteUrl: url,
					errorTypes: body.errorTypes ?? ['spelling', 'grammar', 'inconsistency', 'wordiness', 'ai-tone', 'ambiguity', 'seo', 'geo'],
					apiKey,
					model: 'gemini-2.5-flash',
				})) {
					controller.enqueue(encoder.encode(JSON.stringify(suggestion) + '\n'));
				}
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Unknown error';
				controller.enqueue(encoder.encode(JSON.stringify({error: message}) + '\n'));
			}

			controller.close();
		},
	});

	return new Response(stream, {
		headers: {'Content-Type': 'application/x-ndjson'},
	});
}
