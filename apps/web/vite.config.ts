import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import {type Plugin, defineConfig, loadEnv} from 'vite';

function apiPlugin(): Plugin {
	return {
		name: 'api',
		configureServer(server) {
			// loadEnv with empty prefix loads all vars, not just VITE_-prefixed ones
			Object.assign(process.env, loadEnv('development', process.cwd(), ''));
			server.middlewares.use('/api/advise', async (req, res) => {
				if (req.method !== 'POST') {
					res.writeHead(405).end();
					return;
				}

				const chunks: Buffer[] = [];
				for await (const chunk of req) {
					chunks.push(chunk as Buffer);
				}

				const {POST} = await server.ssrLoadModule('../api/advise.ts') as typeof import('./api/advise.ts');
				const request = new Request('http://localhost/api/advise', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: Buffer.concat(chunks),
				});

				const response = await POST(request);
				const contentType = response.headers.get('Content-Type') ?? 'application/json';
				res.writeHead(response.status, {'Content-Type': contentType});

				if (response.body) {
					const reader = response.body.getReader();
					const pump = async () => {
						const {done, value} = await reader.read();
						if (done) {
							res.end();
							return;
						}

						res.write(value);
						await pump();
					};

					await pump();
				} else {
					res.end(await response.text());
				}
			});
		},
	};
}

export default defineConfig({
	root: 'src',
	plugins: [react(), tailwindcss(), apiPlugin()],
	build: {
		outDir: '../dist',
		emptyOutDir: true,
	},
});
