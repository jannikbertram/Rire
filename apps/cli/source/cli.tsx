#!/usr/bin/env node
import Pastel from 'pastel';

const app = new Pastel({
	importMeta: import.meta,
	name: 'grim',
	description: 'Translate react-intl localization files using LLMs',
});

await app.run();
