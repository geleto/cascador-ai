import * as factories from './factories';

import { Config } from './factory-config';
import { TemplateRenderer } from './factory-template';
import { ScriptRunner } from './factory-script';
import { TextGenerator, TextStreamer } from './factory-text';
import { ObjectGenerator, ObjectStreamer } from './factory-object';
import { Tool } from './factory-tool';

export { Config, TemplateRenderer, ScriptRunner, TextGenerator, TextStreamer, ObjectGenerator, ObjectStreamer, Tool };

export const create = factories;
export * from './factories';