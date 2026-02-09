import './dates.test.mjs';
import './validators.test.mjs';
import './grocery.test.mjs';
import './state.test.mjs';
import './local-data.test.mjs';
import { run } from './test-harness.mjs';

run()
  .then((failures) => {
    if (failures > 0) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
