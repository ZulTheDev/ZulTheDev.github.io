import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readApiJson, validateContent, serviceAvailable } from '../src/api.js';
const json = value => new Response(JSON.stringify(value), {headers: {'content-type': 'application/json'}});
test('HTTP 200 Vite HTML is rejected with a routing diagnosis', async () => {
  await assert.rejects(readApiJson(new Response('<script type="module">', {headers: {'content-type':'text/html'}})), /not JSON.*private API URL/);
});
test('JSON content succeeds, but health data is not portfolio content', async () => {
  assert.deepEqual(validateContent(await readApiJson(json({profile:{name:'Fiya'}}))), {profile:{name:'Fiya'}});
  assert.throws(() => validateContent({ok:true, service:'portfolio-online-services'}), /portfolio content/);
});
test('invalid JSON gets an actionable error', async () => {
  await assert.rejects(readApiJson(new Response('{', {headers:{'content-type':'application/json'}})), /invalid JSON/);
});
test('status requires the right service and configured/reachable integrations', () => {
  assert.equal(serviceAvailable('private', {ok:true,service:'portfolio-online-services'}), false);
  assert.equal(serviceAvailable('online', {ok:true,service:'portfolio-online-services'}), true);
  assert.equal(serviceAvailable('integration', {configured:false,reachable:false}), false);
  assert.equal(serviceAvailable('integration', {configured:true,reachable:true}), true);
  assert.equal(serviceAvailable('ai', {deepseekConfigured:false,backupConfigured:false}), false);
  assert.equal(serviceAvailable('drive', {folders:[]}), true);
});
