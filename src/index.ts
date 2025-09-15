// --- Core Factories ---
export { Template } from './factories/Template';
export { Script } from './factories/Script';
export { Function } from './factories/Function'; // Added missing factory
export { TextGenerator } from './factories/TextGenerator';
export { TextStreamer } from './factories/TextStreamer';
export { ObjectGenerator } from './factories/ObjectGenerator';
export { ObjectStreamer } from './factories/ObjectStreamer';
export { Config } from './factories/Config';

// --- The 'create' Namespace  ---
import * as factories from './factories/factories';
export const create = factories;

// --- Third-Party Re-exports (For User Convenience) ---
export type { ModelMessage, ToolSet } from 'ai';
export { FileSystemLoader, WebLoader } from 'cascada-engine';
export { z } from 'zod';

// --- Configuration Types ---
export type {
	// Standalone Renderer Configs
	TemplateConfig, // Correctly exporting the main TemplateConfig
	ScriptConfig,
	FunctionConfig,
	FunctionToolConfig,
	// LLM Renderer Configs
	GenerateTextConfig,
	StreamTextConfig,
	GenerateObjectObjectConfig,
	GenerateObjectArrayConfig,
	GenerateObjectEnumConfig,
	GenerateObjectNoSchemaConfig,
	StreamObjectObjectConfig,
	StreamObjectArrayConfig,
	StreamObjectNoSchemaConfig,
	// Prompt-specific Configs for LLM Renderers
	TemplatePromptConfig,
	ScriptPromptConfig,
	FunctionPromptConfig,
	// Other
	ToolConfig,
	ConfigProvider
} from './types/config';

// --- Core Library Types ---
export type {
	Context,
	SchemaType,
	TemplatePromptType,
	ScriptPromptType,
	FunctionPromptType,
	StreamObjectOnFinishEvent,
	StreamTextOnFinishEvent
} from './types/types';
export { ModelMessageSchema, PromptStringOrMessagesSchema } from './types/schemas';

// --- Result Types ---
export type {
	ScriptResult,
	// Augmented results renamed for clean public API
	GenerateTextResultAugmented as GenerateTextResult,
	StreamTextResultAugmented as StreamTextResult,
	// Object Generation Results
	GenerateObjectResultAll,
	GenerateObjectObjectResult,
	GenerateObjectArrayResult,
	GenerateObjectEnumResult,
	GenerateObjectNoSchemaResult,
	// Object Streaming Results
	StreamObjectResultAll,
	StreamObjectObjectResult,
	StreamObjectArrayResult,
	StreamObjectNoSchemaResult
} from './types/result';

// --- Error Types ---
export { TemplateError } from './TemplateEngine';
export { ScriptError } from './ScriptEngine';
export { ConfigError } from './validate';


// --- Public Utilities & Associated Types ---
export { race, type RaceGroup, type MergedGroup } from './loaders';