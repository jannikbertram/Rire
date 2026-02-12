import {useEffect, useRef, useState} from 'react';
import './app.css';

import type {FormEvent} from 'react';

type ErrorType = 'spelling' | 'grammar' | 'inconsistency' | 'wordiness' | 'ai-tone' | 'ambiguity' | 'seo' | 'geo';
type Severity = 'high' | 'medium' | 'low' | 'very low';

type RevisionSuggestion = {
	key: string;
	section?: string;
	original: string;
	suggested: string;
	reason: string;
	type: ErrorType;
	severity?: Severity;
};

type ToggleGroup = {
	label: string;
	types: ErrorType[];
};

const toggleGroups: ToggleGroup[] = [
	{label: 'Spelling & Grammar', types: ['spelling', 'grammar']},
	{label: 'Style', types: ['wordiness', 'ai-tone']},
	{label: 'Clarity', types: ['ambiguity', 'inconsistency']},
	{label: 'SEO', types: ['seo']},
	{label: 'GEO', types: ['geo']},
];

const severityLevels: Severity[] = ['very low', 'low', 'medium', 'high'];
const severityLabels: Record<Severity, string> = {
	'very low': 'Very low',
	low: 'Low',
	medium: 'Medium',
	high: 'High',
};

function severityRank(s: Severity): number {
	return severityLevels.indexOf(s);
}

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
	const [errorTypes, setErrorTypes] = useState<Set<ErrorType>>(new Set(toggleGroups.flatMap(g => g.types)));
	const [minSeverity, setMinSeverity] = useState<Severity>('very low');
	const [loading, setLoading] = useState(false);
	const [suggestions, setSuggestions] = useState<RevisionSuggestion[] | undefined>();
	const [error, setError] = useState<string | undefined>();
	const [analyzedUrl, setAnalyzedUrl] = useState<string | undefined>();
	const [sitemapUrls, setSitemapUrls] = useState<string[]>([]);
	const [sitemapLoading, setSitemapLoading] = useState(false);
	const abortRef = useRef<AbortController | null>(null);
	const loadingLabel = useLoadingLabel(loading);

	async function handleSubmit(event: FormEvent | null, overrideUrl?: string) {
		event?.preventDefault();
		const targetUrl = overrideUrl ?? url;
		if (overrideUrl) setUrl(overrideUrl);

		abortRef.current?.abort();
		setLoading(true);
		setError(undefined);
		setSuggestions(undefined);
		setSitemapUrls([]);

		let normalizedUrl = targetUrl.trim();
		if (!normalizedUrl.match(/^https?:\/\//)) {
			normalizedUrl = `https://${normalizedUrl}`;
		}

		setAnalyzedUrl(normalizedUrl);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const response = await fetch('/api/advise', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({url: targetUrl, errorTypes: [...errorTypes]}),
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

	useEffect(() => {
		if (loading || !suggestions?.length || !analyzedUrl) return;

		setSitemapLoading(true);
		fetch(`/api/sitemap?url=${encodeURIComponent(analyzedUrl)}`)
			.then(res => res.json() as Promise<{urls: string[]}>)
			.then(data => {
				setSitemapUrls(data.urls);
			})
			.catch(() => {
				// Silent failure
			})
			.finally(() => {
				setSitemapLoading(false);
			});
	}, [loading, suggestions, analyzedUrl]); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans antialiased py-16 px-6">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-4xl font-bold tracking-tight mb-2">Jive</h1>
				<p className="text-zinc-400 mb-8">Analyze a website for grammar, wording, and phrasing issues.</p>

				<form onSubmit={handleSubmit} className="mb-8">
					<div className="flex gap-2 mb-3">
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
							disabled={loading || !url || errorTypes.size === 0}
						>
							{loading ? 'Analyzing\u2026' : 'Analyze'}
						</button>
					</div>
					<div className="flex items-center gap-4 mb-3">
						<div className="flex gap-2">
							{toggleGroups.map(group => {
								const active = group.types.every(t => errorTypes.has(t));
								return (
									<button
										key={group.label}
										type="button"
										className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
											active
												? 'bg-zinc-800 border-zinc-700 text-zinc-200'
												: 'bg-transparent border-zinc-800 text-zinc-500 hover:text-zinc-400'
										}`}
										disabled={loading}
										onClick={() => {
											setErrorTypes(prev => {
												const next = new Set(prev);
												if (active) {
													for (const t of group.types) next.delete(t);
												} else {
													for (const t of group.types) next.add(t);
												}

												return next;
											});
										}}
									>
										{group.label}
									</button>
								);
							})}
						</div>
						<div className="flex items-center gap-2">
							<span className="text-xs text-zinc-500">Min severity</span>
							<select
								className="px-2 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
								value={minSeverity}
								onChange={e => {
									setMinSeverity(e.target.value as Severity);
								}}
								disabled={loading}
							>
								{severityLevels.map(level => (
									<option key={level} value={level}>{severityLabels[level]}</option>
								))}
							</select>
						</div>
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

				{suggestions != null && (() => {
					const filtered = suggestions
						.filter(s => severityRank(s.severity ?? 'high') >= severityRank(minSeverity))
						.toSorted((a, b) => {
							const bySeverity = severityRank(b.severity ?? 'high') - severityRank(a.severity ?? 'high');
							if (bySeverity !== 0) return bySeverity;
							return (a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
						});
					return suggestions.length === 0 && !loading
						? <p className="text-zinc-400 text-center py-12">No issues found.</p>
						: suggestions.length > 0 && (
							filtered.length === 0
								? <p className="text-zinc-400 text-center py-12">No issues match the current severity filter.</p>
								: <div className="overflow-x-auto">
									<table className="w-full text-sm text-left">
										<thead>
											<tr className="border-b border-zinc-800">
												<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Section</th>
												<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Severity</th>
												<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Type</th>
												<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Original</th>
												<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Suggested</th>
												<th className="px-3 py-3 text-zinc-400 font-medium text-xs uppercase tracking-wider">Reason</th>
											</tr>
										</thead>
										<tbody className="divide-y divide-zinc-800">
											{filtered.map((s, i) => (
												<tr key={i} className="group">
													<td className="px-3 py-3 align-top text-zinc-400">{s.section}</td>
													<td className="px-3 py-3 align-top">
														<span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize
															${s.severity === 'high' ? 'bg-red-500/10 text-red-500' : ''}
															${s.severity === 'medium' ? 'bg-amber-500/10 text-amber-500' : ''}
															${s.severity === 'low' ? 'bg-blue-500/10 text-blue-500' : ''}
															${s.severity === 'very low' ? 'bg-zinc-500/10 text-zinc-400' : ''}
														`}>
															{s.severity ?? 'unknown'}
														</span>
													</td>
													<td className="px-3 py-3 align-top">
														<span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium
															${s.type === 'spelling' || s.type === 'grammar' ? 'bg-red-500/10 text-red-500' : ''}
															${s.type === 'inconsistency' ? 'bg-orange-500/10 text-orange-500' : ''}
															${s.type === 'wordiness' || s.type === 'ai-tone' ? 'bg-amber-500/10 text-amber-500' : ''}
															${s.type === 'ambiguity' ? 'bg-indigo-500/10 text-indigo-500' : ''}
															${s.type === 'seo' || s.type === 'geo' ? 'bg-emerald-500/10 text-emerald-500' : ''}
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
						);
				})()}
				{!loading && sitemapLoading && (
					<p className="text-zinc-500 text-sm mt-6 animate-pulse">Looking for other pages...</p>
				)}

				{sitemapUrls.length > 0 && (
					<div className="mt-8 border-t border-zinc-800 pt-6">
						<h2 className="text-sm font-medium text-zinc-400 mb-3">Other pages on this site</h2>
						<ul className="space-y-1.5">
							{sitemapUrls.map(subUrl => (
								<li key={subUrl}>
									<button
										type="button"
										className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors truncate max-w-full text-left"
										onClick={() => {
											handleSubmit(null, subUrl);
										}}
									>
										{subUrl}
									</button>
								</li>
							))}
						</ul>
					</div>
				)}
			</div>
		</div>
	);
}
