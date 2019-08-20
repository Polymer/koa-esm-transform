# koa-esm-transform

Middleware for Koa servers that transforms standard JavaScript modules to earlier versions of JavaScript and/or AMD modules (inlining loader script `@polymer/esm-amd-loader` into the HTML), for use with older browsers.  

Consider an HTML file containing the following inline JavaScript module:

```html
<script type="module">
import {someFunction} from './some-module.js';
someFunction();
</script>
```

The koa-esm-to-amd middleware would transform that HTML code to something like the following:

```html
<script>
// An inline loader script from `@polymer/esm-amd-loader` package
// which adds the `define` function used below.
</script>
<script>
define(["./some-module.js"], function (_someModule) {
  "use strict";

  (0, _someModule.someFunction)();
});
</script>
```

Because this is middleware, you can use it in a simple static file server as well with a proxy server.  This makes it possible to use in front of a test server such as the one `karma` starts up. (See [koa-karma-proxy](https://github.com/Polymer/koa-karma-proxy) for examples.)

Note: HTML and JavaScript are parsed on every request for those content-types, it is intended for use in development context to facilitate build-free testing/iteration as opposed to in a high volume production web server.

## How it works

By default, a set of babel transform plugins are chosen based on the known capabilities of the browser/user-agent identified in the Koa Context for the request.

When downstream server returns HTML content, it is scanned for module script tags (e.g. `<script type="module">`).  Any `src` attribute values are appended with the `__esmTransform` queryparameter.

Inline module script content and URLs with the `__esmTransform` queryparameter have their `import` specifiers appended with the `__esmTransform` to indicate the requested content should be treated as a module and compiled with the selected babel plugins.

Depending on plugins being used, certain support scripts will also be inlined into the HTML, such as `@polymer/esm-amd-loader` and `regenerator-runtime`.

## Options

- `babelPlugins`: Either an Array of babel plugins (e.g. `[require('@babel/plugin-transform-modules-amd')]`) or a Function that takes a Koa Context and returns an Array of babel plugins `(ctx) => []`.  Providing a value for this option will override the default behavior of the middleware's capabilities-based babel plugin selection.
- `exclude`: An array of requested paths or [minimatch](https://www.npmjs.com/package/minimatch) based patterns to match requested paths that should be excluded from any process/rewriting by the middleware.
- `queryParam`: You can redefine the appended queryparameter string from `__esmTransform` as something else.
- `logger`: Middleware will call `debug`, `info`, `warn` and `error` methods on `console` to log events.  If you use a different logger for your application, provide it here.
-`logLevel`: Set a minimum level for events to be logged to override the default level of `info`.
