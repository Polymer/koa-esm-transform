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
import {PluginItem} from '@babel/core';
import clone from 'clone';
import cssSelect from 'css-select';
import {parse5Adapter} from 'css-select-parse5-adapter';
import {readFileSync} from 'fs';
import {DefaultTreeElement, DefaultTreeNode, parseFragment} from 'parse5';

import {JSModuleSourceStrategy} from './koa-esm-transform';
import {containsPlugin} from './support/babel-utils';
import {Logger} from './support/logger';
import {getAttr, getTextContent, insertBefore, insertNode, removeAttr, removeNode, setAttr, setTextContent} from './support/parse5-utils';
import {preserveSurroundingWhitespace} from './support/string-utils';
import {appendQueryParameter} from './support/url-utils';
import {transformJSModule} from './transform-js-module';

const transformModulesAmd = require('@babel/plugin-transform-modules-amd');
const transformRegenerator = require('@babel/plugin-transform-regenerator');

export const transformHTML = async(
    ast: DefaultTreeNode,
    jsModuleTransform: JSModuleSourceStrategy,
    babelPlugins: PluginItem[],
    queryParam: string,
    logger: Logger): Promise<DefaultTreeNode> => {
  const isTransformingModulesAmd =
      containsPlugin(babelPlugins, transformModulesAmd);
  if (containsPlugin(babelPlugins, transformRegenerator)) {
    injectRegeneratorRuntime(ast);
  }
  if (isTransformingModulesAmd) {
    injectAMDLoader(ast);
    for (const scriptTag of querySelectorAll('script[nomodule]', ast)) {
      removeNode(scriptTag);
    }
  }
  for (const scriptTag of querySelectorAll('script[type=module][src]', ast)) {
    if (isTransformingModulesAmd) {
      convertExternalModuleToInlineModule(scriptTag);
    } else {
      setAttr(
          scriptTag,
          'src',
          appendQueryParameter(getAttr(scriptTag, 'src'), queryParam));
    }
  }
  for (const scriptTag of querySelectorAll(
           'script[type=module]:not(src)', ast)) {
    const originalJS = getTextContent(scriptTag);
    const transformedJS = preserveSurroundingWhitespace(
        originalJS,
        await jsModuleTransform(
            originalJS,
            async (ast) => await transformJSModule(
                ast, babelPlugins, queryParam, logger)));
    setTextContent(scriptTag, transformedJS);
    if (isTransformingModulesAmd) {
      removeAttr(scriptTag, 'type');
    }
  }
  return ast;
};

const convertExternalModuleToInlineModule = (ast: DefaultTreeElement) => {
  setTextContent(ast, `import '${getAttr(ast, 'src')}';`);
  removeAttr(ast, 'src');
};

const amdLoaderScriptTag = (parseFragment(
                                `<script>
    ${readFileSync(require.resolve('@polymer/esm-amd-loader'), 'utf-8')}
    </script>`,
                                {sourceCodeLocationInfo: true}) as {
                             childNodes: DefaultTreeNode[]
                           }).childNodes[0]!;

const regeneratorRuntimeScriptTag = (parseFragment(
                                         `<script>
      ${readFileSync(require.resolve('regenerator-runtime/runtime.js'))}
      </script>`,
                                         {sourceCodeLocationInfo: true}) as {
                                      childNodes: DefaultTreeNode[]
                                    }).childNodes[0]!;

const injectAMDLoader = (ast: DefaultTreeNode) => {
  const firstModuleScriptTag = querySelector('script[type=module]', ast);
  if (firstModuleScriptTag) {
    insertBefore(
        firstModuleScriptTag.parentNode,
        firstModuleScriptTag,
        clone(amdLoaderScriptTag));
    return;
  }
  const head = querySelector('head', ast);
  if (head) {
    insertNode(head, 0, clone(amdLoaderScriptTag));
  }
};

const injectRegeneratorRuntime = (ast: DefaultTreeNode) => {
  const head = querySelector('head', ast);
  if (head) {
    insertNode(head, 0, clone(regeneratorRuntimeScriptTag));
  }
};

const querySelector =
    (query: cssSelect.Query, ast: DefaultTreeNode): DefaultTreeElement|
    undefined => cssSelect.selectOne(query, ast, {adapter: parse5Adapter}) as
        DefaultTreeElement ||
    undefined;

const querySelectorAll =
    (query: cssSelect.Query, ast: DefaultTreeNode): DefaultTreeElement[] =>
        cssSelect.selectAll(query, ast, {adapter: parse5Adapter}) as
    DefaultTreeElement[];
