/* eslint-disable @typescript-eslint/no-unused-expressions */
import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { z } from 'zod';
import { create } from '../src/index';
import { model, temperature, timeout } from './common';
import { ConfigError } from '../src/validate';
import {
	extractCallArguments,
	// The augment functions are tested through the public API, so direct import is not needed.
	// augmentGenerateText,
	// augmentStreamText,
} from '../src/factories/llm-renderer';
import { ModelMessage, stepCountIs } from 'ai';
import { streamToString } from './TextStreamer.test';

// Configure chai-as-promised
chai.use(chaiAsPromised);
const { expect } = chai;

describe('Messages, Conversation & Integration', function () {
	this.timeout(timeout); // Increase timeout for tests that call the real API

	// --- Unit Tests (Isolated Logic) ---
	describe('Unit Tests (Isolated Logic)', () => {
		describe('extractCallArguments', () => {
			const messages: ModelMessage[] = [{ role: 'user', content: 'hello' }];
			const context = { user: 'test' };
			const prompt = 'a prompt';

			it('should parse a single messages argument', () => {
				const result = extractCallArguments(messages);
				expect(result).to.deep.equal({ prompt: undefined, messages, context: undefined });
			});

			it('should parse a single context argument', () => {
				const result = extractCallArguments(context);
				expect(result).to.deep.equal({ prompt: undefined, messages: undefined, context });
			});

			it('should parse a single prompt argument', () => {
				const result = extractCallArguments(prompt);
				expect(result).to.deep.equal({ prompt, messages: undefined, context: undefined });
			});

			it('should parse prompt and messages arguments', () => {
				const result = extractCallArguments(prompt, messages);
				expect(result).to.deep.equal({ prompt, messages, context: undefined });
			});

			it('should parse prompt and context arguments', () => {
				const result = extractCallArguments(prompt, context);
				expect(result).to.deep.equal({ prompt, messages: undefined, context });
			});

			it('should parse messages and context arguments', () => {
				const result = extractCallArguments(messages, context);
				expect(result).to.deep.equal({ prompt: undefined, messages, context });
			});

			it('should parse prompt, messages, and context arguments', () => {
				const result = extractCallArguments(prompt, messages, context);
				expect(result).to.deep.equal({ prompt, messages, context });
			});

			it('should throw when messages are provided twice', () => {
				expect(() => extractCallArguments(messages, messages)).to.throw('Messages provided multiple times across arguments');
			});

			it('should throw when context is provided twice', () => {
				expect(() => extractCallArguments(context, context)).to.throw('Context provided multiple times across arguments');
			});

			it('should throw on invalid third argument (context without messages)', () => {
				expect(() => extractCallArguments(prompt, context, context)).to.throw('Third argument (context) is only allowed when the second argument is messages.');
			});

			it('should throw when the third argument is not a context object', () => {
				expect(() => extractCallArguments(prompt, messages, messages as unknown as Record<string, unknown>)).to.throw('Third argument (context) must be an object');
			});
		});

		describe('Result Augmentation (via public API)', () => {
			const systemMessage: ModelMessage = { role: 'system', content: 'You are a test bot.' };

			// We test augmentation through the public API, as the internal `augment` functions are an implementation detail.
			it('should augment generateText result with messageHistory', async () => {
				const generator = create.TextGenerator({
					model,
					temperature,
					messages: [systemMessage],
				});

				const result = await generator('Reply with "OK".');

				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;

				// config system + (user + system + assistant)
				expect(history).to.have.lengthOf(2);
				expect(history[0].role).to.equal('user');
				expect(history[1].role).to.equal('assistant');

				// Check memoization (identity check)
				const history2 = result.response.messageHistory;
				expect(history).to.equal(history2);
			});

			it('should augment streamText result with messageHistory', async () => {
				const streamer = create.TextStreamer({
					model,
					temperature,
					messages: [systemMessage],
				});

				const result = await streamer('Reply with "OK".');
				// consume stream to resolve the response promise
				for await (const chunk of result.textStream) { void chunk; }

				const response = await result.response;
				expect(response).to.have.property('messageHistory');

				const history = response.messageHistory;
				expect(history).to.have.lengthOf(2); // (user + assistant), config excluded
				expect(history[0].role).to.equal('user');

				// Check memoization (identity check)
				const history2 = response.messageHistory;
				expect(history).to.equal(history2);
			});
		});
	});

	// --- Integration Tests (Factory-Level Behavior) ---
	describe('Integration Tests (Factory-Level Behavior)', () => {
		const simpleUserMessage: ModelMessage[] = [{ role: 'user', content: 'This is a test. Reply only with the word "Acknowledged", without any other text or punctuation, preserving the case.' }];
		const simpleSystemMessage: ModelMessage[] = [{ role: 'system', content: 'You are a test bot.' }];

		describe('Call-Time Validation & Precedence', () => {
			it('should succeed in text mode with only messages', async () => {
				const generator = create.TextGenerator({ model, temperature });
				const promise = generator(simpleUserMessage);
				await expect(promise).to.not.be.rejected;
				expect((await promise).text).to.equal('Acknowledged');
			});

			it('should fail in template mode with only messages and no configured prompt', async () => {
				const generator = create.TextGenerator.withTemplate({ model, temperature });
				// The call is invalid because a prompt string is required for rendering
				// @ts-expect-error - we want to test the error
				const promise = generator(simpleUserMessage);
				await expect(promise).to.be.rejectedWith(ConfigError, /A string prompt \(containing the templ/);
			});

			it('should use a one-off template string over a configured prompt', async () => {
				const generator = create.TextGenerator.withTemplate({
					model,
					temperature,
					prompt: 'Config: {{name}}',
					context: { name: 'World' },
				});
				const result = await generator('Output only this: "{{name}}" without any other text or punctuation, preserving the case.');
				expect(result.text).to.equal('World');
			});

			it('should merge runtime context with configured context', async () => {
				const generator = create.TextGenerator.withTemplate({
					model,
					temperature,
					prompt: 'Output only this, with spaces: {{a}} {{b}} {{c}}',
					context: { a: 1, b: 2 },
				});
				const result = await generator({ b: 99, c: 3 });
				expect(result.text).to.equal('1 99 3');
			});
		});

		describe('Text Mode Renderers', () => {
			it('should use call-time messages over configured messages', async () => {
				const generator = create.TextGenerator({
					model,
					temperature,
					messages: [{ role: 'system', content: 'Always answer in Spanish.' }],
				});
				// This system message should override the configured one.
				const result = await generator('Say "hello".', [{ role: 'system', content: 'Always answer in French.' }]);
				expect(result.text.toLowerCase()).to.contain('bonjour');
			});

			it('should append a non-empty prompt as a user message and augment the result', async () => {
				const generator = create.TextGenerator({ model, temperature, messages: simpleSystemMessage });
				const result = await generator('Reply only with "OK".');

				expect(result.text).to.equal('OK');
				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;
				expect(history).to.have.lengthOf(2); // user, assistant (config excluded)
				expect(history[0].content).to.equal('Reply only with "OK".');
			});
		});

		describe('Template & Script Mode Renderers', () => {
			it('should append a rendered template string as a user message and augment the result', async () => {
				const generator = create.TextGenerator.withTemplate({
					model,
					temperature,
					messages: simpleSystemMessage,
					prompt: 'The user instruction is: {{instruction}}. Reply only with "Confirmed", without any other text or punctuation, preserving the case.',
				});
				const result = await generator({ instruction: 'Execute' });

				expect(result.text).to.equal('Confirmed');
				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;
				expect(history[0].content).to.equal('The user instruction is: Execute. Reply only with "Confirmed", without any other text or punctuation, preserving the case.');
			});

			it('should append a rendered script string as a user message and augment the result', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
					messages: simpleSystemMessage,
				});
				const result = await generator(
					`:data
					@data = "Execute order " + order + ". Reply only with the number and nothing else." `,
					{ order: '66' }
				);

				expect(result.text).to.equal('66');
				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;
				expect(history[0].content).to.equal('Execute order 66. Reply only with the number and nothing else.');
			});

			it('should concatenate messages from a script with base messages and augment the result', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
					messages: [{ role: 'system', content: 'The answer is always 42.' }],
				});
				const result = await generator(
					`:data
					@data = [{ role: "user", content: "What is the answer to everything?" }]`
				);
				expect(result.text).to.include('42');
				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;
				expect(history).to.have.lengthOf(2); // user, assistant (config excluded)
				expect(history[0].role).to.equal('user');
			});

			it('should use only the script-returned messages if no base messages exist and augment the result', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
				});
				const result = await generator(`:data
					@data = [{ role: "user", content: "Output only the number 2." }]`);
				expect(result.text).to.equal('2');
				expect(result.response).to.have.property('messageHistory');
				const history = result.response.messageHistory;
				expect(history).to.have.lengthOf(2); // user, assistant
			});

			// New tests for messages vs messageHistory composition
			it('config messages + argument messages + script in argument that returns messages', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
					messages: [{ role: 'system', content: 'Config system.' }],
				});
				const argMessages: ModelMessage[] = [{ role: 'user', content: 'Previous turn.' }];
				const script = `
					:data
					@data = [{ role: "user", content: 'Say ONLY "PONG".' }]
				`;
				const result = await generator(script, argMessages);

				const history = result.response.messageHistory;
				expect(history.map((m: ModelMessage) => m.role)).to.deep.equal(['user', 'user', 'assistant']);
				expect(history[0].content).to.equal('Previous turn.');
				expect(history[1].content).to.equal('Say ONLY "PONG".');

				const msgs = result.response.messages;
				expect(msgs).to.have.lengthOf(2);
				expect(msgs[0].role).to.equal('user');
				expect(msgs[0].content).to.equal('Say ONLY "PONG".');
				expect(msgs[1].role).to.equal('assistant');
			});

			it('config messages + argument messages; script in config returns messages; no prompt argument', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
					messages: [{ role: 'system', content: 'Config system.' }],
					prompt: `
						:data
						@data = [{ role: "user", content: "Return only 123" }]
					`,
				});
				const argMessages: ModelMessage[] = [{ role: 'user', content: 'Prev user.' }];
				// First arg undefined so the configured script runs; second arg passes messages
				const result = await generator(argMessages);

				const history = result.response.messageHistory;
				expect(history.map((m: ModelMessage) => m.role)).to.deep.equal(['user', 'user', 'assistant']);
				expect(history[0].content).to.equal('Prev user.');
				expect(history[1].content).to.equal('Return only 123');

				const msgs = result.response.messages;
				expect(msgs).to.have.lengthOf(2);
				expect(msgs[0].role).to.equal('user');
				expect(msgs[0].content).to.equal('Return only 123');
				expect(msgs[1].role).to.equal('assistant');
			});

			it('argument-only: messages + script in argument returns messages', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
				});
				const argMessages: ModelMessage[] = [{ role: 'user', content: 'Prior user.' }];
				const script = `:data\n\t@data = [{ role: "user", content: "Output only the number 7" }]`;
				const result = await generator(script, argMessages);

				const history = result.response.messageHistory;
				expect(history.map((m: ModelMessage) => m.role)).to.deep.equal(['user', 'user', 'assistant']);
				expect(history[1].content).to.match(/Output only the number 7/i);

				const msgs = result.response.messages;
				expect(msgs).to.have.lengthOf(2);
				expect(msgs[0].role).to.equal('user');
				expect(msgs[0].content).to.match(/Output only the number 7/i);
				expect(msgs[1].role).to.equal('assistant');
			});

			it('should throw ZodError if a script returns a malformed message object', async () => {
				const generator = create.TextGenerator.withScript({
					model,
					temperature,
				});
				await expect(generator(
					`:data
					@data = [{ content: "This is invalid" }]`
				)).to.be.rejectedWith('Script output validation failed');
			});
		});
	});

	// --- Advanced Scenarios & End-to-End Workflows ---
	describe('Advanced Scenarios & End-to-End Workflows', () => {
		describe('Multi-Turn Conversation Chaining', () => {
			const agent = create.TextGenerator({
				model,
				temperature,
				messages: [{ role: 'system', content: 'You are a counter. When the user says "count", you reply with the next number, starting at 1. Only output the number.' }],
			});

			it('should initiate a conversation and return augmented history and then use it in new prompt', async () => {
				const result = await agent('count');
				expect(result.text).to.equal('1');

				const conversationHistory = result.response.messageHistory;
				expect(conversationHistory).to.be.an('array').with.lengthOf(2);
				expect(conversationHistory[0].role).to.equal('user');
				expect(conversationHistory[1].role).to.equal('assistant');
			});

			it('should continue a conversation using history and a new prompt', async () => {
				const firstTurn = await agent('count');
				expect(firstTurn.text).to.equal('1');
				const historyAfterFirst = firstTurn.response.messageHistory;

				const result = await agent('count', historyAfterFirst);
				expect(result.text).to.equal('2');

				const conversationHistory = result.response.messageHistory;
				expect(conversationHistory).to.be.an('array').with.lengthOf(4);
				expect(conversationHistory[2].role).to.equal('user');
				expect(conversationHistory[3].role).to.equal('assistant');
			});

			it('should continue with only history and no new prompt', async () => {
				// Build a conversation history up to two turns
				const baseAgent = create.TextGenerator({
					model,
					temperature,
					messages: [{ role: 'system', content: 'You are a counter. When the user says "count", you reply with the next number, starting at 1. Only output the number.' }],
				});
				const firstTurn = await baseAgent('count');
				const secondTurn = await baseAgent('count', firstTurn.response.messageHistory);
				const conversationHistory = secondTurn.response.messageHistory;

				const agentWithMemory = create.TextGenerator({
					model,
					temperature,
					prompt: 'Based on our chat, what was the last number I asked you to count to?',
				});
				const result = await agentWithMemory(conversationHistory);
				expect(result.text).to.include('2');
				expect(result.response).to.have.property('messageHistory');
			});

			const streamAgent = create.TextStreamer({
				model,
				temperature,
				messages: [{ role: 'system', content: 'You are a counter. When the user says "count", you reply with the next number, starting at 1. Only output the number.' }],
			});

			it('should initiate a streamed conversation and return augmented history', async () => {
				const result = await streamAgent('count');
				const streamedText = await streamToString(result.textStream);
				expect(streamedText).to.equal('1');

				const response = await result.response;
				const conversationHistory = response.messageHistory;
				expect(conversationHistory).to.be.an('array').with.lengthOf(2);
				expect(conversationHistory[0].role).to.equal('user');
				expect(conversationHistory[1].role).to.equal('assistant');
			});

			it('should continue a streamedconversation using history and a new prompt', async () => {
				const firstTurn = await streamAgent('count');
				const firstText = await streamToString(firstTurn.textStream);
				expect(firstText).to.equal('1');

				const historyAfterFirst = (await firstTurn.response).messageHistory;

				const secondTurn = await streamAgent('count', historyAfterFirst);
				const secondText = await streamToString(secondTurn.textStream);
				expect(secondText).to.equal('2');

				const conversationHistory = (await secondTurn.response).messageHistory;
				expect(conversationHistory).to.be.an('array').with.lengthOf(4);
				expect(conversationHistory[2].role).to.equal('user');
				expect(conversationHistory[3].role).to.equal('assistant');
			});
		});

		describe('Messaging with Tool Calls', () => {

			const getWeatherTool = create.ObjectGenerator.withTemplate.asTool({
				model,
				temperature,
				schema: z.object({
					city: z.string(),
					tempF: z.number(),
					conditions: z.string(),
				}),
				description: 'Get the weather for a city',
				inputSchema: z.object({ city: z.string() }),
				prompt: 'Return the weather for {{ city }}. If the city is San Francisco, return temp 75 and conditions "Sunny". Otherwise, return an error in the conditions field.'
			});

			it('should allow manual continuation of a conversation after a tool call', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { getWeather: getWeatherTool } as const,
					// NO stopWhen - we are doing this manually
				} as const);

				const initialPrompt = 'What is the weather in San Francisco?';
				const messages: ModelMessage[] = [{ role: 'user', content: initialPrompt }];

				// --- TURN 1: Model decides to call a tool ---
				const turn1Result = await agent(messages);

				// Assertions for the first turn
				expect(turn1Result.finishReason).to.equal('tool-calls');
				expect(turn1Result.text).to.not.be.null; // Can be empty or conversational filler
				expect(turn1Result.toolCalls).to.have.lengthOf(1);
				expect(turn1Result.toolCalls[0].toolName).to.equal('getWeather');
				expect(turn1Result.toolCalls[0].input).to.deep.equal({ city: 'San Francisco' });

				// --- BETWEEN TURNS: Update the message history ---
				// Append the assistant's message (with tool_call) and the tool's result message
				const turn1ResponseMessages = turn1Result.response.messages;
				messages.push(...turn1ResponseMessages);

				// At this point, `messages` looks like this:
				// 1. { role: 'user', content: 'What is the weather...' }
				// 2. { role: 'assistant', content: [{ type: 'tool-call', ... }] }
				// 3. { role: 'tool', content: [{ type: 'tool-result', ... }] }
				expect(messages).to.have.lengthOf(3);
				expect(messages[1].role).to.equal('assistant');
				expect(messages[2].role).to.equal('tool');

				// --- TURN 2: Model synthesizes the final answer from tool results ---
				// We pass the FULL message history back to the agent.
				const turn2Result = await agent(messages);

				// Assertions for the final turn
				expect(turn2Result.finishReason).to.equal('stop');
				expect(turn2Result.toolCalls).to.be.empty;
				expect(turn2Result.text.toLowerCase()).to.include('75').and.to.include('sunny');
				expect(turn2Result.text.toLowerCase()).to.include('san francisco');
			});

			/*it('should automatically handle the tool-use loop with stopWhen', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { getWeather: getWeatherTool },
					// This time, we automate the loop
					stopWhen: stepCountIs(2),
				});

				const initialPrompt = 'What is the weather in San Francisco?';

				// --- SINGLE CALL: The agent handles both turns internally ---
				const result = await agent(initialPrompt);

				// Assertions for the final result
				expect(result.finishReason).to.equal('stop');
				expect(result.toolCalls).to.be.empty;
				expect(result.text.toLowerCase()).to.include('75').and.to.include('sunny');

				// We can also inspect the intermediate steps
				expect(result.steps).to.have.lengthOf(2);

				// Step 1: The tool call
				const step1 = result.steps[0];
				expect(step1.finishReason).to.equal('tool-calls');
				expect(step1.toolCalls).to.have.lengthOf(1);
				expect(step1.toolResults).to.have.lengthOf(1);
				expect(step1.toolResults[0].output).to.deep.equal({ city: 'San Francisco', tempF: 75, conditions: 'Sunny' });

				// Step 2: The final text generation
				const step2 = result.steps[1];
				expect(step2.finishReason).to.equal('stop');
				expect(step2.toolCalls).to.be.empty;
				expect(step2.text.toLowerCase()).to.include('75');
			});*/

			it('should handle a multi-turn conversation where one turn involves automated tool use', async () => {
				const agent = create.TextGenerator({
					model,
					temperature,
					tools: { getWeather: getWeatherTool },
					stopWhen: stepCountIs(2), // Automate the tool-use loop when it occurs
				});

				// 1. Initialize the conversation history
				let messageHistory: ModelMessage[] = [];

				// --- TURN 1: A simple chat message without tool use ---
				const prompt1 = 'Hello there!';
				const turn1Result = await agent(prompt1, messageHistory);

				// Assertions for the first turn (simple response)
				expect(turn1Result.finishReason).to.equal('stop');
				expect(turn1Result.toolCalls).to.be.empty;
				expect(turn1Result.text).to.be.a('string').and.not.be.empty;

				// 2. Update the history after the first turn
				// `response.messageHistory` contains the full history (old messages + new ones from this turn)
				messageHistory = turn1Result.response.messageHistory;

				expect(messageHistory).to.have.lengthOf(2); // [user prompt, assistant reply]
				expect(messageHistory[0].role).to.equal('user');
				expect(messageHistory[0].content).to.equal(prompt1);
				expect(messageHistory[1].role).to.equal('assistant');


				// --- TURN 2: A message that requires tool use ---
				const prompt2 = 'Great, thanks! Now, can you tell me the weather in San Francisco?';

				// Pass the new prompt AND the existing message history
				const turn2Result = await agent(prompt2, messageHistory);

				// Assertions for the final result of the second turn
				expect(turn2Result.finishReason).to.equal('stop');
				expect(turn2Result.toolCalls).to.be.empty; // Final result has no pending tool calls
				expect(turn2Result.text.toLowerCase()).to.include('75').and.to.include('sunny');

				// We can also inspect the intermediate steps for this turn
				expect(turn2Result.steps).to.have.lengthOf(2);
				expect(turn2Result.steps[0].finishReason).to.equal('tool-calls'); // Step 1 was the tool call
				expect(turn2Result.steps[1].finishReason).to.equal('stop'); // Step 2 was the final text generation

				// 3. Update the history again after the complex tool-use turn
				messageHistory = turn2Result.response.messageHistory;

				// The final history should contain all messages from both turns
				// Turn 1 (2 messages) + Turn 2 (4 messages: user, assistant+tool_call, tool_result, final_assistant_reply)
				expect(messageHistory).to.have.lengthOf(6);

				// Verify the structure of the final messages
				expect(messageHistory[0].role).to.equal('user'); // Turn 1 User
				expect(messageHistory[1].role).to.equal('assistant'); // Turn 1 Assistant
				expect(messageHistory[2].role).to.equal('user'); // Turn 2 User
				expect(messageHistory[3].role).to.equal('assistant'); // Turn 2 Assistant (with tool call)
				expect(messageHistory[4].role).to.equal('tool'); // Turn 2 Tool Result
				expect(messageHistory[5].role).to.equal('assistant'); // Turn 2 Assistant (final synthesis)
			});
		});

		describe('Cross-Renderer Conversation Chaining', () => {
			it('should pass conversation history from a TextGenerator to an ObjectGenerator', async () => {
				const chatAgent = create.TextGenerator({
					model,
					temperature,
					messages: [{ role: 'system', content: 'Have a casual conversation about a user\'s order.' }],
				});

				// Have a conversation
				const res1 = await chatAgent('Hi, I need to order a large pizza.');
				const history1 = res1.response.messageHistory;
				const res2 = await chatAgent('Please add pepperoni and mushrooms.', history1);
				const finalHistory = res2.response.messageHistory;

				// Extract from the conversation
				const extractionAgent = create.ObjectGenerator.withTemplate({
					model,
					schema: z.object({
						size: z.string(),
						toppings: z.array(z.string()),
					}),
					prompt: 'From the above conversation, extract the final pizza order into a JSON object.',
				});

				const result = await extractionAgent(finalHistory);

				expect(result.object).to.deep.equal({
					size: 'large',
					toppings: ['pepperoni', 'mushrooms'],
				});
			});
		});
	});
});