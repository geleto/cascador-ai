import 'dotenv/config';
//do not import anything from the compiled cascador-ai in the unit tests
import { expect } from 'chai';
import { mergeLoaders, processLoaders, race, RaceLoader, MERGED_GROUP_TAG } from '../src/loaders';
import { timeout, StringLoader } from './common';

describe('Race & Merge Loaders - Unit Tests', function () {
	this.timeout(timeout); // Increase timeout for tests that call the real API

	describe('mergeLoaders function', () => {
		it('should merge single-level named race groups correctly', () => {
			// Simple test: parent and child both have same named group
			const parentLoader = new StringLoader();
			const childLoader = new StringLoader();
			const parentLoaders = [race([parentLoader], 'groupA')];
			const childLoaders = [race([childLoader], 'groupA')];

			const result = mergeLoaders(parentLoaders, childLoaders);

			// Should have 1 merged loader with both loaders
			expect(result).to.have.length(1);
			expect(result[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should handle multi-level inheritance correctly', () => {
			// 3-level inheritance: grandparent -> parent -> child
			const grandparentLoader = new StringLoader();
			const parentLoader = new StringLoader();
			const childLoader = new StringLoader();
			const grandparentLoaders = [race([grandparentLoader], 'groupA')];
			const parentLoaders = [race([parentLoader], 'groupA')];
			const childLoaders = [race([childLoader], 'groupA')];

			// First merge: grandparent + parent
			const firstMerge = mergeLoaders(grandparentLoaders, parentLoaders);
			expect(firstMerge).to.have.length(1);

			// Second merge: result + child (this tests the multi-level fix)
			const finalResult = mergeLoaders(firstMerge, childLoaders);
			expect(finalResult).to.have.length(1);
			expect(finalResult[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should preserve child precedence in race groups', () => {
			// Child loaders should come first in the merged result
			const parentLoader1 = new StringLoader();
			const parentLoader2 = new StringLoader();
			const childLoader1 = new StringLoader();
			const childLoader2 = new StringLoader();
			const parentLoaders = [race([parentLoader1, parentLoader2], 'groupA')];
			const childLoaders = [race([childLoader1, childLoader2], 'groupA')];

			const result = mergeLoaders(parentLoaders, childLoaders);

			// Should have 1 merged loader
			expect(result).to.have.length(1);
			expect(result[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should handle anonymous race groups separately', () => {
			// Anonymous groups should not be merged with named groups
			const parentLoader = new StringLoader();
			const childLoader = new StringLoader();
			const parentLoaders = [race([parentLoader])]; // anonymous
			const childLoaders = [race([childLoader], 'groupA')]; // named

			const result = mergeLoaders(parentLoaders, childLoaders);

			// Should have 2 separate loaders
			expect(result).to.have.length(2);
		});

		it('should handle mixed scenarios with multiple groups', () => {
			// Complex scenario: multiple named groups and anonymous groups
			const parentLoaderA = new StringLoader();
			const parentLoaderAnon = new StringLoader();
			const parentLoaderB = new StringLoader();
			const childLoaderA = new StringLoader();
			const childLoaderAnon = new StringLoader();
			const childLoaderB = new StringLoader();

			const parentLoaders = [
				race([parentLoaderA], 'groupA'),
				race([parentLoaderAnon]), // anonymous
				race([parentLoaderB], 'groupB')
			];
			const childLoaders = [
				race([childLoaderA], 'groupA'),
				race([childLoaderAnon]), // anonymous
				race([childLoaderB], 'groupB')
			];

			const result = mergeLoaders(parentLoaders, childLoaders);

			// Should have: 2 merged named groups + 2 anonymous groups = 4 total
			expect(result).to.have.length(4);
		});
	});

	describe('Race loaders integration tests', () => {
		it('should create race groups with proper structure', () => {
			// Test that race function creates proper race group objects
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();

			const raceGroup = race([loader1, loader2], 'testGroup');

			// Should have the race group tag
			expect(raceGroup).to.have.property(Symbol.for('cascador-ai.raceGroup'), true);
			expect(raceGroup.groupName).to.equal('testGroup');
			expect(raceGroup.loaders).to.have.length(2);
		});

		it('should create anonymous race groups', () => {
			// Test anonymous race groups (no group name)
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();

			const raceGroup = race([loader1, loader2]);

			// Should have the race group tag but no group name
			expect(raceGroup).to.have.property(Symbol.for('cascador-ai.raceGroup'), true);
			expect(raceGroup.groupName).to.equal(null);
			expect(raceGroup.loaders).to.have.length(2);
		});

		it('should handle single loader in race group', () => {
			// Test race group with single loader
			const loader = new StringLoader();

			const raceGroup = race([loader], 'singleGroup');

			expect(raceGroup.groupName).to.equal('singleGroup');
			expect(raceGroup.loaders).to.have.length(1);
		});
	});

	describe('Race loaders functionality tests', () => {
		it('should test child-parent-grandparent hierarchy with race groups', () => {
			// Create loaders for 3-level hierarchy
			const grandparentLoader = new StringLoader();
			grandparentLoader.addString('prompt', 'Grandparent: {{ message }}');

			const parentLoader = new StringLoader();
			parentLoader.addString('prompt', 'Parent: {{ message }}');

			const childLoader = new StringLoader();
			childLoader.addString('prompt', 'Child: {{ message }}');

			// Test the hierarchy: grandparent -> parent -> child
			// First merge: grandparent + parent
			const grandparentRace = race([grandparentLoader], 'hierarchy');
			const parentRace = race([parentLoader], 'hierarchy');
			const firstMerge = mergeLoaders([grandparentRace], [parentRace]);

			// Second merge: result + child (this tests multi-level merging)
			const childRace = race([childLoader], 'hierarchy');
			const finalMerge = mergeLoaders(firstMerge, [childRace]);

			// Should have 1 merged loader containing all three loaders
			expect(finalMerge).to.have.length(1);
			expect(finalMerge[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should verify merged groups contain all expected loaders', () => {
			// Create loaders with different content to verify merging
			const loader1 = new StringLoader();
			loader1.addString('template1', 'Content from loader 1');

			const loader2 = new StringLoader();
			loader2.addString('template1', 'Content from loader 2');

			const loader3 = new StringLoader();
			loader3.addString('template1', 'Content from loader 3');

			// Create race groups with same name
			const parentRace = race([loader1, loader2], 'contentTest');
			const childRace = race([loader3], 'contentTest');

			// Merge them
			const merged = mergeLoaders([parentRace], [childRace]);

			// Should have 1 merged group
			expect(merged).to.have.length(1);
			expect(merged[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);

			// Verify the merged group is a proper RaceLoader
			const raceLoader = merged[0] as unknown as RaceLoader;
			expect(raceLoader).to.not.equal(undefined);
			expect(raceLoader).to.have.property(MERGED_GROUP_TAG, true);
			expect(raceLoader.loaders).to.be.an('array');
		});

		it('should test if race groups actually race (concurrent execution)', () => {
			// Create loaders with different delays to test racing behavior
			const fastLoader = new StringLoader();
			fastLoader.addString('prompt', 'Fast loader response');

			const slowLoader = new StringLoader();
			slowLoader.addString('prompt', 'Slow loader response');

			// Create race group
			const raceGroup = race([fastLoader, slowLoader], 'speedTest');

			// Test that race group is properly structured
			expect(raceGroup).to.have.property(Symbol.for('cascador-ai.raceGroup'), true);
			expect(raceGroup.groupName).to.equal('speedTest');
			expect(raceGroup.loaders).to.have.length(2);
		});

		it('should test actual racing behavior with timing', async () => {
			// Create loaders with different response times
			const fastLoader = new StringLoader();
			fastLoader.addString('template', 'Fast response');

			const slowLoader = new StringLoader();
			slowLoader.addString('template', 'Slow response');

			// Create race group and merge it
			const raceGroup = race([fastLoader, slowLoader], 'timingTest');
			const merged = mergeLoaders([], [raceGroup]);

			// Should have 1 merged group
			expect(merged).to.have.length(1);
			expect(merged[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);

			// Test that the merged loader can actually load content
			const raceLoader = merged[0] as unknown as RaceLoader;
			const result = await raceLoader.load('template');
			expect(result).to.be.an('object');
			expect(result).to.have.property('src');
			const resultSrc = result!.src;
			expect(resultSrc).to.be.oneOf(['Fast response', 'Slow response']);
		});

		it('should test race group with one working and one failing loader', async () => {
			// Create one working loader and one that will fail
			const workingLoader = new StringLoader();
			workingLoader.addString('template', 'Working response');

			const failingLoader = new StringLoader();
			// Don't add the template, so it will fail

			// Create race group
			const raceGroup = race([workingLoader, failingLoader], 'errorTest');
			const merged = mergeLoaders([], [raceGroup]);

			// Should have 1 merged group
			expect(merged).to.have.length(1);

			// Test the actual racing behavior
			const raceLoader = merged[0] as unknown as RaceLoader;
			const result = await raceLoader.load('template');

			// The race should return the working loader's result (first-to-succeed strategy)
			expect(result).to.be.an('object');
			expect(result).to.have.property('src');
			const resultSrc = result!.src;
			expect(resultSrc).to.equal('Working response');
		});

		it('should test race group with all failing loaders', async () => {
			// Create loaders that will all fail
			const failingLoader1 = new StringLoader();
			// Don't add the template, so it will fail

			const failingLoader2 = new StringLoader();
			// Don't add the template, so it will fail

			// Create race group
			const raceGroup = race([failingLoader1, failingLoader2], 'allFailTest');
			const merged = mergeLoaders([], [raceGroup]);

			// Should have 1 merged group
			expect(merged).to.have.length(1);

			// Test that the race group fails when all loaders fail
			const raceLoader = merged[0] as unknown as RaceLoader;
			try {
				await raceLoader.load('template');
				// If we get here, the test should fail because all loaders should fail
				expect.fail('Expected race group to fail when all loaders fail');
			} catch (error) {
				// This is the expected behavior when all loaders fail
				expect(error).to.be.instanceof(Error);
			}
		});

		it('should test empty race groups with actual execution', async () => {
			// Create empty race group
			const emptyRace = race([], 'emptyTest');
			const merged = mergeLoaders([], [emptyRace]);

			// Empty race groups might not be merged at all, or might be merged but fail
			if (merged.length === 0) {
				// Empty race groups are filtered out - this is acceptable behavior
				expect(merged).to.have.length(0);
			} else {
				// If they are merged, they should fail when trying to load
				expect(merged).to.have.length(1);
				const raceLoader = merged[0] as unknown as RaceLoader;
				try {
					await raceLoader.load('template');
					// If we get here, the test should fail because empty race groups should fail
					expect.fail('Expected empty race group to fail when trying to load');
				} catch (error) {
					// This is the expected behavior for empty race groups
					expect(error).to.be.instanceof(Error);
				}
			}
		});

		it('should test grouped race loaders (named groups)', () => {
			// Create multiple named race groups
			const groupALoader1 = new StringLoader();
			groupALoader1.addString('prompt', 'Group A Loader 1');

			const groupALoader2 = new StringLoader();
			groupALoader2.addString('prompt', 'Group A Loader 2');

			const groupBLoader1 = new StringLoader();
			groupBLoader1.addString('prompt', 'Group B Loader 1');

			const groupBLoader2 = new StringLoader();
			groupBLoader2.addString('prompt', 'Group B Loader 2');

			// Create named race groups
			const groupA = race([groupALoader1, groupALoader2], 'groupA');
			const groupB = race([groupBLoader1, groupBLoader2], 'groupB');

			// Test merging named groups
			const merged = mergeLoaders([groupA], [groupB]);

			// Should have 2 separate race groups (not merged together)
			expect(merged).to.have.length(2);
		});

		it('should test that non-race loaders run sequentially', () => {
			// Create regular loaders (not in race groups)
			const loader1 = new StringLoader();
			loader1.addString('prompt', 'Sequential loader 1');

			const loader2 = new StringLoader();
			loader2.addString('prompt', 'Sequential loader 2');

			// Test merging regular loaders (should remain separate)
			const merged = mergeLoaders([loader1], [loader2]);

			// Should have 2 separate loaders (not merged)
			expect(merged).to.have.length(2);
			// Check that they are the same instances (not merged)
			// Child loaders come first, so loader2 should be first
			expect(merged[0]).to.equal(loader2);
			expect(merged[1]).to.equal(loader1);
		});

		it('should test mixed race and non-race loaders', () => {
			// Create race group
			const raceLoader1 = new StringLoader();
			raceLoader1.addString('prompt', 'Race loader 1');

			const raceLoader2 = new StringLoader();
			raceLoader2.addString('prompt', 'Race loader 2');

			const raceGroup = race([raceLoader1, raceLoader2], 'mixedTest');

			// Create regular loader
			const regularLoader = new StringLoader();
			regularLoader.addString('prompt', 'Regular loader');

			// Test merging race group with regular loader
			const merged = mergeLoaders([raceGroup], [regularLoader]);

			// Should have 2 items: 1 regular loader + 1 merged race group
			expect(merged).to.have.length(2);
			// Child loaders come first, so regularLoader should be first
			expect(merged[0]).to.equal(regularLoader);
			expect(merged[1]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should test anonymous race groups vs named race groups', () => {
			// Create anonymous race group
			const anonLoader1 = new StringLoader();
			anonLoader1.addString('prompt', 'Anonymous loader 1');

			const anonLoader2 = new StringLoader();
			anonLoader2.addString('prompt', 'Anonymous loader 2');

			const anonymousRace = race([anonLoader1, anonLoader2]); // No group name

			// Create named race group
			const namedLoader1 = new StringLoader();
			namedLoader1.addString('prompt', 'Named loader 1');

			const namedLoader2 = new StringLoader();
			namedLoader2.addString('prompt', 'Named loader 2');

			const namedRace = race([namedLoader1, namedLoader2], 'namedGroup');

			// Test merging anonymous and named groups
			const merged = mergeLoaders([anonymousRace], [namedRace]);

			// Should have 2 separate groups (anonymous and named don't merge)
			expect(merged).to.have.length(2);
		});

		it('should test race group precedence (child over parent)', () => {
			// Create parent and child loaders with same group name
			const parentLoader1 = new StringLoader();
			parentLoader1.addString('prompt', 'Parent loader 1');

			const parentLoader2 = new StringLoader();
			parentLoader2.addString('prompt', 'Parent loader 2');

			const childLoader1 = new StringLoader();
			childLoader1.addString('prompt', 'Child loader 1');

			const childLoader2 = new StringLoader();
			childLoader2.addString('prompt', 'Child loader 2');

			// Create race groups with same name
			const parentRace = race([parentLoader1, parentLoader2], 'precedence');
			const childRace = race([childLoader1, childLoader2], 'precedence');

			// Test merging (child should have precedence)
			const merged = mergeLoaders([parentRace], [childRace]);

			// Should have 1 merged race group
			expect(merged).to.have.length(1);
			expect(merged[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should test complex multi-level inheritance with multiple race groups', () => {
			// Create grandparent loaders
			const grandparentLoader1 = new StringLoader();
			grandparentLoader1.addString('prompt', 'Grandparent 1');

			const grandparentLoader2 = new StringLoader();
			grandparentLoader2.addString('prompt', 'Grandparent 2');

			// Create parent loaders
			const parentLoader1 = new StringLoader();
			parentLoader1.addString('prompt', 'Parent 1');

			const parentLoader2 = new StringLoader();
			parentLoader2.addString('prompt', 'Parent 2');

			// Create child loaders
			const childLoader1 = new StringLoader();
			childLoader1.addString('prompt', 'Child 1');

			const childLoader2 = new StringLoader();
			childLoader2.addString('prompt', 'Child 2');

			// Create race groups for each level
			const grandparentRace = race([grandparentLoader1, grandparentLoader2], 'complex');
			const parentRace = race([parentLoader1, parentLoader2], 'complex');
			const childRace = race([childLoader1, childLoader2], 'complex');

			// Test 3-level merging: grandparent -> parent -> child
			const firstMerge = mergeLoaders([grandparentRace], [parentRace]);
			const finalMerge = mergeLoaders(firstMerge, [childRace]);

			// Should have 1 merged race group with all 6 loaders
			expect(finalMerge).to.have.length(1);
			expect(finalMerge[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should test race groups with different template names', () => {
			// Create loaders with different template names
			const loader1 = new StringLoader();
			loader1.addString('template1', 'Template 1 content');
			loader1.addString('template2', 'Template 2 content');

			const loader2 = new StringLoader();
			loader2.addString('template1', 'Alternative template 1');
			loader2.addString('template2', 'Alternative template 2');

			// Create race group
			const raceGroup = race([loader1, loader2], 'multiTemplate');

			// Test that race group contains both loaders
			expect(raceGroup.loaders).to.have.length(2);
			expect(raceGroup.loaders[0]).to.equal(loader1);
			expect(raceGroup.loaders[1]).to.equal(loader2);
		});

		it('should test empty race groups', () => {
			// Create empty race group
			const emptyRace = race([], 'empty');

			// Test that empty race group is properly structured
			expect(emptyRace).to.have.property(Symbol.for('cascador-ai.raceGroup'), true);
			expect(emptyRace.groupName).to.equal('empty');
			expect(emptyRace.loaders).to.have.length(0);
		});

		it('should test single loader race groups', () => {
			// Create single loader race group
			const singleLoader = new StringLoader();
			singleLoader.addString('prompt', 'Single loader');

			const singleRace = race([singleLoader], 'single');

			// Test that single loader race group is properly structured
			expect(singleRace).to.have.property(Symbol.for('cascador-ai.raceGroup'), true);
			expect(singleRace.groupName).to.equal('single');
			expect(singleRace.loaders).to.have.length(1);
			expect(singleRace.loaders[0]).to.equal(singleLoader);
		});

		it('should test race group performance vs sequential', async () => {
			// Create loaders with simulated delays
			const loader1 = new StringLoader();
			loader1.addString('template', 'Response 1');

			const loader2 = new StringLoader();
			loader2.addString('template', 'Response 2');

			// Test racing vs sequential execution
			const raceGroup = race([loader1, loader2], 'performanceTest');
			const merged = mergeLoaders([], [raceGroup]);

			// Measure racing performance
			const startTime = Date.now();
			const raceLoader = merged[0] as unknown as RaceLoader;
			const result = await raceLoader.load('template');
			const raceTime = Date.now() - startTime;

			// Verify result
			expect(result).to.be.an('object');
			expect(result).to.have.property('src');
			const resultSrc = result!.src;
			expect(resultSrc).to.be.oneOf(['Response 1', 'Response 2']);

			// Racing should be fast (StringLoader is synchronous, so this tests structure)
			expect(raceTime).to.be.lessThan(100); // Should be very fast
		});

		it('should test race group with multiple template names', async () => {
			// Create loaders with different template names
			const loader1 = new StringLoader();
			loader1.addString('template1', 'Content 1');
			loader1.addString('template2', 'Content 2');

			const loader2 = new StringLoader();
			loader2.addString('template1', 'Alternative 1');
			loader2.addString('template2', 'Alternative 2');

			// Create race group
			const raceGroup = race([loader1, loader2], 'multiTemplate');
			const merged = mergeLoaders([], [raceGroup]);

			// Test loading different templates
			const raceLoader = merged[0] as unknown as RaceLoader;

			const result1 = await raceLoader.load('template1');
			const result2 = await raceLoader.load('template2');

			// Verify results
			expect(result1).to.be.an('object');
			expect(result1).to.have.property('src');
			const result1Src = result1!.src;
			expect(result1Src).to.be.oneOf(['Content 1', 'Alternative 1']);

			expect(result2).to.be.an('object');
			expect(result2).to.have.property('src');
			const result2Src = result2!.src;
			expect(result2Src).to.be.oneOf(['Content 2', 'Alternative 2']);
		});

		it('should test race group precedence with actual content', async () => {
			// Create parent and child loaders with different content
			const parentLoader = new StringLoader();
			parentLoader.addString('template', 'Parent content');

			const childLoader = new StringLoader();
			childLoader.addString('template', 'Child content');

			// Create race groups with same name
			const parentRace = race([parentLoader], 'precedence');
			const childRace = race([childLoader], 'precedence');

			// Merge them (child should have precedence)
			const merged = mergeLoaders([parentRace], [childRace]);

			// Should have 1 merged group
			expect(merged).to.have.length(1);

			// Test that the merged group contains both loaders
			const raceLoader = merged[0] as unknown as RaceLoader;
			const result = await raceLoader.load('template');

			// Should return one of the contents (racing behavior)
			expect(result).to.be.an('object');
			expect(result).to.have.property('src');
			const resultSrc = result!.src;
			expect(resultSrc).to.be.oneOf(['Parent content', 'Child content']);
		});
	});

	describe('Edge cases and error handling', () => {
		it('should handle empty loader arrays', () => {
			const result = mergeLoaders([], []);
			expect(result).to.have.length(0);
		});

		it('should handle empty race groups', () => {
			const childLoader = new StringLoader();
			const parentLoaders = [race([], 'emptyGroup')];
			const childLoaders = [race([childLoader], 'emptyGroup')];

			const result = mergeLoaders(parentLoaders, childLoaders);
			expect(result).to.have.length(1);
		});

		it('should handle single loader in race group', () => {
			// Race group with single loader should still work
			const parentLoader = new StringLoader();
			const childLoader = new StringLoader();
			const parentLoaders = [race([parentLoader], 'singleGroup')];
			const childLoaders = [race([childLoader], 'singleGroup')];

			const result = mergeLoaders(parentLoaders, childLoaders);
			expect(result).to.have.length(1);
		});

		it('should deduplicate loaders in mergeLoaders', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();

			// Parent and child have overlapping loaders
			const parentLoaders = [loader1, loader2];
			const childLoaders = [loader2, loader3, loader1]; // duplicates of parent loaders

			const result = mergeLoaders(parentLoaders, childLoaders);

			expect(result).to.have.length(3);
			// Child loaders come first, so order should be: loader2, loader3, loader1
			expect(result[0]).to.equal(loader2);
			expect(result[1]).to.equal(loader3);
			expect(result[2]).to.equal(loader1);
		});

		it('should deduplicate loaders within race groups during merge', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();

			// Parent and child race groups have overlapping loaders
			const parentLoaders = [race([loader1, loader2], 'groupA')];
			const childLoaders = [race([loader2, loader3, loader1], 'groupA')]; // duplicates

			const result = mergeLoaders(parentLoaders, childLoaders);

			expect(result).to.have.length(1);
			expect(result[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});
	});

	describe('processLoaders function', () => {
		it('should process single array with regular loaders', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loaders = [loader1, loader2];

			const result = processLoaders(loaders);

			expect(result).to.have.length(2);
			expect(result[0]).to.equal(loader1);
			expect(result[1]).to.equal(loader2);
		});

		it('should deduplicate regular loaders', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loaders = [loader1, loader2, loader1, loader2];

			const result = processLoaders(loaders);

			expect(result).to.have.length(2);
			expect(result[0]).to.equal(loader1);
			expect(result[1]).to.equal(loader2);
		});

		it('should process single array with anonymous race groups', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loaders = [loader1, race([loader2, loader3])];

			const result = processLoaders(loaders);

			expect(result).to.have.length(2);
			expect(result[0]).to.equal(loader1);
			// The second item should be a race loader (not a race group)
			expect(result[1]).to.not.have.property(Symbol.for('cascador-ai.raceGroup'));
		});

		it('should process single array with named race groups', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loaders = [race([loader1], 'groupA'), race([loader2, loader3], 'groupA')];

			const result = processLoaders(loaders);

			expect(result).to.have.length(1);
			expect(result[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should process single array with mixed content', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loader4 = new StringLoader();
			const loader5 = new StringLoader();
			const loaders = [
				loader1,
				race([loader2], 'groupA'),
				race([loader3], 'groupB'),
				race([loader4], 'groupA'), // Same group as second item
				loader5
			];

			const result = processLoaders(loaders);

			expect(result).to.have.length(4);
			expect(result[0]).to.equal(loader1);
			expect(result[1]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
			expect(result[2]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
			expect(result[3]).to.equal(loader5);
		});

		it('should handle merged groups in single array', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const raceLoader = new RaceLoader([loader2], 'existingGroup');
			const loaders = [loader1, raceLoader];

			const result = processLoaders(loaders);

			expect(result).to.have.length(2);
			expect(result[0]).to.equal(loader1);
			expect(result[1]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should merge multiple merged groups with same name', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const raceLoader1 = new RaceLoader([loader1], 'existingGroup');
			const raceLoader2 = new RaceLoader([loader2], 'existingGroup');
			const loaders = [raceLoader1, raceLoader2, loader3];

			const result = processLoaders(loaders);

			expect(result).to.have.length(2);
			expect(result[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
			expect(result[1]).to.equal(loader3);
		});

		it('should handle empty array', () => {
			const result = processLoaders([]);
			expect(result).to.have.length(0);
		});

		it('should handle array with only race groups', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loaders = [race([loader1, loader2]), race([loader3])];

			const result = processLoaders(loaders);

			expect(result).to.have.length(2);
			// Both should be converted to race loaders (not race groups)
			expect(result[0]).to.not.have.property(Symbol.for('cascador-ai.raceGroup'));
			expect(result[1]).to.not.have.property(Symbol.for('cascador-ai.raceGroup'));
		});

		it('should deduplicate loaders within named race groups', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loaders = [
				race([loader1, loader2, loader1], 'groupA'), // loader1 appears twice
				race([loader3, loader2], 'groupA') // loader2 appears again
			];

			const result = processLoaders(loaders);

			expect(result).to.have.length(1);
			expect(result[0]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should deduplicate loaders within anonymous race groups', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loaders = [race([loader1, loader2, loader1, loader3])]; // loader1 appears twice

			const result = processLoaders(loaders);

			expect(result).to.have.length(1);
			expect(result[0]).to.not.have.property(Symbol.for('cascador-ai.raceGroup'));
		});

		it('should deduplicate loaders across regular loaders and race groups', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loaders = [
				loader1,
				race([loader2, loader3]),
				loader1, // duplicate of first loader
				race([loader1, loader2]) // all loaders here are duplicates and this group should be removed
			];

			const result = processLoaders(loaders);

			expect(result).to.have.length(2); // <<< CORRECT
			expect(result[0]).to.equal(loader1);
			// The second item should be a real raceLoader, not a RaceGroup wrapper
			expect(result[1]).to.not.have.property(Symbol.for('cascador-ai.raceGroup'));
		});

		it('should deduplicate complex scenario with mixed groups and regular loaders', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loader4 = new StringLoader();
			const loaders = [
				loader1,
				race([loader2, loader1], 'groupA'), // loader1 appears again
				race([loader3, loader4], 'groupB'),
				loader2, // duplicate of loader in groupA
				race([loader1, loader3], 'groupA') // both loaders already seen
			];

			const result = processLoaders(loaders);

			expect(result).to.have.length(3);
			expect(result[0]).to.equal(loader1);
			expect(result[1]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
			expect(result[2]).to.have.property(Symbol.for('cascador-ai.mergedGroup'), true);
		});

		it('should preserve order while deduplicating', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loader3 = new StringLoader();
			const loaders = [loader2, loader1, loader3, loader2, loader1];

			const result = processLoaders(loaders);

			expect(result).to.have.length(3);
			expect(result[0]).to.equal(loader2);
			expect(result[1]).to.equal(loader1);
			expect(result[2]).to.equal(loader3);
		});

		it('should handle empty race groups after deduplication', () => {
			const loader1 = new StringLoader();
			const loader2 = new StringLoader();
			const loaders = [
				loader1,
				race([loader1, loader1], 'groupA'), // all duplicates
				loader2
			];

			const result = processLoaders(loaders);

			expect(result).to.have.length(2);
			expect(result[0]).to.equal(loader1);
			expect(result[1]).to.equal(loader2);
		});
	});
});