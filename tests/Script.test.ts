import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create } from '../src/index';
import { model, temperature, StringLoader, timeout } from './common';
import { ConfigError } from '../src/validate';
import { z } from 'zod';
import { streamObject } from 'ai';

chai.use(chaiAsPromised);
const { expect } = chai;

describe('create.Script', function () {
	this.timeout(timeout);

	// --- CORE FUNCTIONALITY ---

	describe('Core Functionality', () => {
		it('executes a minimal script and saves tokens via @data', async () => {
			const scriptRunner = create.Script({
				script: `
          :data
          var message = "Hello Script"
          @data = { result: message }
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ result: 'Hello Script' });
		});

		it('returns full output object if no :data directive (both @data and @text)', async () => {
			const scriptRunner = create.Script({
				script: `
          var message = "Hello"
          @data.greeting = message
          @text("Done")
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({
				data: { greeting: 'Hello' },
				text: 'Done',
			});
		});

		it('uses initial context variables', async () => {
			const scriptRunner = create.Script({
				context: { user: 'Alice', greeting: 'Welcome' },
				script: `
          :data
          @data.message = greeting + ", " + user + "!"
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ message: 'Welcome, Alice!' });
		});

		it('merges and overrides context at runtime', async () => {
			const scriptRunner = create.Script({
				context: { user: 'Alice', role: 'admin' },
				script: `:data
				@data.message = "User: " + user + ", Role: " + role`
			});
			const result = await scriptRunner({ user: 'Bob' });
			expect(result).to.deep.equal({ message: 'User: Bob, Role: admin' });
		});

		it('accepts script string at runtime', async () => {
			const scriptRunner = create.Script({
				context: { val: 10 },
			});
			const result = await scriptRunner(
				`:data
				@data.result = val * 2`
			);
			expect(result).to.deep.equal({ result: 20 });
		});

		it('handles parallel execution of async context functions', async () => {
			const scriptRunner = create.Script({
				context: {
					fetchUser: async () => {
						await new Promise(resolve => setTimeout(resolve, 0));
						return { name: 'Carol' };
					},
					fetchPermissions: async () => {
						await new Promise(resolve => setTimeout(resolve, 0));
						return ['read', 'write'];
					},
				},
				script: `
          :data
          var user = fetchUser()
          var perms = fetchPermissions()
          @data.name = user.name
          @data.permissions = perms
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ name: 'Carol', permissions: ['read', 'write'] });
		});

		it('should have correct type property', () => {
			const scriptRunner = create.Script({
				script: ':data @data = "Hello"'
			});

			const scriptWithContext = create.Script({
				context: { name: 'World' },
				script: ':data @data = "Hello " + name'
			});

			// Check that Script instances have the correct type
			expect(scriptRunner.type).to.equal('Script');
			expect(scriptWithContext.type).to.equal('Script');
		});
	});

	describe('Vanilla Vercel AI Stream Consumer', () => {

		it('should stream an array of objects and collect them successfully', async () => {
			const characterSchema = z.object({
				name: z.string().describe('The name of the character.'),
				description: z.string().describe('A short description of the character.'),
			});

			const { elementStream } = streamObject({
				model, temperature,
				output: 'array',
				schema: characterSchema,
				prompt: `Generate three short fantasy character descriptions.
					The tree character names are: Gandalf, Aragorn and Legolas.
					Each description must include the character name.
					Output them in this exact order: Gandalf, Aragorn, Legolas.`,
			});

			// Array to collect the final, complete objects
			const collectedCharacters: z.infer<typeof characterSchema>[] = [];
			// Consume the elementStream. Each `element` is a complete, validated object.
			for await (const element of elementStream) {
				collectedCharacters.push(element);
			}

			// Assertions to verify the result
			expect(collectedCharacters).to.be.an('array').with.lengthOf(3);

			// Check if the collected objects have the required structure
			expect(collectedCharacters[0]).to.have.all.keys('name', 'description');
			expect(collectedCharacters[1]).to.have.all.keys('name', 'description');
			expect(collectedCharacters[2]).to.have.all.keys('name', 'description');

			// Optional: Check if the content seems plausible (case-insensitive)
			expect(collectedCharacters[0].name).to.equal('Gandalf');
			expect(collectedCharacters[1].name).to.equal('Aragorn');
			expect(collectedCharacters[2].name).to.equal('Legolas');
		});
	});

	// --- STREAMING AND INTEROP ---

	describe('Stream and Renderer Interoperability', () => {
		it('reads a stream from TextStreamer and collects text using @text', async () => {
			const textStreamer = create.TextStreamer({
				model, temperature,
				prompt: "Write only the word 'Hello'.",
			});

			const scriptRunner = create.Script({
				context: { streamReader: textStreamer },
				script: `
          :data
          var text = capture:text
            var stream = (streamReader()).textStream
            for chunk in stream
              @text(chunk)
            endfor
          endcapture
          @data.result = text
        `,
			});

			const result = await scriptRunner();
			expect(result).to.deep.equal({ result: 'Hello' });
		});

		it('reads from TextStreamer with a dynamic prompt from context', async () => {
			const textStreamer = create.TextStreamer({ model });
			const scriptRunner = create.Script({
				context: { streamReader: textStreamer, word: 'World' },
				script: `
          :data
          var text = capture:text
            var prompt = "Write only the word '" + word + "'."
            var stream = (streamReader(prompt)).textStream
            for chunk in stream
              @text(chunk)
            endfor
          endcapture
          @data.result = text
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ result: 'World' });
		});

		it('reads two streams in parallel and saves both results', async () => {
			const textStreamer = create.TextStreamer({ model });
			const scriptRunner = create.Script({
				context: { streamReader: textStreamer },
				script: `
          :data
          var text1 = capture:text
            var s1 = (streamReader("Write only 'A'.")).textStream
            for chunk in s1
              @text(chunk)
            endfor
          endcapture

          var text2 = capture:text
            var s2 = (streamReader("Write only 'B'.")).textStream
            for chunk in s2
              @text(chunk)
            endfor
          endcapture

          @data = { a: text1, b: text2 }
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ a: 'A', b: 'B' });
		});

		it('collects and processes numbers from a stream', async () => {
			const textStreamer = create.TextStreamer({
				model, temperature,
				prompt: "Write only the number 42.",
			});
			const scriptRunner = create.Script({
				context: { streamReader: textStreamer },
				script: `
          :data
          var text = capture:text
            var stream = (streamReader()).textStream
            for chunk in stream
              @text(chunk)
            endfor
          endcapture
          var num = text | int
          @data.original = num
          @data.doubled = num * 2
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ original: 42, doubled: 84 });
		});

		it('stream error disables result, error test is only that result is empty', async () => {
			// Streamer configured to fail (simulate with bad model/config or empty result)
			const badStreamer = create.TextStreamer({ model, temperature, prompt: "INVALID" });
			const scriptRunner = create.Script({
				schema: z.object({ text: z.string() }),
				context: { streamReader: badStreamer },
				script: `
          :data
          var text = capture:text
            var stream = (streamReader()).textStream
            for chunk in stream
              @text(chunk)
            endfor
          endcapture
          @data = { text: text }
        `,
			});
			const result = await scriptRunner();// as { text: string };
			expect(result.text).to.be.a('string');
		});

		it('reads from an ObjectGenerator and uses the result', async () => {
			const locationGen = create.ObjectGenerator.withTemplate({
				model, temperature,
				schema: z.object({ city: z.string(), country: z.string() }),
				prompt: `Generate a JSON object for the capital of {{ countryName }}.`,
			});
			const scriptRunner = create.Script({
				schema: z.object({ result: z.string() }),
				context: { getCapital: locationGen },
				script: `
          :data
          var loc = (getCapital({ countryName: "France" })).object
          @data.result = loc.city
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ result: 'Paris' });
		});

		it('reads from object array stream', async () => {
			const characterStreamer = create.ObjectStreamer({
				model, temperature,
				schema: z.object({
					name: z.string(),
					description: z.string()
				}),
				output: 'array',
				prompt: 'Generate 3 character descriptions with names Peter, Paul and Mary, in this order.'
			});

			const { elementStream } = await characterStreamer();
			const characters: { name: string, description: string }[] = [];
			for await (const character of elementStream) {
				characters.push(character);
			}
			expect(characters.length).to.equal(3);
			expect(characters[0].name).to.equal('Peter');
			expect(characters[1].name).to.equal('Paul');
			expect(characters[2].name).to.equal('Mary');
		});

		it('reads from an ObjectStreamer (array mode), no script', async () => {
			const objectStreamer = create.ObjectStreamer({
				model, temperature,
				output: 'array',
				schema: z.object({ id: z.number() }),
				prompt: 'Generate an array with these exact two objects in it: {"id": 1}, {"id": 2}. The array size must be 2 and the order of the two object should be as listed, do not create an array with just one item in it',
			});
			const { elementStream } = await objectStreamer();
			const result: { id: number }[] = [];
			for await (const object of elementStream) {
				result.push(object);
			}
			expect(result).to.deep.equal([{ id: 1 }, { id: 2 }]);
		});

		it('reads from an ObjectStreamer (array mode), with script', async () => {
			const objectStreamer = create.ObjectStreamer({
				model, temperature,
				output: 'array',
				schema: z.object({ id: z.number() }),
				prompt: 'Generate an array with these exact two objects in it: {"id": 1}, {"id": 2}. The array size must be 2 and the order of the two object should be as listed, do not create an array with just one item in it',
			});
			const scriptRunner = create.Script({
				context: { streamer: objectStreamer },
				script: `
				:data
				@data = []
				for item in (streamer()).elementStream
					@data.push(item)
				endfor`
			});
			const result = await scriptRunner();
			expect(result).to.eql([{ id: 1 }, { id: 2 }]);
		});

		it('reads from an ObjectStreamer (array mode) and collects element ids', async () => {
			const objectStreamer = create.ObjectStreamer({
				model, temperature,
				output: 'array',
				schema: z.object({ id: z.number() }),
				prompt: 'Generate an array with a length of 2 having these exact two objects in it: {"id": 1}, {"id": 2}. The array size must be 2, make sure NOT to create an array with just one item in it.',
			});
			const scriptRunner = create.Script({
				context: { streamer: objectStreamer },
				script:
					`:data
					var stream = (streamer()).elementStream
					for item in stream
						@data.ids.push(item.id | int)
					endfor
					var text = capture:text
						var str = (streamer()).elementStream
						for item in str
						    @text(item.id)
						endfor
					endcapture
					// Split, parse as numbers and push to ids array
					for s in text.split('')
						@data.ids.push(s | int)
					endfor`,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ ids: [1, 2, 1, 2] });
		});
	});

	describe('Configuration & Inheritance', () => {
		const parentConfig = create.Config({
			context: { base: 'parent', mult: 2 },
			filters: { prefix: (s: string, p: string) => `${p}${s}` },
		});

		it('inherits context and filters from parent Config', async () => {
			const scriptRunner = create.Script({
				script: `
				:data
				@data.result = base | prefix("p:")
				`
			}, parentConfig);
			const result = await scriptRunner();
			expect(result).to.deep.equal({ result: 'p:parent' });
		});

		it('inherits from another Script', async () => {
			const parent = create.Script({ context: { inherited: 'ok' } });
			const child = create.Script({
				script:
					`:data
					@data.x = inherited`
			}, parent);
			const result = await child();
			expect(result).to.deep.equal({ x: 'ok' });
		});

		it('overrides parent context and merges filters', async () => {
			const child = create.Script({
				context: { base: 'child' },
				filters: { suffix: (s: string, x: string) => `${s}${x}` },
				script: `:data
				@data.out = (base | prefix("v")) | suffix("!")`,
			}, parentConfig);
			const result = await child();
			expect(result).to.deep.equal({ out: 'vchild!' });
		});

		it('merges context and child overrides parent keys', async () => {
			const scriptRunner = create.Script({
				context: { base: 'child', newVal: 'n' },
				script:
					`:data
					@data = { base: base, new: newVal, mult: mult }`
			}, parentConfig);
			const result = await scriptRunner();
			expect(result).to.deep.equal({ base: 'child', new: 'n', mult: 2 });
		});
	});

	// --- SCRIPT LOADING ---

	describe('Script Loader', () => {
		const stringLoader = new StringLoader();
		stringLoader.addTemplate('s1', `
			:data
			var msg = greeting + " " + subject
			@data.out = msg
		`);

		it('loads and executes a script using .loadsScript', async () => {
			const scriptRunner = create.Script.loadsScript({
				loader: stringLoader,
				script: 's1',
				context: { greeting: 'Loaded' },
			});
			const result = await scriptRunner({ subject: 'Script' });
			expect(result).to.deep.equal({ out: 'Loaded Script' });
		});
	});

	// --- ERROR HANDLING & VALIDATION ---

	describe('Error Handling & Validation', () => {
		it('throws ConfigError if .loadsScript is used but no loader is provided', () => {
			expect(() =>
				//@ts-expect-error - loader is required in config when using .loadsScript
				create.Script.loadsScript({
					script: 'file.casc'
				}),
			).to.throw(ConfigError);
		});

		it('rejects if script contains a syntax error', async () => {
			const scriptRunner = create.Script({ script: 'var x =' });
			await expect(scriptRunner()).to.be.rejectedWith('Script render failed');
		});

		it('rejects if script throws a runtime error', async () => {
			const scriptRunner = create.Script({
				script: `
          var obj = none
          @data.value = obj.prop
        `,
			});
			await expect(scriptRunner()).to.be.rejected;
		});

		it('rejects if an async function in context rejects', async () => {
			const scriptRunner = create.Script({
				context: { badFetch: async () => Promise.reject(new Error('API Down')) },
				script: `:data
				@data.result = badFetch()`
			});
			await expect(scriptRunner()).to.be.rejectedWith('API Down');
		});

		it('rejects if loader fails to find the script', async () => {
			const scriptRunner = create.Script.loadsScript({
				loader: new StringLoader(),
				script: 'nope',
			});
			await expect(scriptRunner()).to.be.rejectedWith('Script not found');
		});
	});

	// --- COMPLEX WORKFLOWS & LOGIC ---

	describe('Complex Workflows', () => {
		it('runs a while loop using an async context function', async () => {
			let i = 0;
			const agent = create.Script({
				context: {
					next: async () => {
						await new Promise(resolve => setTimeout(resolve, 0));
						return ++i < 3;
					}
				},
				script: `
          :data
          var count = 0
          while next()
            count = count + 1
          endwhile
          @data.times = count
        `,
			});
			const result = await agent();
			expect(result).to.deep.equal({ times: 2 });
		});

		it('runs a for loop in parallel and collects results using @data', async () => {
			const scriptRunner = create.Script({
				schema: z.object({ out: z.array(z.number()) }),
				context: {
					times: [1, 2, 3],
					double: (x: number) => x * 2,
				},
				script: `
          :data
          @data.out = []
          for x in times
            @data.out.push(double(x))
          endfor
        `,
			});
			const result = await scriptRunner();
			expect(result).to.deep.equal({ out: [2, 4, 6] });
		});

		it('runs an each loop sequentially', async () => {
			let sum = 0;
			const scriptRunner = create.Script({
				schema: z.object({ results: z.array(z.number()) }),
				context: {
					vals: [1, 2, 3],
					add: (x: number) => { sum += x; return sum; },
				},
				script: `:data
          @data.results = []
          each x in vals
            @data.results.push(add(x))
          endeach
        `,
			});
			const result = await scriptRunner();
			expect(result.results[2]).to.equal(6); // 1+2+3=6 sequentially
		});
	});
});
