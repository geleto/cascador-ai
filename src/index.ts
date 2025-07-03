// Import factory functions
import { Config } from './factory-config';
import { TemplateRenderer } from './factory-template';
import { ScriptRunner } from './factory-script';
import { TextGenerator, TextStreamer } from './factory-text';
import { ObjectGenerator, ObjectStreamer } from './factory-object';

// Export everything under the create namespace
export const create = {
	Config,
	TemplateRenderer,
	ScriptRunner,
	TextGenerator,
	TextStreamer,
	ObjectGenerator,
	ObjectStreamer,
};

