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
import {Server} from 'http';
import Koa from 'koa';
import route from 'koa-route';
import {getPort} from 'portfinder';
import {Readable} from 'stream';

import {Logger} from '../support/logger';

export type AppOptions = {
  middleware?: Koa.Middleware[],
  routes?: {[key: string]: string|Function},
};

export const createApp = (options: AppOptions): Koa => {
  const app = new Koa();
  const {middleware, routes} = options;
  if (middleware) {
    for (const m of middleware) {
      app.use(m);
    }
  }
  if (routes) {
    for (const key of Object.keys(routes)) {
      const value = routes[key];
      app.use(route.get(key, (ctx) => {
        if (key.endsWith('.js')) {
          ctx.type = 'js';
        }
        if (key.endsWith('.html')) {
          ctx.type = 'html';
        }
        const stream = new Readable();
        stream.push(value);
        stream.push(null);
        ctx.body = stream;
      }));
    }
  }
  return app;
};

export const createAndServe =
    async (options: AppOptions, callback: (server: Server) => void) =>
        serveApp(createApp(options), callback);

export const serveApp = async(app: Koa, callback: (server: Server) => void):
    Promise<void> => new Promise(
        (resolve, reject) => getPort(
            {port: parseInt(process.env.PORT || '3000')},
            (err?: Error, port?: number) => {
              if (err) {
                reject(err);
              }
              const server =
                  app.listen(port)
                      .on('error', reject)
                      .on('listening', async () => {
                        await callback(server);
                        server.close((err) => err ? reject(err) : resolve());
                      });
            }));

export type TestLogger = Logger&{
  debugs: unknown[][],
  infos: unknown[][],
  errors: unknown[][],
  warns: unknown[][]
};

export const testLogger = (): TestLogger => {
  const logger: TestLogger = {
    debugs: [],
    debug: (...args: unknown[]) => logger.debugs.push(args),
    infos: [],
    info: (...args: unknown[]) => logger.infos.push(args),
    errors: [],
    error: (...args: unknown[]) => logger.errors.push(args),
    warns: [],
    warn: (...args: unknown[]) => logger.warns.push(args)
  };
  return logger;
};

export const squeeze = (html: string): string =>
    html.replace(/\s+/mg, ' ')
        .replace(/([a-z0-9\/]>)\s*/g, '$1\n')
        .replace(/\s*(<[a-z0-9\/])/g, '\n$1')
        .trim();
