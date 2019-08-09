import test from 'tape';
import {esmToAmd} from '../koa-esm-to-amd';

test('something', async (t) => {
  t.plan(1);
  console.log('hello');
  t.equal(1, 2);
});
