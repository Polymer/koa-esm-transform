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

const userAgents = {
  chrome44:
      'Mozilla/5.0 (Windows NT 6.2; WOW64) AppleWebKit/537.36 (KHTML like Gecko) Chrome/44.0.2403.155 Safari/537.36',
  chrome70:
      'Mozilla/5.0 (Linux; Android 9; SM-J500FN Build/PPR2.181005.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/70.0.3497.100 Safari/537.36',
  opera48:
      'Mozilla/5.0 (Linux; Android 9; SM-J500FN Build/PPR2.181005.003) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36 OPR/48.0.2310.131725',
};

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
        type TransformResult = {
          pageText: string,
          includesTransformedScriptTags?: boolean
        };

        /**
         * Chrome 44 needs compilation of modules and ES2017 features
         */
        const chrome44: TransformResult = {
          pageText: squeeze((await request(server)
                                 .get('/my-page.html')
                                 .set('User-Agent', userAgents.chrome44))
                                .text)
        };
        chrome44
            .includesTransformedScriptTags = chrome44.pageText.includes(squeeze(`
              <script>
                define(['./x.js?${DEFAULT_QUERY_PARAM}'],
                  function (x) {"use strict"; x = _interopRequireWildcard(x);function _interopRequireWildcard(obj) {if (obj && obj.__esModule) {return obj;} else {var newObj = {};if (obj != null) {for (var key in obj) {if (Object.prototype.hasOwnProperty.call(obj, key)) {var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {};if (desc.get || desc.set) {Object.defineProperty(newObj, key, desc);} else {newObj[key] = obj[key];}}}}newObj.default = obj;return newObj;}}x();});
              </script><script>define(['./y.js?${
            DEFAULT_QUERY_PARAM}'], function (_y) {"use strict";});</script><script>
                define([], function () { z();});
              </script>`));
        if (!chrome44.includesTransformedScriptTags) {
          console.log(
              'Expected my-page.html to include transformed script tags:\n:',
              chrome44.pageText);
        }
        t.assert(
            chrome44.includesTransformedScriptTags,
            'should transform the module content to AMD in .html files when modules unsupported (chrome 44)');

        /**
         * Chrome 70 needs no transformation/compilation
         */
        const chrome70: TransformResult = {
          pageText: squeeze((await request(server)
                                 .get('/my-page.html')
                                 .set('User-Agent', userAgents.chrome70))
                                .text)
        };
        chrome70.includesTransformedScriptTags =
            !chrome70.pageText.includes(squeeze(`
            <script type="module">
            import * as x from './x.js'; x();
            </script>
            <script type="module" src="./y.js"></script><script type="module">
            z();
            </script>`));
        if (chrome70.includesTransformedScriptTags) {
          console.log(
              'Expected my-page.html to not have any transformations to module script tags:\n',
              chrome70.pageText);
        }
        t.assert(
            !chrome70.includesTransformedScriptTags,
            'should not transform module content in .html files when no transforms needed (chrome 70)');

        /**
         * Opera has modules but needs some ES compilation, so query param
         * should still be on module URLs
         */
        const opera48: TransformResult = {
          pageText: squeeze((await request(server)
                                 .get('/my-page.html')
                                 .set('User-Agent', userAgents.opera48))
                                .text)
        };
        opera48.includesTransformedScriptTags =
            opera48.pageText.includes(squeeze(`
                <script type="module">
                import * as x from './x.js?${DEFAULT_QUERY_PARAM}';x();
                </script><script type="module" src="./y.js?${
                DEFAULT_QUERY_PARAM}"></script>
                <script type="module">
                z();
                </script>`));
        if (!opera48.includesTransformedScriptTags) {
          console.log(
              'Expected my-page.html to include transformed script tags:\n',
              opera48.pageText);
        }
        t.assert(
            opera48.includesTransformedScriptTags,
            'should transform the module content in .html files when modules supported (opera 48)');
      });
});
