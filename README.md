Node.js-based go game viewer
============================

_Note: there is no documentation at this point._

Setup and run
-------------

~~~
$ npm install
$ node .
~~~

The implementation requires a modern browser with inline SVG support.
_Not tested on mobile devices._

Sgf parser and SVG board renderer
---------------------------------

Redistributable files can be found in the folder ``gosgf/``:

* ``gosgf/gosgf.js`` contains the core objects for sgf files parsing, according
  to the [SGF specification][sgf-spec]. The implementation is Go-specific, even
  though the spec is designed to represent other board games. Works both in
  node.js and browsers.

* ``gosgf/jquery.gosgf.js`` is a client-side jQuery-based SVG board renderer.
  It requires ``gosgf/gosgf.js``.

[sgf-spec]: http://www.red-bean.com/sgf/
