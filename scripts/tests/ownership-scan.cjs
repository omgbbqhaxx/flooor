// Offline regression tests: never call a real RPC or send a transaction.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../app/lib/scanOwnedTokenIds.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const owner = '0x1111111111111111111111111111111111111111';
function setup({ request, multicall, readContract } = {}) {
  const calls = { indexed: 0, multicall: 0, supply: 0, chains: [] };
  const client = {
    request: async (...args) => { calls.indexed++; return request ? request(...args) : { transfers: [{ tokenId: '0x1' }] }; },
    multicall: async (args) => { calls.multicall++; return multicall ? multicall(args) : args.contracts.map(() => ({ status: 'success', result: owner })); },
  };
  const module = { exports: {} };
  vm.runInNewContext(compiled, { exports: module.exports, module, require: () => ({
    getPublicClient: (_, options) => { calls.chains.push(options?.chainId); return client; },
    readContract: async () => { calls.supply++; return readContract ? readContract() : 3n; },
  }) });
  const options = { config: { state: { chainId: 4663 } }, collectionAddress: owner, owner, abi: [], retryWithBackoff: fn => fn() };
  return { scan: module.exports.scanOwnedTokenIds, options, calls };
}
test('concurrent scans share work; subsequent calls revalidate ownership', async () => {
  const { scan, options, calls } = setup();
  const first = scan(options);
  assert.equal(scan(options), first);
  assert.equal(String(await first), '1');
  await scan(options);
  assert.equal(calls.indexed, 2);
  assert.equal(calls.multicall, 2);
  assert.ok(calls.chains.every(id => id === 4663));
});
test('429 and timeout never launch range scan; a failed scan can retry', async () => {
  for (const error of [Object.assign(new Error('429'), { code: 429 }), new Error('timeout')]) {
    const { scan, options, calls } = setup({ request: () => { throw error; } });
    await assert.rejects(scan(options));
    await assert.rejects(scan(options));
    assert.equal(calls.supply, 0);
    assert.equal(calls.multicall, 0);
    assert.equal(calls.indexed, 2);
  }
});
test('unsupported indexed API retains range-scan compatibility', async () => {
  const { scan, options, calls } = setup({ request: () => { throw { cause: { code: -32601 } }; } });
  assert.equal(String(await scan(options)), '1,2,3');
  assert.equal(calls.supply, 1);
});
test('failed ownership verification does not restart as full range scan', async () => {
  const { scan, options, calls } = setup({ multicall: () => { throw new Error('timeout'); } });
  await assert.rejects(scan(options));
  assert.equal(calls.supply, 0);
  assert.equal(calls.multicall, 1);
});
test('partial transport failure rejects instead of publishing incomplete ownership', async () => {
  const { scan, options } = setup({ multicall: () => [{ status: 'failure', error: new Error('timeout') }] });
  await assert.rejects(scan(options));
});
test('burned tokens may revert without invalidating the scan', async () => {
  const { scan, options } = setup({ multicall: () => [{ status: 'failure', error: { cause: { name: 'ContractFunctionRevertedError' } } }] });
  assert.equal((await scan(options)).length, 0);
});
test('different wallets and chains do not share scans', async () => {
  const { scan, options, calls } = setup();
  await Promise.all([scan(options), scan({ ...options, owner: '0x2222222222222222222222222222222222222222' }), scan({ ...options, chainId: 8453 })]);
  assert.equal(calls.indexed, 3);
});
test('truncated transfer pagination rejects instead of returning a partial list', async () => {
  const { scan, options, calls } = setup({ request: () => ({ transfers: [], pageKey: 'more' }) });
  await assert.rejects(scan(options));
  assert.equal(calls.indexed, 50);
  assert.equal(calls.supply, 0);
});
