import { ILoaderAny, raceLoaders, LoaderInterface, LoaderSource } from 'cascada-engine';

export const RACE_GROUP_TAG = Symbol.for('cascador-ai.raceGroup');
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

function isRaceGroup(obj: any): obj is RaceGroup {
	return typeof obj === 'object' && obj !== null && RACE_GROUP_TAG in obj;
}
function isRaceLoader(obj: any): obj is RaceLoader {
	return typeof obj === 'object' && obj !== null && MERGED_GROUP_TAG in obj;
}

export class RaceLoader implements LoaderInterface {
	[MERGED_GROUP_TAG] = true;
	groupName: string;
	loaders: ILoaderAny[];

	constructor(loaders: ILoaderAny[], groupName: string) {
		// This check is correct and more robust than optional chaining here.
		if (!groupName?.trim()) {
			throw new Error('RaceLoader groupName must be a non-empty string.');
		}
		this.loaders = loaders;
		this.groupName = groupName;
	}

	// CHANGE: Return first non-null as early as possible (no AbortSignal).
	// We iteratively Promise.race() the wrapped results; when we see a non-null
	// fulfillment, we return immediately. The remaining loaders continue in the background.
	async load(name: string): Promise<LoaderSource | null> {
		if (this.loaders.length === 0) {
			return null;
		}

		// Kick off all loads immediately.
		const rawPromises = this.loaders.map(loader => (loader as LoaderInterface).load(name));

		// REVERT: Use a discriminated union for the Settled type. It is more type-safe
		// and idiomatic, allowing TypeScript to perform powerful type narrowing.
		type Settled =
			| { i: number; status: 'fulfilled'; value: LoaderSource | string | null }
			| { i: number; status: 'rejected'; reason: unknown };

		const pending: Promise<Settled>[] = (rawPromises as Promise<LoaderSource | string | null>[]).map((p, i: number) =>
			p.then(
				v => ({ i, status: 'fulfilled', value: v } as const),
				(e: unknown) => ({ i, status: 'rejected', reason: e } as const)
			)
		);

		// A never-resolving promise used to remove winners/losers from subsequent races.
		const NEVER = new Promise<Settled>(() => { }); // eslint-disable-line @typescript-eslint/no-empty-function

		let settledCount = 0;
		let firstError: Error | null = null;

		while (settledCount < pending.length) {
			// Race currently pending items.
			const r = await Promise.race(pending);

			// Prevent the same item from winning the race again.
			pending[r.i] = NEVER;
			settledCount++;

			if (r.status === 'fulfilled') {
				// Normalize string results to LoaderSource objects.
				const value =
					typeof r.value === 'string'
						? { src: r.value, path: name, noCache: false }
						: r.value;

				if (value !== null) {
					// EARLY RETURN: first non-null wins. No "!" needed due to type safety.
					return value;
				}
				// else: null -> keep racing others
			} else {
				// Capture the first error encountered, in case all loaders fail.
				firstError =
					firstError ??
					(r.reason instanceof Error ? r.reason : new Error(String(r.reason)));
			}
		}

		// If we saw any errors and *no* non-null successes, rethrow the first.
		if (firstError) {
			throw firstError;
		}

		// All loaders settled successfully but returned null.
		return null;
	}
}

export function race(loaders: ILoaderAny | ILoaderAny[], groupName?: string): RaceGroup {
	return {
		[RACE_GROUP_TAG]: true,
		loaders: Array.isArray(loaders) ? loaders : [loaders],
		groupName: groupName ?? null,
	};
}

// This is the core logic. The public functions are wrappers around it.
// It returns the final, executable list of loaders.
function _processAndDeduplicate(
	loaders: (ILoaderAny | RaceGroup | RaceLoader)[]
): ILoaderAny[] {
	const namedGroups = new Map<string, NamedGroup>();
	const processedChain: (ILoaderAny | RaceGroup | RaceLoader | null)[] = [];

	// Pass 1: Identify groups and build a preliminary chain with placeholders.
	for (let i = 0; i < loaders.length; i++) {
		const loader = loaders[i];

		if (isRaceGroup(loader)) {
			// RaceGroup carries a (possibly null) name directly.
			const groupName = loader.groupName;
			if (groupName) { // Named group
				const existingGroup = namedGroups.get(groupName);
				if (!existingGroup) {
					namedGroups.set(groupName, {
						firstIndex: i,
						collectedLoaders: [...loader.loaders],
					});
				} else {
					existingGroup.collectedLoaders.push(...loader.loaders);
				}
				processedChain.push(null);
			} else { // Anonymous group
				processedChain.push(loader);
			}
		} else if (isRaceLoader(loader)) {
			// RaceLoader is always named and valid due to constructor guard.
			const groupName = loader.groupName;
			const existingGroup = namedGroups.get(groupName);
			if (!existingGroup) {
				namedGroups.set(groupName, {
					firstIndex: i,
					collectedLoaders: [...loader.loaders],
				});
			} else {
				existingGroup.collectedLoaders.push(...loader.loaders);
			}
			processedChain.push(null);
		} else {
			processedChain.push(loader);
		}
	}

	// Pass 2: Create RaceLoader implementations, replacing placeholders.
	for (const [groupName, { firstIndex, collectedLoaders }] of namedGroups.entries()) {
		// NOTE: Deduplication is by object identity. Two distinct instances of a loader
		// class configured identically will be treated as separate loaders.
		const deduplicatedLoaders = collectedLoaders.filter((loader, index, array) => array.indexOf(loader) === index);

		if (deduplicatedLoaders.length > 0) {
			processedChain[firstIndex] = new RaceLoader(deduplicatedLoaders, groupName);
		} else if (process.env.NODE_ENV !== 'production') {
			// IMPROVEMENT: Warn developers about silently dropped empty named groups.
			console.warn(`Cascador-AI Loader: Named race group "${groupName}" was discarded because it became empty after deduplication.`);
		}
	}

	// Final Pass: Build the final list with correct deduplication and order.
	const finalResult: ILoaderAny[] = [];
	const seen = new Set<ILoaderAny>();

	for (const item of processedChain) {
		if (item === null) continue;

		if (isRaceLoader(item)) {
			// Use the collected loaders for this named group to preserve cross-merge order.
			const groupInfo = namedGroups.get(item.groupName);
			if (groupInfo) {
				const uniqueConstituents = groupInfo.collectedLoaders.filter(l => !seen.has(l));
				if (uniqueConstituents.length > 0) {
					const finalRaceLoader =
						uniqueConstituents.length === item.loaders.length
							? item
							: new RaceLoader(uniqueConstituents, item.groupName);
					finalResult.push(finalRaceLoader);
					uniqueConstituents.forEach(l => seen.add(l));
				}
			}
		} else if (isRaceGroup(item)) { // Anonymous race group
			const uniqueLoaders = item.loaders.filter(l => !seen.has(l));
			if (uniqueLoaders.length > 0) {
				uniqueLoaders.forEach(l => seen.add(l));
				// IMPROVEMENT: Avoid wrapper for single-loader groups.
				finalResult.push(
					uniqueLoaders.length === 1 ? uniqueLoaders[0] : raceLoaders(uniqueLoaders)
				);
			}
		} else { // Regular loader
			if (!seen.has(item)) {
				finalResult.push(item);
				seen.add(item);
			}
		}
	}
	return finalResult;
}

export function mergeLoaders(
	parentLoaders: (ILoaderAny | RaceGroup | RaceLoader)[],
	childLoaders: (ILoaderAny | RaceGroup | RaceLoader)[]
): ILoaderAny[] {
	const combined = [...childLoaders, ...parentLoaders];
	return _processAndDeduplicate(combined);
}

export function processLoaders(
	load: (ILoaderAny | RaceGroup | RaceLoader)[] | ILoaderAny | RaceGroup | RaceLoader
): ILoaderAny[] {
	const loaders = Array.isArray(load) ? load : [load];
	return _processAndDeduplicate(loaders);
}