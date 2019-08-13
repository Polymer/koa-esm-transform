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
import {DefaultTreeNode, parseFragment} from 'parse5';
import {resolve as resolveURL} from 'url';

import {JSModuleSourceStrategy} from './koa-esm-to-amd';
import {Logger} from './support/logger';
import {getAttr, getTextContent, insertNode, nodeWalkAll, removeAttr, setTextContent} from './support/parse5-utils';
import {preserveSurroundingWhitespace} from './support/string-utils';
import {transformJSModule} from './transform-js-module';

export const transformHTML = async(
    ast: DefaultTreeNode,
    url: string,
    jsModuleTransform: JSModuleSourceStrategy,
    babelPlugins: PluginItem[],
    injectLoader: boolean,
    logger: Logger): Promise<DefaultTreeNode> => {
  const baseURL = getBaseURL(ast, url);
  let needAMDLoader = false;
  for (const scriptTag of getExternalModuleScripts(ast)) {
    const src = getAttr(scriptTag, 'src');
    setTextContent(scriptTag, `define(['${src}']);`);
    removeAttr(scriptTag, 'src');
    removeAttr(scriptTag, 'type');
    needAMDLoader = true;
  }
  for (const scriptTag of getInlineModuleScripts(ast)) {
    const originalJS = getTextContent(scriptTag);
    const transformedJS = preserveSurroundingWhitespace(
        originalJS,
        await jsModuleTransform(
            originalJS,
            async (ast) =>
                await transformJSModule(ast, baseURL, babelPlugins, logger)));
    setTextContent(scriptTag, transformedJS);
    removeAttr(scriptTag, 'type');
    needAMDLoader = true;
  }
  if (injectLoader && needAMDLoader) {
    injectAMDLoader(ast);
  }
  return ast;
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

const getBaseTag = (ast: DefaultTreeNode): DefaultTreeNode|undefined =>
    getTags(ast, 'base').shift();

const getExternalModuleScripts = (ast: DefaultTreeNode): DefaultTreeNode[] =>
    getTags(ast, 'script')
        .filter(
            (node) =>
                getAttr(node, 'type') === 'module' && !!getAttr(node, 'src'));

const getInlineModuleScripts = (ast: DefaultTreeNode): DefaultTreeNode[] =>
    getTags(ast, 'script')
        .filter(
            (node) =>
                getAttr(node, 'type') === 'module' && !getAttr(node, 'src'));

const getTags = (ast: DefaultTreeNode, name: string): DefaultTreeNode[] =>
    nodeWalkAll(ast, (node) => node.nodeName === name);

const amdLoaderScriptTag =
    (parseFragment(
         `<script>${
             readFileSync(
                 require.resolve('@polymer/esm-amd-loader'),
                 'utf-8')}</script>`,
         {sourceCodeLocationInfo: true}) as {
      childNodes: DefaultTreeNode[]
    }).childNodes[0]!;

const injectAMDLoader = (ast: DefaultTreeNode) => {
  const head = getTags(ast, 'head')[0];
  if (head) {
    insertNode(head, 0, clone(amdLoaderScriptTag));
  }
};
