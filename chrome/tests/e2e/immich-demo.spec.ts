import { registerImmichDemoTests } from '../../../shared/e2e/immich-demo.tests.ts';
import { expect, test } from './fixtures';

registerImmichDemoTests(test, expect, 'chrome-extension');
