#!/usr/bin/env node
// eslint-disable-next-line import-x/no-unassigned-import
import 'dotenv/config';
import Pastel from 'pastel';

const app = new Pastel({
	importMeta: import.meta,
	name: 'grim',
	description: 'Translate react-intl localization files using LLMs',
});

await app.run();
