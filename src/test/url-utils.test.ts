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
import test from 'tape';
import {appendQueryParameter, extractQueryParameter} from '../support/url-utils';

test('appendQueryParameter', (t) => {
  t.plan(6);
  t.equal(
      appendQueryParameter('/some/path', 'my-param'),
      '/some/path?my-param',
      'should append parameter without value');
  t.equal(
      appendQueryParameter('/some/path', 'my-param', 'my-value'),
      '/some/path?my-param=my-value',
      'should append parameter with value');
  t.equal(
      appendQueryParameter('/some/path?some-param', 'my-param'),
      '/some/path?some-param&my-param',
      'should append parameter when existing querystring present');
  t.equal(
      appendQueryParameter('/some/path?some-param', 'my-param'),
      '/some/path?some-param&my-param',
      'should append parameter when existing querystring present');
  t.equal(
      appendQueryParameter('https://example.com/some/path', 'my-param'),
      'https://example.com/some/path?my-param',
      'should append parameter for fully-qualified URLs');
  t.equal(
      appendQueryParameter('', 'my-param'),
      '?my-param',
      'should be able to append empty path');
});

test('extractQueryParameter', (t) => {
  t.plan(4);
  t.deepEqual(
      extractQueryParameter('/some/path?my-param', 'my-param'),
      {url: '/some/path', value: undefined},
      'should be able to extract param with no value');
  t.deepEqual(
      extractQueryParameter('/some/path?my-param=my-value', 'my-param'),
      {url: '/some/path', value: 'my-value'},
      'should be able to extract param with a value');
  t.deepEqual(
      extractQueryParameter(
          '/some/path?my-param=my-value&other-param=other-value', 'my-param'),
      {url: '/some/path?other-param=other-value', value: 'my-value'},
      'should be able to extract param with value among other params');
  t.deepEqual(
      extractQueryParameter('/some/path?other-param=other-value', 'my-param'),
      {url: '/some/path?other-param=other-value', value: undefined},
      'should return unchanged URL when param not found');
});
