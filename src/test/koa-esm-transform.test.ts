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
const transformRegenerator = require('@babel/plugin-transform-regenerator');

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

test('inline regenerator-runtime when the regenerator plugin used', async (t) => {
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
        const myPageTextIncludesInlinedRegeneratorRuntime =
            myPageText.includes('regeneratorRuntime');
        if (myPageTextIncludesInlinedRegeneratorRuntime) {
          console.log(
              'Expected page to NOT include inlined AMD loader:\n', myPageText);
        }
        t.assert(
            !myPageTextIncludesInlinedRegeneratorRuntime,
            'should not include inlined regenerator runtime when regenerator transform is not used');
      });
  await createAndServe(
      {
        middleware:
            [esmTransform({logger, babelPlugins: [transformRegenerator]})],
        routes: {'/my-page.html': ``}
      },
      async (server) => {
        const myPageText =
            squeeze((await request(server).get('/my-page.html')).text);
        const myPageTextIncludesInlinedRegeneratorRuntime =
            myPageText.includes('regeneratorRuntime');
        if (!myPageTextIncludesInlinedRegeneratorRuntime) {
          console.log(
              'Expected page to include inlined regenerator runtime:\n',
              myPageText);
        }
        t.assert(
            myPageTextIncludesInlinedRegeneratorRuntime,
            'should include inlined regenerator runtime when regenerator transform is used');
      });
});

test('exclude option', async (t) => {
  t.plan(4);
  const logger = testLogger();
  await createAndServe(
      {
        middleware: [esmTransform({
          logger,
          babelPlugins: [transformModulesAmd],
          exclude: ['**/y.js']
        })],
        routes: {
          '/index.html': `
          <script type="module" src="./x.js"></script>
          <script type="module" src="./y.js"></script>
        `,
          '/x.js': `export const x = () => 'x';`,
          '/y.js': `export const y = () => 'y';`,
        }
      },
      async (server) => {
        const index = (await request(server).get('/index.html')).text;
        const xText =
            (await request(server).get(`/x.js?${DEFAULT_QUERY_PARAM}`)).text;
        const yText =
            (await request(server).get(`/y.js?${DEFAULT_QUERY_PARAM}`)).text;
        const indexContainsXDefine = index.includes(
            `<script>define([\'./x.js?${DEFAULT_QUERY_PARAM}\'],`);
        const indexContainsYDefine = index.includes(
            `<script>define([\'./y.js?${DEFAULT_QUERY_PARAM}\'],`);
        if (!indexContainsXDefine) {
          console.log(
              'Expected index.html to contain define call for x.js:\n', index);
        }
        t.assert(indexContainsXDefine, 'should contain define() call for x.js');
        if (!indexContainsYDefine) {
          console.log(
              'Expected index.html to contain define call for y.js:\n', index);
        }
        t.assert(indexContainsYDefine, 'should contain define() call for y.js');
        t.deepEqual(
            xText,
            `define(['exports'], function (_exports) {"use strict";Object.defineProperty(_exports, "__esModule", { value: true });_exports.x = void 0;const x = () => 'x';_exports.x = x;});`,
            'should transform non-excluded module');
        t.deepEqual(
            yText,
            `export const y = () => 'y';`,
            'should not transform excluded module path');
      });
});

test('transform module scripts based on user agent', async (t) => {
  t.plan(3);
  const logger = testLogger();
  await createAndServe(
      {
        middleware: [esmTransform({logger, logLevel: 'debug'})],
        routes: {
          '/my-page.html': `
            <script type="module">
            import * as x from './x.js'; x();
            </script>
            <script type="module" src="./y.js"></script>
            <script type="module">
            z();
            </script>
          `,
        },
      },
      async (server) => {
        const chrome44 =
            'Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML like Gecko) Chrome/44.0.2403.155 Safari/537.36';
        const myPageText44 = squeeze((await request(server)
                                          .get('/my-page.html')
                                          .set('User-Agent', chrome44))
                                         .text);
        const myPageText44IncludesTransformedScriptTags =
            myPageText44.includes(squeeze(`
              <script>
                define(['./x.js?${DEFAULT_QUERY_PARAM}'],
                  function (x) {"use strict"; x = _interopRequireWildcard(x);function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}x();});
              </script><script>define(['./y.js?${
                DEFAULT_QUERY_PARAM}'], function (_y) {"use strict";});</script><script>
                define([], function () { z();});
              </script>`));
        if (!myPageText44IncludesTransformedScriptTags) {
          console.log(
              'Expected my-page.html to include transformed script tags:\n:',
              myPageText44);
        }
        t.assert(
            myPageText44IncludesTransformedScriptTags,
            'should transform the module content to AMD in .html files when modules unsupported (chrome 44)');


        const opera48 =
            'Mozilla/5.0 (Linux; Android 9; SM-J500FN Build/PPR2.181005.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36 OPR/48.0.2310.131725';
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3112.78 Safari/537.36';
        const myPageText48 = squeeze((await request(server)
                                          .get('/my-page.html')
                                          .set('User-Agent', opera48))
                                         .text);
        const myPageText48IncludesTransformedScriptTags =
            myPageText48.includes(squeeze(`
              <script type="module">
              import * as x from './x.js?${DEFAULT_QUERY_PARAM}';x();
              </script>
              <script type="module" src="./y.js?${
                DEFAULT_QUERY_PARAM}"></script>
              <script type="module">
              z();
              </script>`));
        if (!myPageText48IncludesTransformedScriptTags) {
          console.log(
              'Expected my-page.html to include transformed script tags:\n',
              myPageText48);
        }
        t.assert(
            myPageText48IncludesTransformedScriptTags,
            'should transform the module content in .html files when modules supported (opera 48)');


        const chrome70 =
            'Mozilla/5.0 (Linux; Android 9; SM-J500FN Build/PPR2.181005.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3497.100 Safari/537.36';
        const myPageText70 = squeeze((await request(server)
                                          .get('/my-page.html')
                                          .set('User-Agent', chrome70))
                                         .text);
        const myPageText70IncludesTransformedScriptTags =
            myPageText70.includes(squeeze(`
            <script type="module">
            import * as x from './x.js'; x();
            </script>
            <script type="module" src="./y.js"></script><script type="module">
            z();
            </script>`));
        if (!myPageText70IncludesTransformedScriptTags) {
          console.log(
              'Expected my-page.html to not have any transformations to module script tags:\n',
              myPageText70);
        }
        t.assert(
            myPageText70IncludesTransformedScriptTags,
            'should not transform module content in .html files when no transforms needed (chrome 70)');
      });
});
