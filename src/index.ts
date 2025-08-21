export { Template, TemplateInstance } from './factories/Template';
export { Script, ScriptInstance } from './factories/Script';
export { TextGenerator, TextGeneratorInstance, TextGeneratorConfig } from './factories/TextGenerator';
export { TextStreamer } from './factories/TextStreamer';
export { ObjectGenerator, ObjectGeneratorInstance, LLMGeneratorConfig } from './factories/ObjectGenerator';
export { ObjectStreamer, ObjectStreamerInstance, LLMStreamerConfig } from './factories/ObjectStreamer';
export { Config } from './factories/Config';

export { ConfigProvider, ConfigData } from './ConfigData';

export {
	TemplatePromptConfig as TemplateConfig, ScriptConfig,
	GenerateTextConfig, StreamTextConfig,
	GenerateObjectObjectConfig, GenerateObjectArrayConfig, GenerateObjectEnumConfig, GenerateObjectNoSchemaConfig,
	StreamObjectObjectConfig, StreamObjectArrayConfig, StreamObjectNoSchemaConfig,
	ToolConfig
} from './types/config';

// Core types
export { Context, SchemaType, TemplatePromptType, ScriptPromptType/*, LLMPromptType */, StreamObjectOnFinishEvent, StreamTextOnFinishEvent } from './types/types';
export { ModelMessageSchema, PromptStringOrMessagesSchema } from './types/schemas';
// Result types
export {
	ScriptResult,
	GenerateTextResultAugmented as GenerateTextResult,
	StreamTextResultAugmented as StreamTextResult,
	GenerateObjectResultAll, GenerateObjectObjectResult, GenerateObjectArrayResult, GenerateObjectEnumResult, GenerateObjectNoSchemaResult,
	StreamObjectResultAll, StreamObjectObjectResult, StreamObjectArrayResult, StreamObjectNoSchemaResult
} from './types/result';

// Type utilities
// export * from './type-utils';

//export the factory create namespace
import * as factories from './factories/factories';
export const create = factories;