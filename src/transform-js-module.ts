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
import {CallExpression, Node, isIdentifier, isFile, isProgram} from '@babel/types';

import {Logger} from './support/logger';

export const transformJSModule =
    async(ast: Node, _url: string, plugins: PluginItem[], _logger: Logger):
        Promise<Node> => {
          const result =
              await transformFromAstAsync(ast, undefined, {ast: true, plugins});
          if (result && result.ast) {
            ast = result.ast;
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
            if (!defineCallExpression) {
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
                });
              `;
            }
          }
          return ast;
        };
