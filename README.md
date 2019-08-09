# koa-esm-to-amd

Middleware for Koa servers that transforms standard JavaScript modules to AMD modules (it inlines the loader script `@polymer/esm-amd-loader` into the HTML), for use with older browsers that don't support modules natively.  

Consider an HTML file containing the following inline JavaScript module:

```html
<script type="module">
import {someFunction} from '../some-module.js';
someFunction();
</script>
```

The koa-esm-to-amd middleware would transform that HTML code to something like the following:

```html
<script>
// An inline loader script from `@polymer/esm-amd-loader` package
// which adds the `define` wrapper function used below.
</script>
<script>
define(["./some-module.js"], function (_someModule) {
  "use strict";

  (0, _someModule.someFunction)();
});
</script>
```

Because this is middleware, you can use it in a simple static file server as well as a proxy server sitting in front of a test server such as the one `karma` starts up. (See [karma testing setup](#karma-testing-setup) below.)

Note: HTML and JavaScript are parsed on every request for those content-types, it is intended for use in development context to facilitate build-free testing/iteration as opposed to in a high volume production web server.
