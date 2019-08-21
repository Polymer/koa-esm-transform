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

import {format, parse} from 'url';

export const relativizeSrc = (src: string): string => {
  const url = parse(src);
  if (!url.protocol && !url.host && !src.startsWith('/') &&
      !src.startsWith('.')) {
    return `./${src}`;
  }
  return src;
};

export const appendQueryParameter =
    (url: string, param: string, value?: string): string => {
      const parsed = parse(url);
      const params = parsed.query ? parsed.query.split('&') : [];
      if (typeof value === 'string') {
        params.push(
            `${encodeURIComponent(param)}=${encodeURIComponent(value)}`);
      } else {
        params.push(`${encodeURIComponent(param)}`);
      }
      parsed.search = `?${params.join('&')}`;
      return format(parsed);
    };

export const extractQueryParameter =
    (url: string, param: string): {url: string, value: string|undefined} => {
      const parsed = parse(url);
      const params = parsed.query ? parsed.query.split('&') : [];
      let value = undefined;
      const index = params.findIndex((pair: string): boolean => {
        const split = pair.split('=');
        if (split[0] === param) {
          value = split[1];
          return true;
        }
        return false;
      });
      if (index !== -1) {
        params.splice(index, 1);
        parsed.search =
            params.length === 0 ? undefined : `?${params.join('&')}`;
      }
      return {url: format(parsed), value};
    };
