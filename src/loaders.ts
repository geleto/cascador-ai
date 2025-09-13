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
function processLoaders(load: (ILoaderAny | RaceGroup | MergedGroup)[] | ILoaderAny | RaceGroup | MergedGroup): ILoaderAny[] {
	const loaders = (!Array.isArray(load) ? [load] : load);

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
			// Deduplicate loaders within each named group
			const deduplicatedLoaders = collectedLoaders.filter((loader, index, array) =>
				array.indexOf(loader) === index
			);

			// Use Cascada's raceLoaders to create the final merged loader instance.
			const mergedLoader = raceLoaders(deduplicatedLoaders);
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

	// Final pass: clean up the chain and deduplicate
	const seen = new Set<ILoaderAny>();

	// Track which loaders are consumed by merged groups
	const consumedByMergedGroups = new Set<ILoaderAny>();
	for (const [_groupName, { collectedLoaders }] of namedGroups.entries()) {
		for (const loader of collectedLoaders) {
			consumedByMergedGroups.add(loader);
		}
	}

	// Track which loaders have been seen as regular loaders first
	const seenAsRegularFirst = new Set<ILoaderAny>();

	const filtered = processedChain.filter((item): item is ILoaderAny | RaceGroup | MergedGroup => {
		// Filter out any null placeholders for the merged groups.
		if (item === null) return false;

		// If it's an anonymous race group, deduplicate within it and check if it should be kept
		if (typeof item === 'object' && RACE_GROUP_TAG in item) {
			const raceGroup = item as unknown as RaceGroup;
			if (raceGroup.groupName === null && raceGroup.loaders.length > 0) {
				// Deduplicate loaders within the race group
				const deduplicatedLoaders = raceGroup.loaders.filter((loader, index, array) =>
					array.indexOf(loader) === index
				);
				if (deduplicatedLoaders.length > 0) {
					// Update the race group with deduplicated loaders
					raceGroup.loaders = deduplicatedLoaders;
					return true;
				}
			}
			return false;
		}

		// Keep merged groups for final processing.
		if (typeof item === 'object' && MERGED_GROUP_TAG in item) {
			return true;
		}

		// For regular loaders, check if we've already seen this instance
		if (!seen.has(item as ILoaderAny)) {
			// If this loader is consumed by a merged group but hasn't been seen as regular first, exclude it
			if (consumedByMergedGroups.has(item as ILoaderAny) && !seenAsRegularFirst.has(item as ILoaderAny)) {
				return false;
			}
			seen.add(item as ILoaderAny);
			// Only add to seenAsRegularFirst if this is actually a regular loader (not a race group or merged group)
			seenAsRegularFirst.add(item as ILoaderAny);
			return true;
		}

		// If we've seen this loader before, exclude it
		return false;
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
	// Separate regular loaders from race groups/merged groups
	const regularParentLoaders: ILoaderAny[] = [];
	const specialParentLoaders: (RaceGroup | MergedGroup)[] = [];
	const regularChildLoaders: ILoaderAny[] = [];
	const specialChildLoaders: (RaceGroup | MergedGroup)[] = [];

	// Categorize parent loaders
	for (const loader of parentLoaders) {
		if (typeof loader === 'object' && ((RACE_GROUP_TAG in loader) || (MERGED_GROUP_TAG in loader))) {
			specialParentLoaders.push(loader);
		} else {
			regularParentLoaders.push(loader);
		}
	}

	// Categorize child loaders
	for (const loader of childLoaders) {
		if (typeof loader === 'object' && ((RACE_GROUP_TAG in loader) || (MERGED_GROUP_TAG in loader))) {
			specialChildLoaders.push(loader);
		} else {
			regularChildLoaders.push(loader);
		}
	}

	const result: ILoaderAny[] = [];

	// Add child regular loaders first (they have precedence)
	const seen = new Set<ILoaderAny>();
	for (const loader of regularChildLoaders) {
		if (!seen.has(loader)) {
			seen.add(loader);
			result.push(loader);
		}
	}

	// Process special loaders (race groups and merged groups) together
	const specialLoaders = [...specialChildLoaders, ...specialParentLoaders];
	if (specialLoaders.length > 0) {
		const processedSpecial = processLoaders(specialLoaders);
		for (const loader of processedSpecial) {
			result.push(loader);
		}
	}

	// Add parent regular loaders last
	for (const loader of regularParentLoaders) {
		if (!seen.has(loader)) {
			seen.add(loader);
			result.push(loader);
		}
	}

	return result;
}

export { race, mergeLoaders, processLoaders };