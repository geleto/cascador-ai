import { ILoaderAny, raceLoaders } from 'cascada-engine';

// Use a Symbol for tagging to avoid property collisions.
const RACE_GROUP_TAG = Symbol.for('cascador-ai.raceGroup');
export const MERGED_GROUP_TAG = Symbol.for('cascador-ai.mergedGroup');

export interface RaceGroup {
	[RACE_GROUP_TAG]: true;
	loaders: ILoaderAny[];
	groupName: string | null;
}

interface NamedGroup {
	firstIndex: number;
	collectedLoaders: ILoaderAny[];
}

export interface MergedGroup {
	[MERGED_GROUP_TAG]: true;
	groupName: string;
	originalLoader: ILoaderAny;
}

/**
 * A declarative wrapper to mark a set of loaders for concurrent execution (racing).
 * This function creates a special object that `mergeLoaders` understands.
 *
 * @param loaders A single loader or an array of loaders.
 * @param groupName An optional name to create a mergeable group. Loaders
 *   in groups with the same name across parent/child configs will be merged into a
 *   single race.
 * @returns A special tagged object for processing by `mergeLoaders`.
 */
function race(loaders: ILoaderAny[], groupName?: string): RaceGroup {
	return {
		[RACE_GROUP_TAG]: true,
		loaders: Array.isArray(loaders) ? loaders : [loaders],
		groupName: groupName ?? null,
	};
}


/**
 * Processes a single array of loaders, handling the composition of named
 * and anonymous race groups.
 *
 * @param loaders The loader array to process.
 * @returns A final, processed array of loader instances ready to be passed to the Cascada engine.
 */
function processLoaders(loaders: (ILoaderAny | RaceGroup | MergedGroup)[]): ILoaderAny[] {
	const namedGroups = new Map<string, NamedGroup>(); // Tracks collected loaders for named groups.
	const processedChain: (ILoaderAny | RaceGroup | MergedGroup | null)[] = []; // The chain being built, with placeholders.

	// First pass: identify groups, collect loaders, and place placeholders.
	for (let i = 0; i < loaders.length; i++) {
		const loader = loaders[i];

		if (typeof loader === 'object' && RACE_GROUP_TAG in loader) {
			const raceGroup = loader as unknown as RaceGroup;
			if (raceGroup.groupName !== null) {
				// It's a NAMED race group.
				const { groupName, loaders } = raceGroup;
				if (groupName && !namedGroups.has(groupName)) {
					// First time we've seen this group. Record its position and loaders.
					namedGroups.set(groupName, {
						firstIndex: i,
						collectedLoaders: [...loaders],
					});
					// Place a placeholder at its first known position.
					processedChain.push(null);
				} else if (groupName) {
					// We've seen this group before. Add this child's loaders to it.
					const group = namedGroups.get(groupName)!;
					group.collectedLoaders.push(...loaders);
					// Add a placeholder; this will be filtered out later.
					processedChain.push(null);
				}
			} else {
				// It's an ANONYMOUS race group.
				processedChain.push(loader);
			}
		} else if (typeof loader === 'object' && MERGED_GROUP_TAG in loader) {
			// It's a previously merged group from a previous inheritance level.
			const mergedGroup = loader as unknown as MergedGroup;
			const { groupName, originalLoader } = mergedGroup;
			if (groupName && !namedGroups.has(groupName)) {
				// First time we've seen this group. Record its position and the merged loader.
				namedGroups.set(groupName, {
					firstIndex: i,
					collectedLoaders: [originalLoader],
				});
				// Place a placeholder at its first known position.
				processedChain.push(null);
			} else if (groupName) {
				// We've seen this group before. Add the merged loader to it.
				const group = namedGroups.get(groupName)!;
				group.collectedLoaders.push(originalLoader);
				// Add a placeholder; this will be filtered out later.
				processedChain.push(null);
			}
		} else {
			// It's a regular loader.
			processedChain.push(loader);
		}
	}

	// Second pass: create the final merged loaders and place them correctly.
	for (const [groupName, { firstIndex, collectedLoaders }] of namedGroups.entries()) {
		if (collectedLoaders.length > 0) {
			// Use Cascada's raceLoaders to create the final merged loader instance.
			const mergedLoader = raceLoaders(collectedLoaders);
			// Create a wrapper that preserves group metadata for future inheritance levels.
			const mergedGroupWrapper: MergedGroup = {
				[MERGED_GROUP_TAG]: true,
				groupName,
				originalLoader: mergedLoader,
			};
			// Place it at the index of the highest-priority (first seen) group.
			processedChain[firstIndex] = mergedGroupWrapper as unknown as ILoaderAny;
		}
	}

	// Final pass: clean up the chain.
	const filtered = processedChain.filter((item): item is ILoaderAny | RaceGroup | MergedGroup => {
		// Filter out any null placeholders for the merged groups.
		if (item === null) return false;
		// If it's an anonymous race group, keep it for processing.
		if (typeof item === 'object' && RACE_GROUP_TAG in item) {
			const raceGroup = item as unknown as RaceGroup;
			return raceGroup.groupName === null && raceGroup.loaders.length > 0;
		}
		// Keep merged groups for final processing.
		if (typeof item === 'object' && MERGED_GROUP_TAG in item) {
			return true;
		}
		return true;
	});

	return filtered.map(item => {
		// Convert any remaining anonymous groups into real raceLoaders.
		if (typeof item === 'object' && RACE_GROUP_TAG in item) {
			const raceGroup = item as unknown as RaceGroup;
			if (raceGroup.groupName === null) {
				return raceLoaders(raceGroup.loaders) as ILoaderAny;
			}
		}
		// Keep merged groups as MergedGroup objects for future inheritance levels.
		if (typeof item === 'object' && MERGED_GROUP_TAG in item) {
			return item as unknown as ILoaderAny;
		}
		return item as ILoaderAny;
	});
}

/**
 * Merges parent and child loader chains, handling the composition of named
 * and anonymous race groups.
 *
 * @param parentLoaders The loader array from the parent config/renderer.
 * @param childLoaders The loader array from the child renderer.
 * @returns A final, processed array of loader instances ready to be passed to the Cascada engine.
 */
function mergeLoaders(parentLoaders: (ILoaderAny | RaceGroup | MergedGroup)[], childLoaders: (ILoaderAny | RaceGroup | MergedGroup)[]): ILoaderAny[] {
	// Child loaders have precedence.
	const fullChain = [...childLoaders, ...parentLoaders];
	return processLoaders(fullChain);
}

export { race, mergeLoaders, processLoaders };