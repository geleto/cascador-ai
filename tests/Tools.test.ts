
import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create } from '../src/index';
import { model, temperature, timeout } from './common';
import { ConfigError } from '../src/validate';
import { z } from 'zod';
import { ModelMessage, stepCountIs } from 'ai';

// Helper function to consume a stream
async function streamToPromise(stream: any) {
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	for await (const _chunk of stream) {
		// Just consume the stream
	}
}



// Configure chai-as-promised
chai.use(chaiAsPromised);

const { expect } = chai;

describe.only('create.Tool', function () {
	this.timeout(timeout); // Increase timeout for tests that call the real API

	const toolCallOptions = {
		toolCallId: 'test-call-id',
		messages: [{ role: 'user' as const, content: 'test' }]
	}

	describe('Suite 1: Validation & Unit Tests', () => {
		describe('Error: Missing inputSchema Schema', () => {
			it('should throw ConfigError when inputSchema schema is missing', () => {
				//@ts-expect-error - missing inputSchema schema
				expect(() => create.TextGenerator.asTool({
					model,
					temperature,
					prompt: 'Hello world',
					description: 'A test tool'
					// Missing inputSchema
				})).to.throw(
					ConfigError,
					'Tool config requires inputSchema schema'
				);
			});
		});

		describe('Error: Streamer Parents Not Supported', () => {


			it('should identify generator types correctly', () => {
				// This test verifies our runtime validation works correctly
				// These should not throw errors
				expect(() => create.TextGenerator.asTool({
					model,
					temperature,
					prompt: 'Hello world',
					description: 'A test tool',
					inputSchema: z.object({})
				})).to.not.throw();

				expect(() => create.ObjectGenerator.asTool({
					model,
					temperature,
					prompt: 'Generate a person',
					schema: z.object({
						name: z.string(),
						age: z.number()
					}),
					description: 'A test tool',
					inputSchema: z.object({})
				})).to.not.throw();
			});

			it('should verify parent types have correct type property', () => {
				//@todo - this is not a tool test
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
					template: 'Hello {{ name }}'
				});

				// Check that each parent has the correct type property
				expect(textGenerator.type).to.equal('GenerateText');
				expect(objectGenerator.type).to.equal('GenerateObject');
				expect(script.type).to.equal('Script');
				expect(template.type).to.equal('Template');
			});
		});



		describe('Structure: Vercel SDK Compatibility', () => {
			it('should return a valid Vercel AI FunctionTool', () => {
				const tool = create.TextGenerator.asTool({
					model,
					temperature,
					prompt: 'Hello world',
					description: 'A test tool',
					inputSchema: z.object({
						name: z.string().describe('The name to greet')
					})
				});

				expect(tool).to.have.property('type', 'function');
				expect(tool).to.have.property('description', 'A test tool');
				expect(tool).to.have.property('inputSchema');
				expect(tool).to.have.property('execute');
				expect(tool.execute).to.be.a('function');
			});
		});

		describe('Error: Invalid inputSchema Schema', () => {
			it('should throw error if inputSchema is not a z.object as our context can only be a z.object', () => {
				expect(() => create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'Hello world',
					description: 'A test tool',
					inputSchema: z.string() // Not z.object
				})).to.throw(
					ConfigError,
					'Tool config requires inputSchema schema'
				);
			});
		});
	});

	describe('Suite 2: Direct Execution & Integration Tests', () => {
		describe('Sub-Suite 2.1: Parent Type Detection & Return Value', () => {
			it('should correctly identify and execute Script parent', async () => {
				const tool = create.Script.asTool({
					context: {
						input: 'test'
					},
					script: `
						:data
						@data.result = "Processed: " + input
					`,
					description: 'A script tool',
					inputSchema: z.object({
						input: z.string()
					})
				});

				const result = await tool.execute({ input: 'hello' }, toolCallOptions);
				expect(result).to.deep.equal({ result: 'Processed: hello' });
			});

			it('should correctly identify and execute ObjectGenerator parent', async () => {
				const tool = create.ObjectGenerator.withTemplate.asTool({
					model,
					temperature,
					schema: z.object({
						greeting: z.string(),
						count: z.number()
					}),
					prompt: 'Generate a greeting for {{ name }} with count {{ count }}',
					description: 'An object generator tool',
					inputSchema: z.object({
						name: z.string(),
						count: z.number()
					})
				});

				const result = await tool.execute({ name: 'John', count: 5 }, toolCallOptions);
				expect(result).to.have.property('greeting');
				expect(result).to.have.property('count', 5);
			});

			it('should correctly identify and execute TextGenerator parent', async () => {
				const tool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'Say hello to {{ name }}',
					description: 'A text generator tool',
					inputSchema: z.object({
						name: z.string()
					})
				});

				const result = await tool.execute({ name: 'Alice' }, toolCallOptions);
				expect(result).to.be.a('string');
				expect(result).to.contain('Alice');
			});

			it('should correctly identify and execute Template parent', async () => {
				const tool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'Hello {{ name }}, you are {{ age }} years old',
					description: 'A template tool',
					inputSchema: z.object({
						name: z.string(),
						age: z.number()
					})
				});

				const result = await tool.execute({ name: 'Bob', age: 30 }, toolCallOptions);
				expect(result).to.equal('Hello Bob, you are 30 years old');
			});
		});

		describe('Sub-Suite 2.2: Execution Error Handling', () => {




			it('should propagate errors from parent renderer', async () => {
				const tool = create.Script.asTool({
					context: {
						async failingFunction() {
							await new Promise(resolve => setTimeout(resolve, 0));
							throw new Error('API Error');
						}
					},
					script: `
						:data
						@data.result = failingFunction()
					`,
					description: 'A test tool',
					inputSchema: z.object({})
				});

				await expect(tool.execute({}, toolCallOptions)).to.be.rejectedWith('API Error');
			});
		});

		describe('Sub-Suite 2.3: Parameter & Signature Handling', () => {
			it('should correctly pass Zod schema inputSchema to parent', async () => {
				const tool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'Hello {{ name }}, your age is {{ age }}',
					description: 'A test tool',
					inputSchema: z.object({
						name: z.string().describe('The person\'s name'),
						age: z.number().describe('The person\'s age')
					})
				});

				const result = await tool.execute({ name: 'Charlie', age: 25 }, toolCallOptions);
				expect(result).to.equal('Hello Charlie, your age is 25');
			});

			it('should accept Vercel SDK native object schema format', async () => {
				const tool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'City: {{ city }}, Country: {{ country }}',
					description: 'A test tool',
					inputSchema: z.object({
						city: z.string().describe('The city name'),
						country: z.string().describe('The country name')
					})
				});

				const result = await tool.execute({ city: 'Paris', country: 'France' }, toolCallOptions);
				expect(result).to.equal('City: Paris, Country: France');
			});

			it('should accept ToolCallOptions signature', async () => {
				const tool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'Hello {{ name }}',
					description: 'A test tool',
					inputSchema: z.object({
						name: z.string()
					})
				});

				const result = await tool.execute(
					{ name: 'David' },
					toolCallOptions
				);
				expect(result).to.equal('Hello David');
			});
		});

		describe('Sub-Suite 2.4: Complex Parent Scenarios', () => {
			it('should work with TextGenerator.withTemplate', async () => {
				const tool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'Translate "{{ text }}" to {{ language }}',
					context: {
						language: 'Spanish'
					},
					description: 'A translation tool',
					inputSchema: z.object({
						text: z.string(),
						language: z.string()
					})
				});

				const result = await tool.execute({ text: 'Hello', language: 'French' }, toolCallOptions);
				expect(result).to.be.a('string');
				expect(result.toLowerCase()).to.contain('bonjour');
			});

			it('should work with Script with context functions', async () => {
				const tool = create.Script.asTool({
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
					`,
					description: 'A data processing tool',
					inputSchema: z.object({
						input: z.string()
					})
				});

				const result = await tool.execute({ input: 'user123' }, toolCallOptions);
				expect(result).to.deep.equal({ result: 'DATA FOR USER123' });
			});

			it('should inject _toolCallOptions into renderer context', async () => {
				const tool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'Tool call ID: {{ _toolCallOptions.toolCallId }}, Messages count: {{ _toolCallOptions.messages.length }}',
					description: 'A test tool that accesses _toolCallOptions',
					inputSchema: z.object({
						testParam: z.string()
					})
				});

				const result = await tool.execute({ testParam: 'test' }, toolCallOptions);

				// Verify that _toolCallOptions was injected and accessible
				expect(result).to.contain('Tool call ID: test-call-id');
				expect(result).to.contain('Messages count: 1');
			});

			it('should inject _toolCallOptions into script context', async () => {
				const tool = create.Script.asTool({
					script: `
						:data
						@data.toolCallId = _toolCallOptions.toolCallId
						@data.messagesCount = _toolCallOptions.messages.length
						@data.hasAbortSignal = _toolCallOptions.abortSignal !== undefined
					`,
					description: 'A test tool that accesses _toolCallOptions in script',
					inputSchema: z.object({
						testParam: z.string()
					})
				});

				const result = await tool.execute({ testParam: 'test' }, toolCallOptions);

				// Verify that _toolCallOptions was injected and accessible in script
				expect(result).to.have.property('toolCallId', 'test-call-id');
				expect(result).to.have.property('messagesCount', 1);
				expect(result).to.have.property('hasAbortSignal', false); // abortSignal is optional
			});

			it('should work with ObjectGenerator.withScript parent', async () => {
				// This parent renderer uses a script to process input before calling the LLM
				const tool = create.ObjectGenerator.withScript.asTool({
					model,
					temperature,
					schema: z.object({ characterName: z.string(), summary: z.string() }),
					prompt: `
						:data
						// The script constructs the final prompt for the LLM
						@data = "Generate a character profile for a " + role + " from the " + genre + " genre."
					`,
					description: 'A character generator tool',
					inputSchema: z.object({
						role: z.string(),
						genre: z.string()
					})
				});

				const result = await tool.execute({ role: 'wizard', genre: 'fantasy' }, toolCallOptions);

				// We just need to verify it returns the expected object shape
				expect(result).to.be.an('object');
				expect(result).to.have.property('characterName');
				expect(result).to.have.property('summary');
			});
		});
	});

	describe('Suite 3: End-to-End LLM-Driven Tool Use Tests', () => {
		describe('Simple Tool Identification & Call', () => {
			it('should allow LLM to identify and call weather tool', async () => {
				// Create a simple weather tool
				const weatherTool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'The weather in {{ city }} is sunny and 22°C',
					description: 'Get the current weather for a city',
					inputSchema: z.object({
						city: z.string().describe('The city to get weather for')
					})
				});

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
				const createUserTool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'Created user: {{ name }}, Age: {{ age }}, Email: {{ email }}',
					description: 'Create a new user profile',
					inputSchema: z.object({
						name: z.string().describe('The user\'s full name'),
						age: z.number().describe('The user\'s age'),
						email: z.string().describe('The user\'s email address')
					})
				});

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
				const weatherTool = create.TextGenerator.withTemplate.asTool({
					model,
					temperature,
					prompt: 'The weather in {{ city }} is sunny and 22°C',
					description: 'Get the current weather for a city',
					inputSchema: z.object({
						city: z.string().describe('The city to get weather for')
					})
				});

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
				const sentimentTool = create.ObjectGenerator.withTemplate.asTool({
					model,
					temperature,
					schema: z.object({
						sentiment: z.enum(['positive', 'negative', 'neutral']),
						confidence: z.number().min(0).max(1)
					}),
					prompt: 'Analyze the sentiment of this text: {{ text }}',
					description: 'Analyze the sentiment of a text',
					inputSchema: z.object({
						text: z.string().describe('The text to analyze')
					})
				});

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

	describe('Suite 4: End-to-End Tool Use Conversation Loop', () => {
		// A robust, object-based tool for consistent test results
		const weatherGenerator = create.ObjectGenerator.withTemplate({
			model,
			temperature,
			schema: z.object({
				city: z.string(),
				tempF: z.number(),
				conditions: z.string(),
			}),
			prompt: 'Return weather for {{ city }}. For San Francisco, return temp 75 and "Sunny".'
		});

		const getWeatherTool = create.ObjectGenerator.withTemplate.asTool({
			model,
			temperature,
			schema: z.object({
				city: z.string(),
				tempF: z.number(),
				conditions: z.string(),
			}),
			prompt: 'Return weather for {{ city }}. For San Francisco, return temp 75 and "Sunny".',
			description: 'Get the weather for a city',
			inputSchema: z.object({ city: z.string() }),
		});

		describe('Manual Tool Result Synthesis', () => {
			it('should allow manually continuing the conversation after a tool call', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { getWeather: getWeatherTool },
					// NOTE: No `stopWhen` is configured. We do the loop ourselves.
				});

				// --- TURN 1: Ask a question that requires a tool ---
				const initialPrompt = 'What is the weather in San Francisco?';
				const messages: ModelMessage[] = [{ role: 'user', content: initialPrompt }];

				const turn1Result = await agent(messages);

				// Assert that the model correctly decided to call the tool
				expect(turn1Result.finishReason).to.equal('tool-calls');
				expect(turn1Result.toolCalls).to.have.lengthOf(1);
				expect(turn1Result.toolCalls[0].toolName).to.equal('getWeather');

				// --- STATE UPDATE: Manually feed the results back ---
				// We append the assistant's action and the tool's result to our history
				const responseMessages = turn1Result.response.messages;
				messages.push(...responseMessages);

				// The history now contains the user prompt, the assistant's tool_call, and the tool_result
				expect(messages).to.have.lengthOf(3);
				expect(messages[1].role).to.equal('assistant');
				expect(messages[2].role).to.equal('tool');

				// --- TURN 2: Ask the agent to synthesize the final answer ---
				// We call the agent again with the complete history
				const turn2Result = await agent(messages);

				// Assert that the model has now generated a final text answer
				expect(turn2Result.finishReason).to.equal('stop');
				expect(turn2Result.toolCalls.length).to.equal(0);
				expect(turn2Result.text.toLowerCase()).to.include('75').and.to.include('sunny');
			});
		});

		describe('Automated Tool Result Synthesis with stopWhen', () => {
			it('should automate the full tool-use loop in a single call', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { getWeather: getWeatherTool },
					// NOTE: `stopWhen` automates the second turn for us
					stopWhen: stepCountIs(2),
				});

				const result = await agent('What is the weather in San Francisco?');

				// Assert the final state after the automated loop
				expect(result.finishReason).to.equal('stop');
				expect(result.toolCalls.length).to.equal(0);
				expect(result.text.toLowerCase()).to.include('75').and.to.include('sunny');

				// We can also inspect the intermediate steps
				expect(result.steps).to.have.lengthOf(2);
				expect(result.steps[0].finishReason).to.equal('tool-calls'); // Step 1 was the tool call
				expect(result.steps[1].finishReason).to.equal('stop'); // Step 2 was the text synthesis
			});
		});

		describe('Multi-Turn Conversation with Automated Tool Use', () => {
			it('should maintain chat history across turns, including a tool-use turn', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { getWeather: getWeatherTool },
					stopWhen: stepCountIs(2),
				});

				let messageHistory: ModelMessage[] = [];

				// --- TURN 1: Simple chat ---
				const turn1Result = await agent('Hi, how are you?', messageHistory);
				expect(turn1Result.finishReason).to.equal('stop');

				// Update history
				messageHistory = turn1Result.response.messageHistory;
				expect(messageHistory).to.have.lengthOf(2);

				// --- TURN 2: Tool-using chat ---
				const turn2Result = await agent('Great! Now what is the weather in San Francisco?', messageHistory);
				expect(turn2Result.finishReason).to.equal('stop');
				expect(turn2Result.text.toLowerCase()).to.include('75').and.to.include('sunny');

				// Update history again
				messageHistory = turn2Result.response.messageHistory;

				// The final history should contain all messages from both turns
				expect(messageHistory).to.have.lengthOf(6);

				const finalAssistantMessage = messageHistory[5];

				// --- CORRECTED AND TYPE-SAFE ASSERTIONS ---

				expect(finalAssistantMessage.role).to.equal('assistant');

				// TYPE GUARD 1: First, we must confirm that `content` is an array.
				// This eliminates the `string` type from the union for `content`.
				expect(Array.isArray(finalAssistantMessage.content)).to.equal(true);

				// Now we can safely proceed inside an `if` block for type narrowing.
				if (Array.isArray(finalAssistantMessage.content)) {
					expect(finalAssistantMessage.content).to.have.lengthOf(1);
					const finalContentPart = finalAssistantMessage.content[0];

					// TYPE GUARD 2: Now that we have a part, we must check its `type`
					// to safely access its specific properties like `.text`.
					expect(finalContentPart.type).to.equal('text');
					if (finalContentPart.type === 'text') {
						// Inside this block, TypeScript is certain that `finalContentPart`
						// is a `TextPart` and has a `text` property.
						expect(finalContentPart.text).to.be.a('string');
						expect(finalContentPart.text.toLowerCase()).to.include('sunny');
					}
				}
			});
		});
	});

	describe('Suite 5: Advanced Tool Usage & Integration', () => {
		// --- Test Setup for Suite 5 ---
		const errorTool = create.Script.asTool({
			script: `:data
			throw("Custom API Error")`,
			description: 'A tool that always throws an error',
			inputSchema: z.object({}),
		});

		const loggingTool = create.TextGenerator.withTemplate.asTool({
			model,
			temperature,
			prompt: `ToolCallId: {{ _toolCallOptions.toolCallId }}, Step Messages Count: {{ _toolCallOptions.messages.length }}`,
			description: 'A tool that logs its call options',
			inputSchema: z.object({}),
		});

		const weatherTool = create.TextGenerator.withTemplate.asTool({
			model,
			temperature,
			prompt: 'Weather in {{ city }} is good.',
			description: 'Get the weather',
			inputSchema: z.object({ city: z.string() })
		});
		// --- End Test Setup ---

		describe('Tool Use with TextStreamer', () => {
			it('should allow an LLM to call a tool from a TextStreamer', async () => {
				const agent = create.TextStreamer({
					model,
					temperature,
					tools: { getWeather: weatherTool },
				});

				const result = await agent('What is the weather in San Francisco?');

				// Await the toolCalls promise from the stream result
				const toolCalls = await result.toolCalls;

				expect(toolCalls).to.have.lengthOf(1);
				expect(toolCalls[0].toolName).to.equal('getWeather');
				expect(toolCalls[0].input).to.deep.equal({ city: 'San Francisco' });

				// Ensure the stream finishes
				await streamToPromise(result.fullStream);
			});
		});

		describe('Tool Choice Validation', () => {
			it('should force a tool call when toolChoice is "required"', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { getWeather: weatherTool },
					toolChoice: 'required',
				});

				const result = await agent('Hello.'); // A prompt that wouldn't normally trigger a tool

				expect(result.finishReason).to.equal('tool-calls');
				expect(result.toolCalls).to.have.lengthOf(1);
				expect(result.toolCalls[0].toolName).to.equal('getWeather');
			});

			it('should force a specific tool call when toolChoice specifies a tool name', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { getWeather: weatherTool, log: loggingTool },
					toolChoice: { type: 'tool', toolName: 'log' },
				});

				// This prompt clearly asks for the *other* tool, but toolChoice should override it.
				const result = await agent('What is the weather in SF?');

				expect(result.finishReason).to.equal('tool-calls');
				expect(result.toolCalls).to.have.lengthOf(1);
				expect(result.toolCalls[0].toolName).to.equal('log'); // Verifies the override worked
			});
		});

		describe('Error Propagation in LLM Loops', () => {
			it('should handle tool execution errors and report them back to the LLM', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { errorTool: errorTool },
					stopWhen: stepCountIs(2),
				});

				const result = await agent('Use the error tool.');

				// The loop should stop because the final response is text (the error summary)
				expect(result.finishReason).to.equal('stop');

				// The first step should contain the tool call and the resulting error
				const step1 = result.steps[0];
				expect(step1.finishReason).to.equal('tool-calls');
				expect(step1.toolResults).to.have.lengthOf(1);
				expect(step1.toolResults[0].isError).to.equal(true);
				expect(String(step1.toolResults[0].output)).to.include('Custom API Error');

				// The LLM's final text should acknowledge the error
				expect(result.text.toLowerCase()).to.include('error');
			});
		});

		describe('Accessing _toolCallOptions in LLM Loops', () => {
			it('should correctly inject _toolCallOptions into a tool called by an LLM', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { loggingTool: loggingTool },
					stopWhen: stepCountIs(2),
				});

				const result = await agent('Use the logging tool.');

				const step1 = result.steps[0];
				const toolCallId = step1.toolCalls[0].toolCallId;
				const toolResultOutput = step1.toolResults[0].output as string;

				// The rendered output from the tool's template should contain the correct toolCallId
				expect(toolResultOutput).to.include(`ToolCallId: ${toolCallId}`);
				// In a non-streaming, single-prompt call, the message history for the step is just the user prompt
				expect(toolResultOutput).to.include('Step Messages Count: 1');
			});
		});
	});

	describe('Suite 6: Tool with `execute` Function', () => {
		// --- Test Setup for Suite 6 ---
		const calculatorTool = create.Tool({
			description: 'A simple calculator that can add or subtract.',
			inputSchema: z.object({
				a: z.number(),
				b: z.number(),
				operation: z.enum(['add', 'subtract'])
			}),
			execute: async ({ a, b, operation }: { a: number, b: number, operation: 'add' | 'subtract' }) => {
				await new Promise(resolve => setTimeout(resolve, 100));
				if (operation === 'add') {
					return { result: a + b };
				}
				return { result: a - b };
			}
		});
		// --- End Test Setup ---

		it('should correctly execute the provided function with given arguments', async () => {
			const resultAdd = await calculatorTool.execute({ a: 10, b: 5, operation: 'add' }, toolCallOptions);
			expect(resultAdd).to.deep.equal({ result: 15 });

			const resultSubtract = await calculatorTool.execute({ a: 10, b: 5, operation: 'subtract' }, toolCallOptions);
			expect(resultSubtract).to.deep.equal({ result: 5 });
		});

		it('should be callable by an LLM in an automated loop', async () => {
			const agent = create.TextGenerator({
				model,
				temperature,
				tools: { calculate: calculatorTool },
				stopWhen: stepCountIs(2),
			});

			const result = await agent('What is 17 minus 8?');

			expect(result.finishReason).to.equal('stop');
			expect(result.text).to.include('9');

			// Verify the intermediate tool call was parsed and executed correctly
			const step1 = result.steps[0];
			expect(step1.toolCalls[0].toolName).to.equal('calculate');
			expect(step1.toolCalls[0].input).to.deep.equal({ a: 17, b: 8, operation: 'subtract' });
			expect(step1.toolResults[0].output).to.deep.equal({ result: 9 });
		});
	});
});
