export { TemplateRenderer, TemplateRendererInstance } from './factory-template';
export { ScriptRunner, ScriptRunnerInstance } from './factory-script';
export { TextGenerator, TextGeneratorInstance, TextGeneratorConfig } from './factory-text-generator';
export { TextStreamer } from './factory-text-streamer';
export { ObjectGenerator, ObjectGeneratorInstance, LLMGeneratorConfig } from './factory-object-generator';
export { ObjectStreamer, ObjectStreamerInstance, LLMStreamerConfig } from './factory-object-streamer';
export { Tool } from './factory-tool';
export { Config } from './factory-config';

export { ConfigProvider, ConfigData } from './ConfigData';

export {
	TemplatePromptConfig as TemplateConfig, ScriptConfig,
	GenerateTextConfig, StreamTextConfig,
	GenerateObjectObjectConfig, GenerateObjectArrayConfig, GenerateObjectEnumConfig, GenerateObjectNoSchemaConfig,
	StreamObjectObjectConfig, StreamObjectArrayConfig, StreamObjectNoSchemaConfig,
	ToolConfig
} from './types-config';

// Core types
export { Context, SchemaType, TemplatePromptType, ScriptPromptType/*, LLMPromptType */, StreamObjectOnFinishEvent, StreamTextOnFinishEvent } from './types';

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