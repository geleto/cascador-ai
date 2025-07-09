import { expect, testUtils, createTestConfig } from './setup.js';

describe('Example Test', () => {
	it('should work', () => {
		expect(true).to.be.true;
	});

	it('should load environment variables', () => {
		// Test that environment variables can be accessed
		const config = createTestConfig();
		expect(config.nodeEnv).to.equal('test');
		expect(config.apiKey).to.be.a('string');
	});

	it('should have test utilities available', () => {
		// Test that the utility functions work correctly
		expect(testUtils.isEnvLoaded('NODE_ENV')).to.be.a('boolean');
		expect(testUtils.getEnv('NODE_ENV', 'test')).to.equal('test');
		expect(testUtils.getEnv('NON_EXISTENT_VAR', 'default')).to.equal('default');
	});
});