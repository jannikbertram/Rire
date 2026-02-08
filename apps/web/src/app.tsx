import {useEffect, useRef, useState} from 'react';
import './app.css';

import type {FormEvent} from 'react';

type RevisionSuggestion = {
	key: string;
	original: string;
	suggested: string;
	reason: string;
	type: 'grammar' | 'wording' | 'phrasing';
};

const loadingLabels = [
	'Reading between the lines...',
	'Judging your copy...',
	'Hunting for misplaced commas...',
	'Channeling the grammar gods...',
	'Nitpicking at the speed of light...',
	'Whispering to the spellchecker...',
	'Untangling your prose...',
];

function useLoadingLabel(active: boolean) {
	const [index, setIndex] = useState(0);

	useEffect(() => {
		if (!active) {
			setIndex(0);
			return;
		}

		const interval = setInterval(() => {
			setIndex(i => (i + 1) % loadingLabels.length);
		}, 3000);
		return () => {
			clearInterval(interval);
		};
	}, [active]);

	return loadingLabels[index];
}

export function App() {
	const [url, setUrl] = useState('');
	const [loading, setLoading] = useState(false);
	const [suggestions, setSuggestions] = useState<RevisionSuggestion[] | undefined>();
	const [error, setError] = useState<string | undefined>();
	const abortRef = useRef<AbortController | null>(null);
	const loadingLabel = useLoadingLabel(loading);

	async function handleSubmit(event: FormEvent) {
		event.preventDefault();
		abortRef.current?.abort();
		setLoading(true);
		setError(undefined);
		setSuggestions(undefined);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const response = await fetch('/api/advise', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({url}),
				signal: controller.signal,
			});

			if (!response.ok) {
				const data = await response.json() as {error?: string};
				setError(data.error ?? 'Request failed');
				return;
			}

			setSuggestions([]);

			const reader = response.body!.getReader();
			const decoder = new TextDecoder();
			let buffer = '';

			for (;;) {
				const {done, value} = await reader.read(); // eslint-disable-line no-await-in-loop
				if (done) break;

				buffer += decoder.decode(value, {stream: true});
				const lines = buffer.split('\n');
				buffer = lines.pop()!;

				for (const line of lines) {
					if (!line.trim()) continue;
					const data = JSON.parse(line) as RevisionSuggestion & {error?: string};
					if (data.error) {
						setError(data.error);
						return;
					}

					setSuggestions(prev => [...(prev ?? []), data]);
				}
			}
		} catch (error_) {
			if ((error_ as Error).name !== 'AbortError') {
				setError('Failed to connect to the server');
			}
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans antialiased py-16 px-6">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-4xl font-bold tracking-tight mb-2">Jive</h1>
				<p className="text-zinc-400 mb-8">Analyze a website for grammar, wording, and phrasing issues.</p>

				<form onSubmit={handleSubmit} className="mb-8">
					<div className="flex gap-2 mb-6">
						<input
							type="text"
							inputMode="url"
							className="flex-1 px-3.5 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-50 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors disabled:opacity-50"
							value={url}
							onChange={e => {
								setUrl(e.target.value);
							}}
							placeholder="example.com"
							pattern="^(https?:\/\/)?([\w\d\-_]+\.)+[\w\d\-_]+(\/.*)?$"
							required
							disabled={loading}
						/>
						<button
							type="submit"
							className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
							disabled={loading || !url}
						>
							{loading ? 'Analyzing\u2026' : 'Analyze'}
						</button>
					</div>
				</form>

				{loading && (
					<p className="text-zinc-500 text-sm mb-6 animate-pulse">{loadingLabel}</p>
				)}

				{error && (
					<div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 mb-6 text-sm">
						{error}
					</div>
				)}

				{suggestions != null && (
					suggestions.length === 0 && !loading
						? <p className="text-zinc-400 text-center py-12">No issues found.</p>
						: suggestions.length > 0 && (
							<div className="overflow-x-auto">
								<table className="w-full text-sm text-left">
									<thead>
										<tr className="border-b border-zinc-800">
											<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Key</th>
											<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Type</th>
											<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Original</th>
											<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Suggested</th>
											<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Reason</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-zinc-800">
										{suggestions.map((s, i) => (
											<tr key={i} className="group">
												<td className="px-3 py-3 align-top">
													<code className="font-mono text-xs bg-zinc-900 px-1.5 py-0.5 rounded text-zinc-300 border border-zinc-800">{s.key}</code>
												</td>
												<td className="px-3 py-3 align-top">
													<span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize
														${s.type === 'grammar' ? 'bg-red-500/10 text-red-500' : ''}
														${s.type === 'wording' ? 'bg-amber-500/10 text-amber-500' : ''}
														${s.type === 'phrasing' ? 'bg-indigo-500/10 text-indigo-500' : ''}
													`}>
														{s.type}
													</span>
												</td>
												<td className="px-3 py-3 align-top text-zinc-300">{s.original}</td>
												<td className="px-3 py-3 align-top text-zinc-300">{s.suggested}</td>
												<td className="px-3 py-3 align-top text-zinc-400">{s.reason}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)
				)}
			</div>
		</div>
	);
}
