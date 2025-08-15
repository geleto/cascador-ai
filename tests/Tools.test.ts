
import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create } from '../src/index';
import { model, temperature, timeout } from './common';
import { ConfigError } from '../src/validate';
import { z } from 'zod';

// Configure chai-as-promised
chai.use(chaiAsPromised);

const { expect } = chai;

describe('create.Tool', function () {
	this.timeout(timeout); // Increase timeout for tests that call the real API

	const toolCallOptions = {
		toolCallId: 'test-call-id',
		messages: [{ role: 'user' as const, content: 'test' }]
	}

	describe('Suite 1: Validation & Unit Tests', () => {
		describe('Error: Missing inputSchema Schema', () => {
			it('should throw ConfigError when inputSchema schema is missing', () => {
				const textGenerator = create.TextGenerator({
					model,
					temperature,
					prompt: 'Hello world'
				});

				//@ts-expect-error - missing inputSchema schema
				expect(() => create.Tool({
					description: 'A test tool'
					// Missing inputSchema
				}, textGenerator)).to.throw(
					ConfigError,
					'Tool config requires inputSchema schema'
				);
			});
		});

		describe('Error: Streamer Parents Not Supported', () => {
			it('should throw ConfigError when TextStreamer is used as parent', () => {
				const textStreamer = create.TextStreamer({
					model,
					temperature,
					prompt: 'Hello world'
				});

				expect(() => create.Tool({
					description: 'A test tool',
					inputSchema: z.object({})
					//@ts-expect-error - streamers not supported
				}, textStreamer)).to.throw(
					ConfigError,
					'Streamers (TextStreamer, ObjectStreamer) are not supported as Tool parents. Use TextGenerator, ObjectGenerator, Script, or Template instead.'
				);
			});

			it('should throw ConfigError when ObjectStreamer is used as parent', () => {
				const objectStreamer = create.ObjectStreamer({
					model,
					temperature,
					prompt: 'Generate a person',
					schema: z.object({
						name: z.string(),
						age: z.number()
					})
				});

				expect(() => create.Tool({
					description: 'A test tool',
					inputSchema: z.object({})
					//@ts-expect-error - streamers not supported
				}, objectStreamer)).to.throw(
					ConfigError,
					'Streamers (TextStreamer, ObjectStreamer) are not supported as Tool parents. Use TextGenerator, ObjectGenerator, Script, or Template instead.'
				);
			});

			it('should identify streamer vs generator types correctly', () => {
				// This test verifies our runtime validation works correctly
				const textGenerator = create.TextGenerator({
					model,
					temperature,
					prompt: 'Hello world'
				});

				const objectGenerator = create.ObjectGenerator({
					model,
					temperature,
					prompt: 'Generate a person',
					schema: z.object({
						name: z.string(),
						age: z.number()
					})
				});

				// These should not throw errors
				expect(() => create.Tool({
					description: 'A test tool',
					inputSchema: z.object({})
				}, textGenerator)).to.not.throw();

				expect(() => create.Tool({
					description: 'A test tool',
					inputSchema: z.object({})
				}, objectGenerator)).to.not.throw();
			});

			it('should verify parent types have correct type property', () => {
				const textGenerator = create.TextGenerator({
					model,
					temperature,
					prompt: 'Hello world'
				});

				const objectGenerator = create.ObjectGenerator({
					model,
					temperature,
					prompt: 'Generate a person',
					schema: z.object({
						name: z.string(),
						age: z.number()
					})
				});

				const script = create.Script({
					script: ':data @data = "Hello"'
				});

				const template = create.Template({
					prompt: 'Hello {{ name }}'
				});

				// Check that each parent has the correct type property
				expect(textGenerator.type).to.equal('GenerateText');
				expect(objectGenerator.type).to.equal('GenerateObject');
				expect(script.type).to.equal('Script');
				expect(template.type).to.equal('Template');
			});
		});

		describe('Error: Unrecognized Parent Type', () => {
			it('should throw ConfigError when parent type cannot be determined', () => {
				const unrecognizedParent = {
					config: {
						// No recognizable discriminator properties
						someOtherProperty: 'value'
					}
				};

				expect(() => create.Tool({
					description: 'A test tool',
					inputSchema: z.object({})
					//@ts-expect-error - unrecognized parent
				}, unrecognizedParent)).to.throw(
					ConfigError,
					'Could not determine the type of the parent for the tool. The parent must be a configured instance from TextGenerator, ObjectGenerator, Script, or Template.'
				);
			});
		});

		describe('Structure: Vercel SDK Compatibility', () => {
			it('should return a valid Vercel AI FunctionTool', () => {
				const textGenerator = create.TextGenerator({
					model,
					temperature,
					prompt: 'Hello world'
				});

				const tool = create.Tool({
					description: 'A test tool',
					inputSchema: z.object({
						name: z.string().describe('The name to greet')
					})
				}, textGenerator);

				expect(tool).to.have.property('type', 'function');
				expect(tool).to.have.property('description', 'A test tool');
				expect(tool).to.have.property('inputSchema');
				expect(tool).to.have.property('execute');
				expect(tool.execute).to.be.a('function');
			});
		});

		describe('Error: Invalid inputSchema Schema', () => {
			it('should throw error if inputSchema is not a z.object', () => {
				const textGenerator = create.TextGenerator({
					model,
					temperature,
					prompt: 'Hello world'
				});

				expect(() => create.Tool({
					description: 'A test tool',
					inputSchema: z.string() // Not z.object
				}, textGenerator)).to.throw(
					ConfigError,
					'Tool config requires inputSchema schema'
				);
			});
		});
	});

	describe('Suite 2: Direct Execution & Integration Tests', () => {
		describe('Sub-Suite 2.1: Parent Type Detection & Return Value', () => {
			it('should correctly identify and execute Script parent', async () => {
				const script = create.Script({
					context: {
						input: 'test'
					},
					script: `
						:data
						@data.result = "Processed: " + input
					`
				});

				const tool = create.Tool({
					description: 'A script tool',
					inputSchema: z.object({
						input: z.string()
					})
				}, script);

				const result = await tool.execute({ input: 'hello' }, toolCallOptions);
				expect(result).to.deep.equal({ result: 'Processed: hello' });
			});

			it('should correctly identify and execute ObjectGenerator parent', async () => {
				const objectGenerator = create.ObjectGenerator({
					model,
					temperature,
					schema: z.object({
						greeting: z.string(),
						count: z.number()
					}),
					prompt: 'Generate a greeting for {{ name }} with count {{ count }}'
				});

				const tool = create.Tool({
					description: 'An object generator tool',
					inputSchema: z.object({
						name: z.string(),
						count: z.number()
					})
				}, objectGenerator);

				const result = await tool.execute({ name: 'John', count: 5 }, toolCallOptions);
				expect(result).to.have.property('greeting');
				expect(result).to.have.property('count', 5);
			});

			it('should correctly identify and execute TextGenerator parent', async () => {
				const textGenerator = create.TextGenerator({
					model,
					temperature,
					prompt: 'Say hello to {{ name }}'
				});

				const tool = create.Tool({
					description: 'A text generator tool',
					inputSchema: z.object({
						name: z.string()
					})
				}, textGenerator);

				const result = await tool.execute({ name: 'Alice' }, toolCallOptions);
				expect(result).to.be.a('string');
				expect(result).to.contain('Alice');
			});

			it('should correctly identify and execute Template parent', async () => {
				const template = create.Template({
					prompt: 'Hello {{ name }}, you are {{ age }} years old'
				});

				const tool = create.Tool({
					description: 'A template tool',
					inputSchema: z.object({
						name: z.string(),
						age: z.number()
					})
				}, template);

				const result = await tool.execute({ name: 'Bob', age: 30 }, toolCallOptions);
				expect(result).to.equal('Hello Bob, you are 30 years old');
			});
		});

		describe('Sub-Suite 2.2: Execution Error Handling', () => {
			it('should throw error when ObjectGenerator result missing .object property', async () => {
				// Create a mock ObjectGenerator that returns invalid result
				const mockObjectGenerator = {
					config: { output: 'object' },
					async execute() {
						await new Promise(resolve => setTimeout(resolve, 0));
						return { text: 'wrong property' }; // Missing .object
					}
				};

				const tool = create.Tool({
					description: 'A test tool',
					inputSchema: z.object({})
					//@ts-expect-error - mock ObjectGenerator
				}, mockObjectGenerator);

				await expect(tool.execute({}, toolCallOptions)).to.be.rejectedWith(
					ConfigError,
					'Parent ObjectGenerator result did not contain an "object" property.'
				);
			});

			it('should throw error when TextGenerator result missing .text property', async () => {
				// Create a mock TextGenerator that returns invalid result
				const mockTextGenerator = {
					config: { model: 'test' },
					async execute() {
						await new Promise(resolve => setTimeout(resolve, 0));
						return { object: 'wrong property' }; // Missing .text
					}
				};

				const tool = create.Tool({
					description: 'A test tool',
					inputSchema: z.object({})
					//@ts-expect-error - mock TextGenerator
				}, mockTextGenerator);

				await expect(tool.execute({}, toolCallOptions)).to.be.rejectedWith(
					ConfigError,
					'Parent TextGenerator result did not contain a "text" property.'
				);
			});

			it('should propagate errors from parent renderer', async () => {
				const script = create.Script({
					context: {
						async failingFunction() {
							await new Promise(resolve => setTimeout(resolve, 0));
							throw new Error('API Error');
						}
					},
					script: `
						:data
						@data.result = failingFunction()
					`
				});

				const tool = create.Tool({
					description: 'A test tool',
					inputSchema: z.object({})
				}, script);

				await expect(tool.execute({}, toolCallOptions)).to.be.rejectedWith('API Error');
			});
		});

		describe('Sub-Suite 2.3: Parameter & Signature Handling', () => {
			it('should correctly pass Zod schema inputSchema to parent', async () => {
				const template = create.Template({
					prompt: 'Hello {{ name }}, your age is {{ age }}'
				});

				const tool = create.Tool({
					description: 'A test tool',
					inputSchema: z.object({
						name: z.string().describe('The person\'s name'),
						age: z.number().describe('The person\'s age')
					})
				}, template);

				const result = await tool.execute({ name: 'Charlie', age: 25 }, toolCallOptions);
				expect(result).to.equal('Hello Charlie, your age is 25');
			});

			it('should accept Vercel SDK native object schema format', async () => {
				const template = create.Template({
					prompt: 'City: {{ city }}, Country: {{ country }}'
				});

				const tool = create.Tool({
					description: 'A test tool',
					inputSchema: z.object({
						city: z.string().describe('The city name'),
						country: z.string().describe('The country name')
					})
				}, template);

				const result = await tool.execute({ city: 'Paris', country: 'France' }, toolCallOptions);
				expect(result).to.equal('City: Paris, Country: France');
			});

			it('should accept ToolCallOptions signature', async () => {
				const template = create.Template({
					prompt: 'Hello {{ name }}'
				});

				const tool = create.Tool({
					description: 'A test tool',
					inputSchema: z.object({
						name: z.string()
					})
				}, template);

				const result = await tool.execute(
					{ name: 'David' },
					toolCallOptions
				);
				expect(result).to.equal('Hello David');
			});
		});

		describe('Sub-Suite 2.4: Complex Parent Scenarios', () => {
			it('should work with TextGenerator.withTemplate', async () => {
				const textGenerator = create.TextGenerator.withTemplate({
					model,
					temperature,
					prompt: 'Translate "{{ text }}" to {{ language }}',
					context: {
						language: 'Spanish'
					}
				});

				const tool = create.Tool({
					description: 'A translation tool',
					inputSchema: z.object({
						text: z.string(),
						language: z.string()
					})
				}, textGenerator);

				const result = await tool.execute({ text: 'Hello', language: 'French' }, toolCallOptions);
				expect(result).to.be.a('string');
				expect(result.toLowerCase()).to.contain('bonjour');
			});

			it('should work with Script with context functions', async () => {
				const script = create.Script({
					context: {
						async fetchData(id: string) {
							await new Promise(resolve => setTimeout(resolve, 0));
							return `Data for ${id}`;
						},
						processData(data: string) {
							return data.toUpperCase();
						}
					},
					script: `
						:data
						var rawData = fetchData(input)
						@data.result = processData(rawData)
					`
				});

				const tool = create.Tool({
					description: 'A data processing tool',
					inputSchema: z.object({
						input: z.string()
					})
				}, script);

				const result = await tool.execute({ input: 'user123' }, toolCallOptions);
				expect(result).to.deep.equal({ result: 'DATA FOR USER123' });
			});

			it('should inject _toolCallOptions into renderer context', async () => {
				const template = create.Template({
					prompt: 'Tool call ID: {{ _toolCallOptions.toolCallId }}, Messages count: {{ _toolCallOptions.messages.length }}'
				});

				const tool = create.Tool({
					description: 'A test tool that accesses _toolCallOptions',
					inputSchema: z.object({
						testParam: z.string()
					})
				}, template);

				const result = await tool.execute({ testParam: 'test' }, toolCallOptions);

				// Verify that _toolCallOptions was injected and accessible
				expect(result).to.contain('Tool call ID: test-call-id');
				expect(result).to.contain('Messages count: 1');
			});

			it('should inject _toolCallOptions into script context', async () => {
				const script = create.Script({
					script: `
						:data
						@data.toolCallId = _toolCallOptions.toolCallId
						@data.messagesCount = _toolCallOptions.messages.length
						@data.hasAbortSignal = _toolCallOptions.abortSignal !== undefined
					`
				});

				const tool = create.Tool({
					description: 'A test tool that accesses _toolCallOptions in script',
					inputSchema: z.object({
						testParam: z.string()
					})
				}, script);

				const result = await tool.execute({ testParam: 'test' }, toolCallOptions);

				// Verify that _toolCallOptions was injected and accessible in script
				expect(result).to.have.property('toolCallId', 'test-call-id');
				expect(result).to.have.property('messagesCount', 1);
				expect(result).to.have.property('hasAbortSignal', false); // abortSignal is optional
			});
		});
	});

	describe('Suite 3: End-to-End LLM-Driven Tool Use Tests', () => {
		describe('Simple Tool Identification & Call', () => {
			it('should allow LLM to identify and call weather tool', async () => {
				// Create a simple weather tool
				const weatherTool = create.Tool({
					description: 'Get the current weather for a city',
					inputSchema: z.object({
						city: z.string().describe('The city to get weather for')
					})
				}, create.Template({
					prompt: 'The weather in {{ city }} is sunny and 22°C'
				}));

				// Create an agent with the tool
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { get_weather: weatherTool },
					prompt: 'What is the weather like in London?'
				});

				const result = await agent();
				expect(result.finishReason).to.equal('tool-calls');
				expect(result.toolCalls).to.have.length(1);
				expect(result.toolCalls[0]).to.have.property('toolName', 'get_weather');
				expect(result.toolCalls[0].input).to.deep.equal({ city: 'London' });
			});
		});

		describe('Complex Argument Extraction', () => {
			it('should allow LLM to extract multiple arguments from natural language', async () => {
				const createUserTool = create.Tool({
					description: 'Create a new user profile',
					inputSchema: z.object({
						name: z.string().describe('The user\'s full name'),
						age: z.number().describe('The user\'s age'),
						email: z.string().describe('The user\'s email address')
					})
				}, create.Template({
					prompt: 'Created user: {{ name }}, Age: {{ age }}, Email: {{ email }}'
				}));

				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { create_user: createUserTool },
					prompt: 'Please create a user profile for Jane Doe, who is 29 years old with email jane.doe@example.com'
				});

				const result = await agent();
				expect(result.finishReason).to.equal('tool-calls');
				expect(result.toolCalls).to.have.length(1);
				expect(result.toolCalls[0]).to.have.property('toolName', 'create_user');
				expect(result.toolCalls[0].input).to.deep.equal({
					name: 'Jane Doe',
					age: 29,
					email: 'jane.doe@example.com'
				});
			});
		});

		describe('Tool Rejection (Negative Test)', () => {
			it('should not call tool when prompt does not require it', async () => {
				const weatherTool = create.Tool({
					description: 'Get the current weather for a city',
					inputSchema: z.object({
						city: z.string().describe('The city to get weather for')
					})
				}, create.Template({
					prompt: 'The weather in {{ city }} is sunny and 22°C'
				}));

				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { get_weather: weatherTool },
					prompt: 'What is the capital of France?'
				});

				const result = await agent();
				expect(result.finishReason).to.equal('stop');
				expect(result.toolCalls).to.have.length(0);
				expect(result.text.toLowerCase()).to.contain('paris');
			});
		});

		describe('Tool with Complex LLM Parent', () => {
			it('should work with ObjectGenerator that uses LLM for structured output', async () => {
				const sentimentTool = create.Tool({
					description: 'Analyze the sentiment of a text',
					inputSchema: z.object({
						text: z.string().describe('The text to analyze')
					})
				}, create.ObjectGenerator({
					model,
					temperature,
					schema: z.object({
						sentiment: z.enum(['positive', 'negative', 'neutral']),
						confidence: z.number().min(0).max(1)
					}),
					prompt: 'Analyze the sentiment of this text: {{ text }}'
				}));

				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { analyze_sentiment: sentimentTool },
					prompt: 'What is the sentiment of the text "I love this product, it\'s amazing!"?'
				});

				const result = await agent();
				expect(result.finishReason).to.equal('tool-calls');
				expect(result.toolCalls).to.have.length(1);
				expect(result.toolCalls[0]).to.have.property('toolName', 'analyze_sentiment');
				expect(result.toolCalls[0].input).to.deep.equal({
					text: 'I love this product, it\'s amazing!'
				});
			});
		});
	});
});
