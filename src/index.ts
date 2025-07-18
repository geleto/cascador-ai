export { TemplateRenderer, TemplateRendererInstance } from './factory-template';
export { ScriptRunner, ScriptRunnerInstance } from './factory-script';
export { TextGenerator, TextStreamer, TextGeneratorInstance, TextGeneratorConfig } from './factory-text';
export { ObjectGenerator, ObjectStreamer, ObjectGeneratorInstance, ObjectGeneratorConfig } from './factory-object';
export { Tool } from './factory-tool';
export { Config } from './factory-config';

export { ConfigProvider, ConfigData } from './ConfigData';

export {
	TemplateConfig, ScriptConfig,
	GenerateTextConfig, StreamTextConfig,
	GenerateObjectObjectConfig, GenerateObjectArrayConfig, GenerateObjectEnumConfig, GenerateObjectNoSchemaConfig,
	StreamObjectObjectConfig, StreamObjectArrayConfig, StreamObjectNoSchemaConfig,
	ToolConfig
} from './types-config';

// Core types
export { Context, SchemaType, TemplatePromptType, ScriptType, LLMPromptType, PromptOrMessage } from './types';

// Result types
export {
	ScriptResult,
	GenerateTextResult, StreamTextResult,
	GenerateObjectResultAll, GenerateObjectObjectResult, GenerateObjectArrayResult, GenerateObjectEnumResult, GenerateObjectNoSchemaResult,
	StreamObjectResultAll, StreamObjectObjectResult, StreamObjectArrayResult, StreamObjectNoSchemaResult
} from './types-result';

// Type utilities
// export * from './type-utils';

//export the factory create namespace
import * as factories from './factories';
export const create = factories;