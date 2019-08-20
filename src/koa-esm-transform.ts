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
import {PluginItem as BabelPluginItem} from '@babel/core';
import babelSerialize from '@babel/generator';
import {parse as babelParse} from '@babel/parser';
import {Node as BabelNode} from '@babel/types';
import {browserCapabilities} from 'browser-capabilities';
import getStream from 'get-stream';
import * as Koa from 'koa';
import minimatch from 'minimatch';
import {DefaultTreeNode as Parse5Node, parse as parse5Parse, serialize as parse5Serialize} from 'parse5';
import {Stream} from 'stream';

import {dynamicImportAmd} from './babel-plugin-dynamic-import-amd';
import {rewriteImportMeta} from './babel-plugin-rewrite-import-meta';
import {Logger, LogLevel, prefixedLogger} from './support/logger';
import {removeFakeRootElements} from './support/parse5-utils';
import {extractQueryParameter} from './support/url-utils';
import {transformHTML} from './transform-html';
import {transformJSModule} from './transform-js-module';

const transformModulesAmd = require('@babel/plugin-transform-modules-amd');
const transformRegenerator = require('@babel/plugin-transform-regenerator');

export const defaultQueryParam = '__esmTransform';

export const babelTransformModulesAmd: BabelPluginItem[] = [
  dynamicImportAmd,
  rewriteImportMeta,
  transformModulesAmd,
];

export const babelTransformEs2015 = [
  require('@babel/plugin-transform-template-literals'),
  require('@babel/plugin-transform-literals'),
  require('@babel/plugin-transform-function-name'),
  require('@babel/plugin-transform-arrow-functions'),
  require('@babel/plugin-transform-block-scoped-functions'),
  require('@babel/plugin-transform-classes'),
  require('@babel/plugin-transform-object-super'),
  require('@babel/plugin-transform-shorthand-properties'),
  require('@babel/plugin-transform-duplicate-keys'),
  require('@babel/plugin-transform-computed-properties'),
  require('@babel/plugin-transform-for-of'),
  require('@babel/plugin-transform-sticky-regex'),
  require('@babel/plugin-transform-unicode-regex'),
  require('@babel/plugin-transform-spread'),
  require('@babel/plugin-transform-parameters'),
  require('@babel/plugin-transform-destructuring'),
  require('@babel/plugin-transform-block-scoping'),
  require('@babel/plugin-transform-typeof-symbol'),
  require('@babel/plugin-transform-instanceof'),
  [transformRegenerator, {async: false, asyncGenerators: false}],
];

export const babelTransformEs2016 = [
  require('@babel/plugin-transform-exponentiation-operator'),
];

export const babelTransformEs2017 = [
  require('@babel/plugin-transform-async-to-generator'),
];

export const babelTransformEs2018 = [
  require('@babel/plugin-proposal-object-rest-spread'),
  require('@babel/plugin-proposal-async-generator-functions'),
];

export type ContextualBabelPluginFunction = (ctx: Koa.Context) =>
    BabelPluginItem[];

/**
 * Options for overriding default behavior of the middleware.
 *
 * TODO(usergenic): Add option to disable injecting AMD loader and
 * regenerator-runtime in case developer wants to handle separately.
 *
 * TODO(usergenic): Add option for compile cache since every transform happens
 * every request.
 */
export type Options = {
  /**
   * Defines the babel transform plugins to compile JavaScript modules with. The
   * default behavior of the middleware is to use a Function that evaluates the
   * capabilities of the browser (identified by the user-agent header) to select
   * the transform plugins.
   */
  babelPlugins?: BabelPluginItem[]|ContextualBabelPluginFunction,
  /**
   * Minimatch compatible patterns or exact string matches of request paths to
   * exclude from processing by the middleware.
   */
  exclude?: string[],
  /**
   * The string value to append to URLs for JavaScript modules to identify them
   * to the middleware for processing.  The default parameter is
   * `__esmTransform`. Note that the middleware strips this parameter off the
   * URL before passing the context to the downstream server.
   */
  queryParam?: string,
  /**
   * Use an object other than `console` for logging.  To disable logging
   * altogether, set to `false`.
   */
  logger?: Logger|false,
  /**
   * Set the minimum level for events to log.  Possible values `debug`, `info`,
   * `warn`, `error`.  Defaults to `info`.
   */
  logLevel?: LogLevel,
};

export type HTMLASTTransform = (ast: Parse5Node) => Promise<Parse5Node>;
export type HTMLSourceStrategy = (html: string, transform: HTMLASTTransform) =>
    Promise<string>;
export type JSModuleASTTransform = (ast: BabelNode) => Promise<BabelNode>;
export type JSModuleSourceStrategy =
    (js: string, transform: JSModuleASTTransform) => Promise<string>;

const browserCapabilitiesBasedPlugins =
    (ctx: Koa.Context): BabelPluginItem[] => {
      const userAgent = ctx.request.header['user-agent'] || '';
      const capabilities = browserCapabilities(userAgent);
      const plugins: BabelPluginItem[] = [];
      if (!capabilities.has('es2015')) {
        plugins.push(...babelTransformEs2015);
      }
      if (!capabilities.has('es2016')) {
        plugins.push(...babelTransformEs2016);
      }
      if (!capabilities.has('es2017')) {
        plugins.push(...babelTransformEs2017);
      }
      if (!capabilities.has('es2018')) {
        plugins.push(...babelTransformEs2018);
      }
      if (!capabilities.has('modules')) {
        plugins.push(...babelTransformModulesAmd);
      }
      return plugins;
    };

const defaultHTMLParser = (html: string): Parse5Node =>
    parse5Parse(html, {sourceCodeLocationInfo: true}) as Parse5Node;

const defaultHTMLSerializer = (ast: Parse5Node): string => {
  removeFakeRootElements(ast);
  return parse5Serialize(ast);
};

const defaultJSParser = (js: string): BabelNode =>
    babelParse(js, {
      sourceType: 'unambiguous',
      allowAwaitOutsideFunction: true,
      plugins: [
        'dynamicImport',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'importMeta',
      ],
    }) as BabelNode;

// TODO(usergenic): Send PR to update `@types/babel__generator`
declare module '@babel/generator' {
  interface GeneratorOptions {
    jsescOption: {
      quotes: 'single'|'double',
    };
    retainFunctionParens: Boolean;
  }
}

const defaultJSSerializer = (ast: BabelNode): string =>
    babelSerialize(ast, {
      concise: false,
      jsescOption: {
        quotes: 'single',
      },
      retainFunctionParens: true,
      retainLines: true,
    }).code;

export const esmTransform = (options: Options = {}): Koa.Middleware => {
  const logger = options.logger === false ?
      {} :
      prefixedLogger('[koa-esm-transform]', options.logger || console);

  const queryParam = options.queryParam || defaultQueryParam;
  const exclude = options.exclude;

  const babelPluginsOption =
      options.babelPlugins || browserCapabilitiesBasedPlugins;

  const htmlSourceStrategy =
      async(html: string, transform: HTMLASTTransform): Promise<string> =>
          defaultHTMLSerializer(await transform(defaultHTMLParser(html)));

  const jsSourceStrategy: JSModuleSourceStrategy =
      async(js: string, transform: JSModuleASTTransform): Promise<string> =>
          defaultJSSerializer(await transform(defaultJSParser(js)));

  return async(ctx: Koa.Context, next: Function): Promise<void> => {
    // Check the URL for the query parameter that controls the middleware.
    // Remove it from the URL before continuing to next middleware in the
    // stack.
    const {url: requestUrlSansQueryParam, value: queryParamValue} =
        extractQueryParameter(ctx.request.url, queryParam);
    const queryParamPresent = ctx.request.url !== requestUrlSansQueryParam;
    if (queryParamPresent) {
      ctx.request.url = requestUrlSansQueryParam;
    }

    await next();

    // If we specifically disabled the middleware in this request, we can
    // just stop processing now.
    if (queryParamValue === 'false') {
      return;
    }

    // Check to see if there are any exclude patterns defined and if the
    // route matches one.  If so, stop processing.
    if (exclude && exclude.length > 0) {
      if (exclude.some((pattern) => {
            const excludeMatch = minimatch(ctx.path, pattern);
            if (excludeMatch) {
              logger.debug && logger.debug(`Excluding path "${ctx.path}"`);
            }
            return excludeMatch;
          })) {
        return;
      }
    }

    // Determine the babelPlugins for this request; the plugin list is
    // contextual when the babelPlugins option is a function.
    const babelPlugins = typeof babelPluginsOption === 'function' ?
        babelPluginsOption(ctx) :
        babelPluginsOption;

    // If we aren't going to be transforming anything (i.e. the babel
    // plugins set is empty), then we can just exit the middleware now as
    // next() has already been called.
    if (babelPlugins.length === 0) {
      return;
    }

    // When the response is neither HTML nor JavaScript, we have nothing to
    // transform.
    if (!(ctx.response.is('html') || ctx.response.is('js'))) {
      return;
    }

    if (ctx.response.is('html')) {
      const html = await getBodyAsString(ctx.body);
      try {
        ctx.body = await htmlSourceStrategy(
            html,
            (ast: Parse5Node) => transformHTML(
                ctx.request.url,
                ast,
                jsSourceStrategy,
                babelPlugins,
                queryParam,
                logger));
      } catch (error) {
        ctx.body = html;
        logger.error &&
            logger.error(
                `Unable to transform HTML content at "${
                    ctx.request.url}" due to`,
                error);
      }
    } else if (ctx.response.is('js')) {
      if (!queryParamPresent) {
        return;
      }
      const js = await getBodyAsString(ctx.body);
      try {
        ctx.body = await jsSourceStrategy(
            js,
            (ast: BabelNode) =>
                transformJSModule(ast, babelPlugins, queryParam, logger));
      } catch (error) {
        ctx.body = js;
        logger.error &&
            logger.error(
                `Unable to transform module script at "${
                    ctx.request.url}" due to`,
                error);
      }
    }
  };
};


// TODO(usergenic): This should probably be published as a separate npm package.
const getBodyAsString = async(body: Buffer|Stream|string): Promise<string> => {
  if (Buffer.isBuffer(body)) {
    return body.toString();
  }
  if (isStream(body)) {
    return await getStream(body);
  }
  if (typeof body !== 'string') {
    return '';
  }
  return body;
};

const isStream = (value: Buffer|Stream|string): value is Stream =>
    value !== null && typeof value === 'object' &&
    typeof (value as {pipe: Function | undefined}).pipe === 'function';
