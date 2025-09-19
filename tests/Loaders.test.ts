import 'dotenv/config';
import * as chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { create, race } from './cascada';
//unit test imports
import { model, temperature, timeout, AsyncStringLoader } from './common';
import { streamToString } from './TextStreamer.test';
import { z } from 'zod';

// Configure chai-as-promised
chai.use(chaiAsPromised);
const { expect } = chai;

describe.skip('Loader Integration Tests (Race & Merge)', function () {
	this.timeout(timeout);

	// --- Test Utilities ---

	// For Template/Script renderers, the content is the final output.
	const templateContentFast = 'from fast';
	const templateContentMedium = 'from medium';
	const templateContentSlow = 'from slow';

	// For LLM-based renderers, the loaded content is a prompt.
	const llmPromptFast = 'Write only this single word in lowercase: fast';
	const llmExpectedFast = 'fast';
	const llmPromptMedium = 'Write only this single word in lowercase: medium';
	const llmExpectedMedium = 'medium';
	const llmPromptSlow = 'Write only this single word in lowercase: slow';
	const llmExpectedSlow = 'slow';

	// Standardized async loaders with predictable delays.
	// Fast loader (5ms delay)
	const fastLoader = new AsyncStringLoader(5);
	fastLoader.addString('prompt.txt', llmPromptFast);
	fastLoader.addString('template.txt', templateContentFast);

	// Medium loader (10ms delay)
	const mediumLoader = new AsyncStringLoader(10);
	mediumLoader.addString('prompt.txt', llmPromptMedium);
	mediumLoader.addString('template.txt', templateContentMedium);

	// Slow loader (20ms delay)
	const slowLoader = new AsyncStringLoader(20);
	slowLoader.addString('prompt.txt', llmPromptSlow);
	slowLoader.addString('template.txt', templateContentSlow);

	// Failing loader (returns null for the requested template)
	const failingLoader = new AsyncStringLoader(5);
	// Does not contain 'prompt.txt' or 'template.txt'

	// --- Test Scenarios ---

	describe('Category 1: Single Configuration (No Inheritance)', () => {
		it('1.1: Named race groups should merge and the fastest loader should win', async () => {
			const renderer = create.Template.loadsTemplate({
				loader: [
					race([slowLoader], 'templates'), // This one is slower
					race([fastLoader], 'templates'), // This one is faster
				],
				template: 'template.txt',
			});
			const result = await renderer();
			expect(result).to.equal(templateContentFast);
		});

		it('1.2: Anonymous race groups should remain separate and execute sequentially', async () => {
			const renderer = create.Template.loadsTemplate({
				// The first loader in the chain is the slow one, but it will succeed.
				loader: [race([slowLoader]), race([fastLoader])],
				template: 'template.txt',
			});
			const result = await renderer();
			// Because they are executed sequentially, the slow loader wins as it's first.
			expect(result).to.equal(templateContentSlow);
		});

		it('1.3: Mixed sequential and raced loaders should respect sequential precedence', async () => {
			const scriptComponent = create.Script.loadsScript({
				// The mediumLoader is first in the sequential chain and will succeed.
				loader: [mediumLoader, race([slowLoader, fastLoader])],
				script: 'template.txt', // Using a template file as script content for simplicity
			});
			const result = await scriptComponent();
			// The race group is never reached.
			expect(result).to.equal(templateContentMedium);
		});
	});

	describe('Category 2: Single-Level Inheritance (Parent/Child)', () => {
		it('2.1: Child should add to a parent race group, and the fastest loader should win', async () => {
			const baseConfig = create.Config({
				loader: [race([slowLoader], 'templates')],
			});

			const generator = create.TextGenerator.loadsTemplate(
				{
					model,
					temperature,
					loader: [race([fastLoader], 'templates')], // Child adds a faster loader
					prompt: 'prompt.txt',
				},
				baseConfig,
			);

			const { text } = await generator();
			// Proves both were merged and raced, with the fast one winning.
			expect(text).to.equal(llmExpectedFast);
		});

		it('2.2: Child sequential loaders should have precedence over parent sequential loaders', async () => {
			const baseConfig = create.Config({
				loader: [slowLoader], // Parent loader
			});

			const generator = create.TextGenerator.loadsTemplate(
				{
					model,
					temperature,
					loader: [fastLoader], // Child loader
					prompt: 'prompt.txt',
				},
				baseConfig,
			);

			const { text } = await generator();
			// Final chain is [fastLoader, slowLoader]. The fast loader is tried first and succeeds.
			expect(text).to.equal(llmExpectedFast);
		});
	});

	describe('Category 3: Concurrency and Failure Modes', () => {
		it('3.1a: [RACE] The fastest loader in a race group should win', async () => {
			const streamer = create.TextStreamer.loadsTemplate({
				model,
				temperature,
				loader: [race([slowLoader, fastLoader], 'templates')],
				prompt: 'prompt.txt',
			});
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			expect(streamedText).to.equal(llmExpectedFast);
		});

		it('3.1b: [SEQUENTIAL] The first successful loader in a sequential chain should win', async () => {
			const streamer = create.TextStreamer.loadsTemplate({
				model,
				temperature,
				// No race wrapper, this is a standard sequential chain.
				loader: [slowLoader, fastLoader],
				prompt: 'prompt.txt',
			});
			const result = await streamer();
			const streamedText = await streamToString(result.textStream);
			// The slow loader is first in the array and succeeds, so it wins.
			expect(streamedText).to.equal(llmExpectedSlow);
		});

		it('3.2: A race group should succeed even if one loader fails', async () => {
			const generator = create.ObjectGenerator.loadsTemplate({
				model,
				temperature,
				schema: z.object({ result: z.string() }),
				loader: [race([failingLoader, mediumLoader], 'templates')],
				prompt: 'prompt.txt',
			});
			const { object } = await generator();
			expect(object.result).to.equal(llmExpectedMedium);
		});

		it('3.3: A race group should fail if all its loaders fail', async () => {
			const renderer = create.Template.loadsTemplate({
				loader: [race([failingLoader], 'templates')],
				template: 'template.txt',
			});
			await expect(renderer()).to.be.rejectedWith(/Resource 'template.txt' not found/);
		});
	});

	describe('Category 4: Multi-Level Inheritance (Grandparent/Parent/Child)', () => {
		it('4.1: Loaders from all 3 levels should be merged and raced, with the fastest winning', async () => {
			// 1. Grandparent has the slowest loader
			const grandparentConfig = create.Config({
				loader: [race([slowLoader], 'templates')],
			});

			// 2. Parent inherits and adds a medium loader
			const parentConfig = create.Config(
				{
					loader: [race([mediumLoader], 'templates')],
				},
				grandparentConfig,
			);

			// 3. Child inherits and adds the fastest loader
			const renderer = create.Template.loadsTemplate(
				{
					loader: [race([fastLoader], 'templates')],
					template: 'template.txt',
				},
				parentConfig,
			);

			const result = await renderer();
			// This proves all three were aggregated into one race, and the fastest won.
			expect(result).to.equal(templateContentFast);
		});
	});

	describe('Category 5: Real-World Component Integration', () => {
		it('5.1: Component-to-renderer inheritance should merge race groups correctly', async () => {
			const baseGenerator = create.TextGenerator.loadsTemplate({
				model,
				temperature,
				loader: [race([slowLoader], 'prompts')],
			});

			// Inherit directly from the other generator
			const childGenerator = create.TextGenerator.loadsTemplate(
				{
					loader: [race([fastLoader], 'prompts')],
					prompt: 'prompt.txt',
				},
				baseGenerator,
			);

			const { text } = await childGenerator();
			expect(text).to.equal(llmExpectedFast);
		});

		it('5.2: A script should correctly use a generator with raced loaders from its context', async () => {
			const summaryGenerator = create.TextGenerator.loadsTemplate({
				model,
				temperature,
				loader: [race([slowLoader, fastLoader], 'prompts')],
				// The prompt is NOT set here, it will be provided by the script
			});

			const mainScript = create.Script({
				context: { summaryGenerator },
				script: `:text
          // Call the generator from context, providing the template name to load
          var result = summaryGenerator({ prompt: 'prompt.txt' })
          @text = result.text`,
			});

			const result = await mainScript();
			// This proves the generator, when called from the script's context,
			// still used its own raced loaders correctly.
			expect(result).to.equal(llmExpectedFast);
		});
	});
});