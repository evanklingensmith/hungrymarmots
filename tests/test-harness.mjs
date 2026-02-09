import assert from 'assert';

const registeredTests = [];

export { assert };

export function test(name, fn) {
  registeredTests.push({ name, fn });
}

export async function run() {
  let failures = 0;

  for (const testCase of registeredTests) {
    try {
      await testCase.fn();
      console.log(`PASS ${testCase.name}`);
    } catch (error) {
      failures += 1;
      console.error(`FAIL ${testCase.name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }

  const summary = `${registeredTests.length - failures}/${registeredTests.length} passed`;
  if (failures === 0) {
    console.log(`\n${summary}`);
  } else {
    console.error(`\n${summary}`);
  }

  return failures;
}
