/**
 * @license
 * Copyright (c) 2019 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at
 * http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at
 * http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at
 * http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at
 * http://polymer.github.io/PATENTS.txt
 */
import {readFileSync} from 'fs';
import request from 'supertest';
import test from 'tape';

import {DEFAULT_QUERY_PARAM, esmTransform} from '../koa-esm-transform';
import {createAndServe, squeeze, testLogger} from './test-utils';

const transformModulesAmd = require('@babel/plugin-transform-modules-amd');
const amdLoaderScript =
    readFileSync(require.resolve('@polymer/esm-amd-loader'), 'utf-8');

test('inline AMD loader only when AMD transform used', async (t) => {
  t.plan(2);
  const logger = testLogger();
  await createAndServe(
      {
        middleware: [esmTransform({logger, babelPlugins: []})],
        routes: {'/my-page.html': ``}
      },
      async (server) => {
        const myPageText =
            squeeze((await request(server).get('/my-page.html')).text);
        const myPageTextIncludesInlinedAMDLoader =
            myPageText.includes(squeeze(amdLoaderScript));
        if (myPageTextIncludesInlinedAMDLoader) {
          console.log(
              'Expected page to NOT include inlined AMD loader:\n', myPageText);
        }
        t.assert(
            !myPageTextIncludesInlinedAMDLoader,
            'should not include inlined AMD loader when AMD transform is not used');
      });
  await createAndServe(
      {
        middleware:
            [esmTransform({logger, babelPlugins: [transformModulesAmd]})],
        routes: {'/my-page.html': ``}
      },
      async (server) => {
        const myPageText =
            squeeze((await request(server).get('/my-page.html')).text);
        const myPageTextIncludesInlinedAMDLoader =
            myPageText.includes(squeeze(amdLoaderScript));
        if (!myPageTextIncludesInlinedAMDLoader) {
          console.log(
              'Expected page to include inlined AMD loader:\n', myPageText);
        }
        t.assert(
            myPageTextIncludesInlinedAMDLoader,
            'should include inlined AMD loader when AMD transform is used');
      });
});

test('esmTransform', async (t) => {
  t.plan(2);
  const logger = testLogger();
  await createAndServe(
      {
        middleware: [esmTransform({logger, logLevel: 'debug'})],
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
              define(['./x.js?${DEFAULT_QUERY_PARAM}'],
                  function (x) {"use strict"; x = _interopRequireWildcard(x);function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}} x();});
              </script><script>define(['./y.js?${DEFAULT_QUERY_PARAM}'],
                  function (_y) {"use strict";});</script><script>
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
                         .get(`/my-module.js?${DEFAULT_QUERY_PARAM}`)
                         .set('User-Agent', useragent))
                        .text),
            squeeze(`
              define([\'./x.js?${DEFAULT_QUERY_PARAM}\'],
                  function (x) {"use strict";x = _interopRequireWildcard(x);function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}});
            `),
            'should transform module content in .js files');
      });
});
