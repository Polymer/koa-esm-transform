import request from 'supertest';
import test from 'tape';

import {esmToAmd} from '../koa-esm-to-amd';

import {createAndServe, squeeze, testLogger} from './test-utils';

test('transforms stuff', async (t) => {
  t.plan(2);
  const logger = testLogger();
  createAndServe(
      {
        middleware: [esmToAmd({logger, logLevel: 'debug'})],
        routes: {
          '/my-module.js': `import * as x from './x.js';`,
          '/my-page.html': `
        <script type="module">
        import * as x from './x.js';
        x();
        </script>
        <script type="module" src="./y.js"></script>
        <script type="module">
        z();
        </script>
      `,
        },
      },
      async (server) => {
        const useragent =
            'Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML like Gecko) Chrome/44.0.2403.155 Safari/537.36';
        const myPageText = squeeze((await request(server)
                                        .get('/my-page.html')
                                        .set('User-Agent', useragent))
                                       .text);
        const myPageTextIncludesTransformedScriptTags =
            myPageText.includes(squeeze(`
              <script>
              define(['./x.js'], function (x) {"use strict"; x = _interopRequireWildcard(x);function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}} x();});
              </script><script>define([\'./y.js\']);</script><script>
              define([], function () { z();});
              </script>`));
        if (!myPageTextIncludesTransformedScriptTags) {
          console.log('./my-page.html:\n', myPageText);
        }
        t.assert(
            myPageTextIncludesTransformedScriptTags,
            'should transform the module content in .html files.');
        t.equal(
            squeeze((await request(server)
                         .get('/my-module.js?__esmtoamd')
                         .set('User-Agent', useragent))
                        .text),
            squeeze(`
              define([\'./x.js\'], function (x) {"use strict";x = _interopRequireWildcard(x);function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}});
            `),
            'should transform module content in .js files');
      });
});
