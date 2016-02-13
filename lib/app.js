/*
 * Copyright (c) 2016 Raphaël Bois Rousseau
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software  and associated  documentation  files (the  "Software"), to
 * deal in the Software without  restriction, including  without limitation the
 * rights to use, copy, modify, merge,  publish, distribute, sublicense, and/or
 * sell copies of the Software,  and to permit persons  to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice  and this permission notice  shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED  "AS IS", WITHOUT WARRANTY  OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING  BUT NOT  LIMITED TO THE  WARRANTIES OF  MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND  NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR  COPYRIGHT  HOLDERS BE  LIABLE FOR  ANY CLAIM,  DAMAGES  OR OTHER
 * LIABILITY,  WHETHER IN AN  ACTION OF  CONTRACT, TORT  OR OTHERWISE,  ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
 * IN THE SOFTWARE.
 */

var fs = require('fs');
var resolve = require('path').resolve;
var format = require('util').format;

var URL = require('url');
var async = require('async');
var express = require('express');
var kramed = require('kramed');

var DEFAULT_PORT = 8080;

module.exports = function app() {
  var app = express();
  var trusted = app.trusted = {};

  /**
   * bootstrapping stuff
   */
  var boot;
  var isbootstrapped = false;
  var booterrors = [];
  function bootstrapped() {
    if (isbootstrapped) {
      app.emit('bootstrapped', booterrors.length ? booterrors : undefined);
    }
    return isbootstrapped;
  }
  function taskcb(err) {
    if (!err) return;
    if (typeof err !== 'string') {
      err = err.message || err.toString();
    }
    booterrors.push(err);
  }
  function newTask(fn) {
    if (!boot) return;
    boot.push(fn, taskcb);
  }

  app.bootTask = newTask;

  app.bootstrap = function bootstrap(cb) {
    if (cb) app.once('bootstrapped', cb);
    if (boot || bootstrapped()) return;

    boot = async.queue(function bootWorker(task, callback) {
      task(callback);
    });

    boot.drain = function onBootDrain() {
      isbootstrapped = true;
      bootstrapped();
    };

    newTask(function (next) {
      /* Load map of trusted hosts
       * The map associates hostnames to a regexp matching allowed protocols
       * (including trailing ':'). Currently, only 'http' and 'https' are
       * accepted.
       */
      fs.readFile(resolve(__dirname, '../trusted.json'), 'utf8', function (err, data) {
        if (err) {
          return next("Failed to load trusted hostnames list");
        }
        data = JSON.parse(data);
        Object.keys(data).forEach(function (k) {
          trusted[k] = new RegExp(data[k]);
        });
        process.nextTick(next);
      });
    });
  }

  app.run = function (port) {
    app.bootstrap(function (err) {
      (err||[]).forEach(function (e) {
        console.error(e);
      });
      process.nextTick(function () {
        var server = app.server = app.listen(port||DEFAULT_PORT, function () {
          var host = server.address().address;
          var port = server.address().port;
          if (host = '::') host = 'localhost';
          console.log("App listening at http://%s:%s%s/", host, port, app.path());
        });
      });
    });
  };

  function _fetch(req, res) {
    var u = URL.parse(req.query.url),
        th = trusted[u.hostname],
        fetchlib;

    if (!th || !th.test(u.protocol)) {
      /* we forbid proxied fetching from untrusted websites */
      return res.sendStatus(!th ? 400 : 403);
    }

    switch (u.protocol) {
      case 'http:':
      case 'https:':
        fetchlib = require('follow-redirects')[u.protocol.slice(0, -1)];
        break;
      default:
        /* Not Implemented (but might be in the future) */
        return res.sendStatus(501);
    }

    fetchlib.get(u.href, function (_res) {
      var buffer = new Buffer([]);
      /* redirectable 3xx already handled */
      if (_res.statusCode >= 300 && _res.statusCode < 500) {
        /* Forward remote status */
        return res.sendStatus(_res.statusCode);
      } else if (_res.statusCode >= 500) {
        /* Bad gateway (remote has issues we can't solve) */
        return res.sendStatus(502);
      }

      /* We want to send raw data so we just manipulate buffers directly. */
      _res.on('data', function (data) {
        buffer = Buffer.concat([buffer, data], buffer.length + data.length);
      });

      _res.on('end', function () {
        res.set({
          'Content-Type': 'application/x-go-sgf; charset=latin1',
        });
        res.send(buffer);
      });
    }).on('error', function (e) {
      console.log("http request failed: "+e.message+" ["+u.href+"]");
      res.sendStatus(503); /* DNS error, etc. */
    });
  }

  /*** Setup */
  app.set('view engine', 'jade');
  app.set('views', resolve(__dirname, '../views'));
  app.set('title', 'Sgf Viewer');
  app.use('/static', express.static('static'));
  app.use('/gosgf', express.static('gosgf'));
  app.get('/', function (req, res) {
    res.render('index', { app: app, req: req });
  });
  app.get('/readme', function (req, res, next) {
    fs.readFile(resolve(__dirname, '../README.md'), 'utf-8', function (err, data) {
      if (err) {
        console.log(err);
        return res.sendStatus(500);
      }
      res.render('readme', { req: req, readme: kramed(data) });
    });
  });
  app.get('/license', function (req, res, next) {
    fs.readFile(resolve(__dirname, '../LICENSE.md'), 'utf-8', function (err, data) {
      if (err) {
        console.log(err);
        return res.sendStatus(500);
      }
      res.render('license', { req: req, license: kramed(data) });
    });
  });
  app.get('/fetch', _fetch);
  /***/

  return app;
}
