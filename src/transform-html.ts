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
import {readFileSync} from 'fs';
import {DefaultTreeElement, DefaultTreeNode, parseFragment} from 'parse5';
import {resolve as resolveURL} from 'url';

import {JSModuleSourceStrategy} from './koa-esm-to-amd';
import {containsPlugin} from './support/babel-utils';
import {Logger} from './support/logger';
import {getAttr, getTextContent, hasAttr, insertBefore, insertNode, nodeWalkAll, removeAttr, removeNode, setAttr, setTextContent} from './support/parse5-utils';
import {preserveSurroundingWhitespace} from './support/string-utils';
import {appendQueryParameter} from './support/url-utils';
import {transformJSModule} from './transform-js-module';

const transformModulesAmd = require('@babel/plugin-transform-modules-amd');
const transformRegenerator = require('@babel/plugin-transform-regenerator');

export const transformHTML = async(
    ast: DefaultTreeNode,
    url: string,
    jsModuleTransform: JSModuleSourceStrategy,
    babelPlugins: PluginItem[],
    queryParam: string,
    logger: Logger): Promise<DefaultTreeNode> => {
  const baseURL = getBaseURL(ast, url);
  const isTransformingModulesAmd =
      containsPlugin(babelPlugins, transformModulesAmd);
  if (containsPlugin(babelPlugins, transformRegenerator)) {
    injectRegeneratorRuntime(ast);
  }
  if (isTransformingModulesAmd) {
    injectAMDLoader(ast);
    for (const scriptTag of getNoModuleScripts(ast)) {
      removeNode(scriptTag);
    }
  }
  for (const scriptTag of getExternalModuleScripts(ast)) {
    setAttr(
        scriptTag,
        'src',
        appendQueryParameter(getAttr(scriptTag, 'src'), queryParam));
    if (isTransformingModulesAmd) {
      convertExternalModuleToInlineScriptWithDefine(scriptTag);
    }
  }
  for (const scriptTag of getInlineModuleScripts(ast)) {
    const originalJS = getTextContent(scriptTag);
    const transformedJS = preserveSurroundingWhitespace(
        originalJS,
        await jsModuleTransform(
            originalJS,
            async (ast) => await transformJSModule(
                ast, baseURL, babelPlugins, queryParam, logger)));
    setTextContent(scriptTag, transformedJS);
    removeAttr(scriptTag, 'type');
  }
  return ast;
};

const convertExternalModuleToInlineScriptWithDefine =
    (ast: DefaultTreeElement) => {
      setTextContent(ast, `define(['${getAttr(ast, 'src')}']);`);
      removeAttr(ast, 'src');
      removeAttr(ast, 'type');
    };

const getBaseURL = (ast: DefaultTreeNode, location: string): string => {
  const baseTag = getBaseTag(ast);
  if (!baseTag) {
    return location;
  }
  const baseHref = getAttr(baseTag, 'href');
  if (!baseHref) {
    return location;
  }
  return resolveURL(location, baseHref);
};

const getBaseTag = (ast: DefaultTreeNode): DefaultTreeElement|undefined =>
    getTags(ast, 'base').shift();

const getNoModuleScripts = (ast: DefaultTreeNode): DefaultTreeElement[] =>
    getTags(ast, 'script').filter((node) => hasAttr(node, 'nomodule'));

const getModuleScripts = (ast: DefaultTreeNode): DefaultTreeElement[] =>
    getTags(ast, 'script').filter((node) => getAttr(node, 'type') === 'module');

const getExternalModuleScripts = (ast: DefaultTreeNode): DefaultTreeElement[] =>
    getModuleScripts(ast).filter((node) => hasAttr(node, 'src'));

const getInlineModuleScripts = (ast: DefaultTreeNode): DefaultTreeElement[] =>
    getModuleScripts(ast).filter((node) => !hasAttr(node, 'src'));

const getTags = (ast: DefaultTreeNode, name: string): DefaultTreeElement[] =>
    nodeWalkAll(ast, (node) => node.nodeName === name) as DefaultTreeElement[];

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
  const firstModuleScriptTag: DefaultTreeElement = getModuleScripts(ast)[0];
  if (firstModuleScriptTag) {
    insertBefore(
        firstModuleScriptTag.parentNode,
        firstModuleScriptTag,
        clone(amdLoaderScriptTag));
    return;
  }
  const head = getTags(ast, 'head')[0];
  if (head) {
    insertNode(head, 0, clone(amdLoaderScriptTag));
  }
};

const injectRegeneratorRuntime = (ast: DefaultTreeNode) => {
  const head = getTags(ast, 'head')[0];
  if (head) {
    insertNode(head, 0, clone(regeneratorRuntimeScriptTag));
  }
};
