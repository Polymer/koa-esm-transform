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
import {PluginItem, transformFromAstAsync} from '@babel/core';
import traverse, {NodePath} from '@babel/traverse';
import template from '@babel/template';
import {CallExpression, ExportAllDeclaration, ExportNamedDeclaration, Node, isIdentifier, isFile, isProgram, isStringLiteral, ImportDeclaration} from '@babel/types';

import {containsPlugin} from './support/babel-utils';
import {Logger} from './support/logger';
import {appendQueryParameter} from './support/url-utils';

const transformModulesAmd = require('@babel/plugin-transform-modules-amd');

export const transformJSModule = async(
    ast: Node, plugins: PluginItem[], queryParam: string, _logger: Logger):
    Promise<Node> => {
      rewriteSpecifiers(
          ast, (specifier) => appendQueryParameter(specifier, queryParam));
      const result =
          await transformFromAstAsync(ast, undefined, {ast: true, plugins});
      if (result && result.ast) {
        ast = result.ast;
      }
      if (containsPlugin(plugins, transformModulesAmd)) {
        ast = ensureDefineWrapper(ast);
      }
      return ast;
    };

const ensureDefineWrapper = (ast: Node): Node => {
  let defineCallExpression: CallExpression|undefined = undefined;
  // Check to see if the code in the AST has a define() call.  If not,
  // we need to wrap it in one.
  traverse(ast, {
    CallExpression: (path: NodePath<CallExpression>) => {
      const defineId = path.node.callee;
      if (isIdentifier(defineId) && defineId.name === 'define') {
        defineCallExpression = path.node;
      }
    }
  });
  if (defineCallExpression) {
    return ast;
  }
  let source;
  if (isFile(ast)) {
    ast = ast.program;
  }
  if (isProgram(ast)) {
    source = ast.body;
  } else {
    source = ast;
  }
  return template.ast`
        define([], function() {
          ${source}
        });` as Node;
};

const rewriteSpecifiers =
    (ast: Node, callback: (specifier: string) => string | undefined) => {
      const importExportDeclaration = {
        enter(path: NodePath<ImportDeclaration|ExportAllDeclaration|
                             ExportNamedDeclaration>) {
          if (path.node && path.node.source &&
              path.node.source.type === 'StringLiteral') {
            const specifier = path.node.source.value;
            const rewrittenSpecifier = callback(specifier);
            if (rewrittenSpecifier) {
              path.node.source.value = rewrittenSpecifier;
            }
          }
        }
      };
      traverse(ast, {
        ImportDeclaration: importExportDeclaration,
        ExportAllDeclaration: importExportDeclaration,
        ExportNamedDeclaration: importExportDeclaration,
        CallExpression: {
          enter(path) {
            const specifierStringLiteral = path.node && path.node.callee &&
                    path.node.callee.type === 'Import' &&
                    path.node.arguments.length === 1 ?
                path.node.arguments[0] :
                undefined;
            if (isStringLiteral(specifierStringLiteral)) {
              const specifier = specifierStringLiteral.value;
              const rewrittenSpecifier = callback(specifier);
              if (typeof rewrittenSpecifier === 'string') {
                specifierStringLiteral.value = rewrittenSpecifier;
              }
            }
          }
        }
      });
    };
