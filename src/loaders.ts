// loaders.ts (Final Corrected Version)

import { ILoaderAny, raceLoaders } from 'cascada-engine';

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

export function race(loaders: ILoaderAny | ILoaderAny[], groupName?: string): RaceGroup {
	return {
		[RACE_GROUP_TAG]: true,
		loaders: Array.isArray(loaders) ? loaders : [loaders],
		groupName: groupName ?? null,
	};
}

// This is the core logic. The public functions are wrappers around it.
// It returns an intermediate format with wrappers to support multi-level merging.
function _processAndDeduplicate(
	load: (ILoaderAny | RaceGroup | MergedGroup)[]
): (ILoaderAny | MergedGroup | RaceGroup)[] {
	const loaders = (!Array.isArray(load) ? [load] : load);

	const namedGroups = new Map<string, NamedGroup>();
	const processedChain: (ILoaderAny | RaceGroup | MergedGroup | null)[] = [];

	// Pass 1: Identify groups and build a preliminary chain with placeholders for named groups.
	for (let i = 0; i < loaders.length; i++) {
		const loader = loaders[i];
		if (typeof loader === 'object' && RACE_GROUP_TAG in loader) {
			const raceGroup = loader;
			if (raceGroup.groupName) { // Named group
				if (!namedGroups.has(raceGroup.groupName)) {
					namedGroups.set(raceGroup.groupName, {
						firstIndex: i,
						collectedLoaders: [...raceGroup.loaders],
					});
					processedChain.push(null);
				} else {
					namedGroups.get(raceGroup.groupName)!.collectedLoaders.push(...raceGroup.loaders);
					processedChain.push(null);
				}
			} else { // Anonymous group
				processedChain.push(loader);
			}
		} else if (typeof loader === 'object' && MERGED_GROUP_TAG in loader) {
			const mergedGroup = loader;
			if (!namedGroups.has(mergedGroup.groupName)) {
				namedGroups.set(mergedGroup.groupName, {
					firstIndex: i,
					collectedLoaders: [mergedGroup.originalLoader],
				});
				processedChain.push(null);
			} else {
				namedGroups.get(mergedGroup.groupName)!.collectedLoaders.push(mergedGroup.originalLoader);
				processedChain.push(null);
			}
		} else {
			processedChain.push(loader as ILoaderAny);
		}
	}

	// Pass 2: Create the MergedGroup wrappers and place them in the chain.
	for (const [groupName, { firstIndex, collectedLoaders }] of namedGroups.entries()) {
		if (collectedLoaders.length > 0) {
			// Deduplication within the group itself happens here.
			const deduplicatedLoaders = collectedLoaders.filter((loader, index, array) => array.indexOf(loader) === index);
			const mergedLoader = raceLoaders(deduplicatedLoaders);
			const mergedGroupWrapper: MergedGroup = {
				[MERGED_GROUP_TAG]: true,
				groupName,
				originalLoader: mergedLoader,
			};
			processedChain[firstIndex] = mergedGroupWrapper;
		}
	}

	// Final Pass: Build the final list with correct, robust deduplication.
	const finalResult: (ILoaderAny | MergedGroup | RaceGroup)[] = [];
	const seen = new Set<ILoaderAny>();

	for (const item of processedChain) {
		if (item === null) continue;

		if (typeof item === 'object' && MERGED_GROUP_TAG in item) {
			const mergedGroup = item;
			const groupInfo = namedGroups.get(mergedGroup.groupName)!;

			// ** THE FIX IS HERE **
			// Check the group's original constituents against what has already been seen.
			const uniqueConstituents = groupInfo.collectedLoaders.filter(l => !seen.has(l));

			if (uniqueConstituents.length > 0) {
				// If the group still has unique loaders, keep it.
				// We must create a new loader if the contents have changed.
				const newOriginalLoader = uniqueConstituents.length === groupInfo.collectedLoaders.length
					? mergedGroup.originalLoader // No change, use existing
					: raceLoaders(uniqueConstituents);

				finalResult.push({
					...mergedGroup,
					originalLoader: newOriginalLoader,
				});

				// Mark the loaders that were just used as "seen".
				uniqueConstituents.forEach(l => seen.add(l));
			}
			// If uniqueConstituents is empty, the group is discarded.
		} else if (typeof item === 'object' && RACE_GROUP_TAG in item) {
			// Anonymous race group
			const raceGroup = item;
			const uniqueLoaders = raceGroup.loaders.filter(l => !seen.has(l));
			if (uniqueLoaders.length > 0) {
				uniqueLoaders.forEach(l => seen.add(l));
				// The tests expect the anonymous group to be returned as a real loader, not a wrapper.
				finalResult.push(raceLoaders(uniqueLoaders));
			}
		} else {
			// Regular loader
			const loader = item as ILoaderAny;
			if (!seen.has(loader)) {
				finalResult.push(loader);
				seen.add(loader);
			}
		}
	}
	return finalResult;
}

// The public functions are wrappers that return the format the tests expect.
export function mergeLoaders(
	parentLoaders: (ILoaderAny | RaceGroup | MergedGroup)[],
	childLoaders: (ILoaderAny | RaceGroup | MergedGroup)[]
): any[] {
	const combined = [...childLoaders, ...parentLoaders];
	return _processAndDeduplicate(combined);
}

export function processLoaders(
	load: (ILoaderAny | RaceGroup | MergedGroup)[] | ILoaderAny | RaceGroup | MergedGroup
): any[] {
	const loaders = Array.isArray(load) ? load : [load];
	return _processAndDeduplicate(loaders);
}