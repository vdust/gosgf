/*
 * Copyright (c) 2015-2016 Raphaël Bois Rousseau
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

(function (root, factory) {
  var modname = 'GoSgfViewer';

  if (typeof define === 'function' && define.amd) {
    define(modname.toLowerCase(), ['jquery', 'gosgf'], function () {
      return (root[modname] = factory.apply(root, arguments));
    });
  } else {
    root[modname] = factory.apply(root, [root.jQuery, root.GoSgf]);
    if (typeof module === 'object' && module.exports) module.exports = root[modname];
  }
})(typeof window !== 'undefined' ? window : this, function ($, GoSgf, undefined) {
  "use strict";

  var FILL = 'fill:',
      STROKE = 'stroke:',
      S_WIDTH = 'stroke-width:',
      S_LINECAP = 'stroke-linecap:',
      C_WHITE = '#fff',
      C_BLACK = '#000',
      C_NONE = 'none',
      SIZE = 19,
      SIZE_MIN = 2,
      SCALE = 30,
      SCALE_MIN = 5,
      COORDS_HZ = "ABCDEFGHJKLMNOPQRSTUVWXYZ",
      VB_OFF = 0.5,
      INLINE_BG = '#ec7',
      Aproto = Array.prototype,
      floor = Math.floor,
      max = Math.max;

  function pfx() {
    var c;
    c = (Aproto.map.call(arguments, function (s) { return s?'gosgf-'+s:''; })).join(' ');
    return (c||'').replace(/ +$/, '');
  }

  function x2text(x) {
    var l = COORDS_HZ.length,
        s = "";

    do {
      s = COORDS_HZ[x%l] + s;
      x = floor(x/l);
    } while (x > 0);

    return s;
  }

  function tag(closing, tagName, attrs, selfClose) {
    var buffer;
    if (typeof closing !== "boolean") {
      selfClose = attrs;
      attrs = tagName;
      tagName = closing;
      closing = false;
    }

    if (closing) return "</"+tagName+">";

    buffer = '<'+tagName;
    $.each(attrs, function (attr, value) {
      if (value === undefined || value === null) return;
      buffer += ' '+attr+'="'+($.isArray(value) ? value.join(" ") : value)+'"';
    });
    return buffer + (selfClose ? "/>" : ">");
  }

  function GoSgfViewer(options, container) {
    if (!this._create) {
      return new GoSgfViewer(options, container);
    }
    this._create(options, container);
    return this;
  }
  function labelDefault(next) {
    next(prompt("Label:"));
  }
  GoSgfViewer.prototype = {
    /* _create([options,] [container]) */
    _create: function (options, container) {
      var self = this;

      if (!$.isPlainObject(options)) {
        container = options;
        options = {};
      }

      self.options = {
        coordinates: true,
        defaultSize: [SIZE, SIZE],
        viewBoxOffset: VB_OFF, /* for clean 1:1 rendering with odd stroke-width */
        scale: SCALE,
        style: 'inline',
        edit: false,
        action: 'stone',
        label: null, /* function (cb, mods) {} // mods.shift, mods.alt, mods.ctrl */
        edited: null /* event when edit == true */
      };

      self.option(options||{}, true);

      container = self._container = $(container||'body');

      if (!container.length) throw new Error("Invalid container");

      self._svgWrapper = $('<div class="sgf-viewer-svg"/>').appendTo(container);

      if (container.data('sgf')) {
        self.sgfData(container.data('sgf'));
      } else {
        self.redraw();
      }
    },
    _editActions: {
      cr: 'circle',
      circle: 'circle',
      ma: 'cross',
      cross: 'cross',
      sl: 'selected',
      selected: 'selected',
      sq: 'square',
      square: 'square',
      tr: 'triangle',
      triangle: 'triangle',
      dd: 'dimmed',
      dimmed: 'dimmed',
      lb: 'label',
      label: 'label',
      stone: 'stone'
    },
    /* _setOption(key, value [, preventRefresh]) */
    _setOption: function (key, value, preventRefresh) {
      var o = this.options,
          redraw = true;
      switch (key) {
        case 'coordinates':
          value = !!value;
          break;
        case 'defaultSize':
          if (!$.isArray(value)) {
            value = [value, value];
          }
          value = [max(SIZE_MIN, (+value[0])||SIZE), max(SIZE_MIN, (+value[1])||SIZE)];
          break;
        case 'viewBoxOffset':
          value = +value||0;
          break;
        case 'scale':
          value = max(SCALE_MIN, +value||SCALE);
          break;
        case 'style':
          if (value !== 'inline' && value !== 'css') return;
          break;
        case 'action':
          value = this._editActions[(''+value).toLowerCase()];
          if (!value) return;
          redraw = o.coordinates && o.edit;
          break;
        case 'edit':
          value = !!value;
          redraw = o.coordinates;
          break;
        case 'label':
          if (typeof value !== 'function') value = null;
        default:
          redraw = false;
      }

      o[key] = value;

      if (preventRefresh) return redraw;
      if (redraw) {
        this.redraw();
      } else if (key === 'edit') {
        this.edit();
      }
    },
    /* option([key [, value] [, preventRefresh]]) */
    option: function (key, value, preventRefresh) {
      var self = this,
          needRedraw;

      if (arguments.length === 0) {
        return $.extend({}, self.options);
      }

      if (typeof key === 'object') {
        preventRefresh = value;
        $.each(key, function (k, v) {
          needRedraw = !!self._setOption(k, v, true) || needRedraw;
        });
      } else if (arguments.length === 1) {
        return self.options[key];
      } else {
        needRedraw = self._setOption(key, value, preventRefresh);
      }

      if (!preventRefresh && needRedraw) this.redraw();
    },
    _svgOnClick: function (evt) {
      /* Must be bound to the instance before used! */

      /* No support for old browser versions */
      var x, y,
          infos = this.svgInfos(),
          vb = infos.viewBox,
          sz = infos.board.size,
          scale = infos.scale,
          rect = this._svg.getBoundingClientRect();

      x = evt.clientX - rect.left;
      y = evt.clientY - rect.top;
      /* coordinates relative to the top-right corner of the board
       * (center of stones) */
      x = (x * vb.width / rect.width) + vb.left;
      y = (y * vb.height / rect.height) + vb.top;
      /* now translate thoses into intersection coordinates */
      x = floor(0.5 + x / scale);
      y = floor(0.5 + y / scale);

      /* check for board bounds */
      if (x < 0 || x >= sz[0] || y < 0 || y >= sz[1]) return;

      this.click(x, y, {
        shift:evt.shiftKey,
        ctrl:evt.ctrlKey,
        alt:evt.altKey
      });
    },
    edit: function (edit) {
      var self = this;

      if (arguments.length === 0) {
        edit = self.options.edit;
      } else {
        self.options.edit = !!edit;
      }

      if (!self._svg) return; /* target element doesn't exist yet. */

      self._svg.onclick = edit ? self._svgOnClick.bind(self) : null;
    },
    click: function (x, y, mods) {
      var o = this.options,
          clk = o.edited,
          value;
      if (!o.edit) return; /* edit mode required */
      if (arguments.length === 1) {
        o.edited = x;
      } else if (arguments.length >= 2) {
        mods = mods||{};
        this._editDoAction(x, y, mods, function () {
          if (typeof clk === 'function') clk(x, y, o.action, mods);
        });
      }
    },
    _editDoAction(x, y, mods, next) {
      var self = this,
          o = self.options,
          action = o.action,
          board = self._board, next, orig;

      if (!board) return;
      next = next || function () {};

      switch (action) {
        case 'dimmed':
          action = true; /* for toggleMark() magic */
        case 'circle':
        case 'cross':
        case 'selected':
        case 'square':
        case 'triangle':
          board.toggleMark(x, y, action);
          break;
        case 'stone':
          board.toggleMove(x, y, (mods && mods.shift) ? 'white' : 'black');
          break;
        case 'label':
          /* for labels, we need asynchronous capabilities to let applications
           * get the label from the user. The default callback uses a
           * synchronous prompt() call. */

          /* dry test to get previous label */
          orig = board.toggleMark(true, x, y, 'label', 'x');
          if (orig.mark.label) {
            /* label removal. no need for user input */
            board.toggleMark(x, y, 'label', 'x');
          } else {
            /* there was no label: ask for the new label */
            (o.label || labelDefault).call(null, function (lbl) {
              board.toggleMark(x, y, 'label', lbl);
              self.redraw();
              next();
            }, mods);
            /* asynchronous from now on. exit now. */
            return;
          }
          break;
      }
      self.redraw();
      next();
    },
    sgfData: function (data) {
      this._board = null;
      try {
        this._sgf = new GoSgf(data||'(;SZ[19])');
      } catch (e) { return false; }
      this._board = this._sgf.getBoard();
      return true;
    },
    board: function () {
      return this._board || null;
    },
    infos: function () {
      return this._board ? this._board.infos : {};
    },
    collectionSize: function () {
      return this._sgf ? this._sgf.collection.length : 0;
    },
    switchGame: function (i) {
      if (!this._sgf) return;
      var gt = this._sgf.collection[+i];
      if (gt) this._board.setGame(gt);
      this.redraw();
    },
    svgInfos: function () {
      var self = this,
          options = self.options,
          vbOff = options.viewBoxOffset,
          scale = options.scale,
          coords = options.coordinates,
          board = self._board,
          size = options.defaultSize,
          coordsDelta = coords ? floor(scale / 2) : 0;
          
      if (board) {
        size = board.nav.root().SZ || options.defaultSize;
      }

      return {
        'viewBox': {
          'left': -scale - coordsDelta + vbOff,
          'top': -scale - coordsDelta + vbOff,
          'width': (size[0] + 1) * scale + coordsDelta,
          'height': (size[1] + 1) * scale + coordsDelta,
        },
        'board': {
          'size': [size[0], size[1]],
          'width': (size[0] - 1) * scale,
          'height': (size[1] - 1) * scale,
        },
        'scale': scale,
        'coordinates': coords
      };
    },
    redraw: function () {
      var self = this,
          o = self.options,
          board = self._board,
          infos = self.svgInfos(),
          scale = infos.scale,
          coords = infos.coordinates,
          size = infos.board.size,
          bdWidth = infos.board.width,
          bdHeight = infos.board.height,
          viewBox = infos.viewBox,
          svg = [], lines = [],
          style, cls, mark,
          i, j, c, itn, lm, isc, dx, dy, mx, my;

      function open(tagName, attrs) {
        svg.push(tag(tagName, attrs));
      }
      function add(tagName, attrs) {
        svg.push(tag(tagName, attrs, true));
      }
      function addBody(tagName, body, attrs) {
        body = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        svg.push(tag(tagName, attrs) + body + tag(true, tagName));
      }
      function close(tagName) {
        svg.push(tag(true, tagName));
      }
      function inline() {
        return self.options.style === 'inline'
             ? Aproto.join.call(arguments, ";")+";"
             : null;
      }
      /* fontStyle([bold][,fill][,dsize])
       *   bold: boolean
       *   fill: string (css color)
       *   dsize: number (font-size: floor(scale/2)+dsize)
       */
      function fontStyle(bold, fill, dsize) {
        if (typeof (bold) !== 'boolean') {
          /* bold omitted */
          dsize = fill;
          fill = bold;
          bold = false;
        }
        if (typeof (fill) === 'number') {
          /* fill omitted */
          dsize = fill;
          fill = null;
        }
        dsize = +dsize||0;

        var args = [
          'font-size:' + floor((scale/2)+dsize)+'px',
          'text-anchor:middle',
          'alignment-baseline:middle',
          FILL + (fill || C_BLACK)
        ];
        if (bold) args.push('font-weight:bold');
        return inline.apply(self, args);
      }
      function circle(cls, sx, sy, r, style) {
        add('circle', {
          'class': cls,
          cx: sx,
          cy: sy,
          r: r,
          style: inline.apply(self, style||[])
        });
      }
      function dot(x, y) {
        circle(pfx('board-dot'), x * scale, y * scale, 3, [
          FILL + C_BLACK,
          STROKE + C_NONE
        ]);
      }
      function path(cls, d, style) {
        add('path', {
          'class': cls,
          d: ($.isArray(d) ? d.join(' ') : d),
          style: inline.apply(self, style||[])
        });
      }
      function cross(cls, x, y, r, style) {
        /* r: circumscribed circle radius */
        path(cls, [
          'M'+(x-r)+' '+(y-r)+' L'+(x+r)+' '+(y+r),
          'M'+(x+r)+' '+(y-r)+' L'+(x-r)+' '+(y+r)
        ], style);
      }
      function square(cls, x, y, r, style) {
        /* r: circumscribed circle radius */
        path(cls, [
          'M'+(x-r)+' '+(y-r),
          'L'+(x-r)+' '+(y+r),
          'L'+(x+r)+' '+(y+r),
          'L'+(x+r)+' '+(y-r),
          'Z'
        ], style);
      }
      function triangle(cls, x, y, r, style) {
        /* r: circumscribed circle radius */
        var dx = 0.866025 * r,
            dy = r / 2;
        path(cls, [
          'M'+x+' '+(y-r),
          'L'+(x-dx)+' '+(y+dy),
          'L'+(x+dx)+' '+(y+dy),
          'Z'
        ], style);
      }
      function rect(cls, x, y, w, h, style) {
        add('rect', {
          'class': cls,
          x: x,
          y: y,
          width: w,
          height: h,
          style: inline.apply(self, style||[])
        });
      }
      function coordinate(text, x, y) {
        if (coords) {
          addBody('text', text, {
            'class': pfx('board-coordinate'),
            x: x,
            y: y,
            style: fontStyle(-1)
          });
        }
      }

      open('svg', {
        viewBox: [
          viewBox.left,
          viewBox.top,
          viewBox.width,
          viewBox.height
        ]
      });

      rect(pfx('board-background'), viewBox.left, viewBox.top,
           viewBox.width, viewBox.height, [
        STROKE + C_NONE,
        FILL + INLINE_BG
      ]);

      /* draw vertical lines and add horizontal coordinates if enabled */
      for (i = 0; i < size[0]; i++) {
        isc = i * scale;
        coordinate(x2text(i), isc, -scale);
        lines.push('M'+isc+' 0 L'+isc+' '+bdHeight);
      }

      /* draw horizontal lines and add vertical coordinates if enabled */
      for (i = 0; i < size[1]; i++) {
        isc = i * scale;
        coordinate(''+(size[1] - i), -scale, isc);
        lines.push('M0 '+isc+' L'+bdWidth+' '+isc);
      }

      /* add grid path */
      path(pfx('board-grid'), lines, [
        STROKE + C_BLACK,
        S_WIDTH + '1',
        S_LINECAP + 'square',
        FILL + C_NONE
      ]);
      /* draw dots */
      if (size[0] >= 9 && size[1] >= 9) {
        dx = 2 + (size[0] > 9 ? 1 : 0);
        dy = 2 + (size[1] > 9 ? 1 : 0);
        mx = size[0] % 2 ? (size[0] - 1) / 2 : 0;
        my = size[1] % 2 ? (size[1] - 1) / 2 : 0;

        dot(dx, dy);
        dot(size[0] - dx - 1, dy);
        dot(dx, size[1] - dy - 1);
        dot(size[0] - dx - 1, size[1] - dy - 1);

        if (mx) {
          dot(mx, dy);
          dot(mx, size[1] - dy - 1);
        }
        if (my) {
          dot(dx, my);
          dot(size[0] - dx - 1, my);
        }
        if (mx && my) {
          dot(mx, my);
        }
      }

      if (board) {
        if (coords) {
          /* draw next player indicator */
          itn = board._board[0];
          mx = my = -scale;
          circle(pfx('board-next-player'), mx, my, floor(scale/4), [
            FILL + (board.nextplayer === itn.WHITE ? C_WHITE : C_BLACK),
            STROKE + C_BLACK,
            S_WIDTH + '1'
          ]);

          if (o.edit) {
            isc = floor(scale/7);
            cls = pfx('board-edit-mark');
            c = (board.nextplayer === itn.BLACK ? C_WHITE : C_BLACK);
            style = [
              FILL + C_NONE,
              STROKE + c,
              S_WIDTH + '2'
            ];
            mark = null;
            switch (o.action) {
              case 'circle':
                circle(cls, mx, my, isc, style);
                break;
              case 'cross':
                cross(cls, mx, my, isc, style);
                break;
              case 'selected':
                mark = 'SL';
                break;
              case 'square':
                square(cls, mx, my, isc, style);
                break;
              case 'triangle':
                triangle(cls, mx, my, isc, style);
                break;
              case 'dimmed':
                mark = 'DD';
                break;
              case 'label':
                mark = 'LB';
                break;
              case 'alpha':
                mark = 'A';
                break;
              case 'number':
                mark = '1';
                break;
            }
            if (mark) {
              addBody('text', mark, {
                'class': cls,
                x: mx,
                y: my,
                style: fontStyle(true, c, -scale/5)
              });
            }
          }
        }

        lm = board.lastmove;
        for (j = 0; j < size[1]; j++) {
          for (i = 0; i < size[0]; i++) {
            itn = board.get(i + j * size[0]);
            mx = i * scale;
            my = j * scale;
            c = (itn.color === itn.BLACK ? 'black' : 'white');
            mark = itn.mark || {};

            /* draw stone if any */
            if (itn.color !== itn.NONE) {
              cls = pfx('stone', 'stone-' + c, mark.last ? 'stone-last-move' : null);
              style = [
                STROKE + ((mark.last && !mark.ignorelaststyle) ? '#c30': C_BLACK),
                S_WIDTH + ((mark.last && !mark.ignorelaststyle) ? '2' : '1'),
                FILL + c
              ];
              circle(cls, mx, my, floor((scale - 1) / 2), style);
            }

            /* draw marks */
            if (itn.color === itn.NONE && mark.label) {
              /* for label readability, add a mask over empty intersections */
              circle(pfx('mark-mask'), mx, my, floor(scale/2), [
                FILL + INLINE_BG,
                STROKE + C_NONE
              ]);
            }
            style = [
              STROKE + (itn.color === itn.BLACK ? C_WHITE : C_BLACK),
              S_WIDTH + '2',
              FILL + C_NONE
            ];
            cls = pfx('mark', 'mark-'+c, mark.type ? 'mark-'+mark.type : '');
            isc = floor(scale / 4);
            switch (mark.type) {
              case 'circle':
                circle(cls, mx, my, isc, style);
                break;
              case 'cross':
                cross(cls, mx, my, isc, style);
                break;
              case 'square':
                square(cls, mx, my, isc, style);
                break;
              case 'triangle':
                triangle(cls, mx, my, 1.25 * isc, style);
                break;
              case 'selected':
                rect(cls, mx - (scale / 2), my - (scale / 2), scale, scale, [
                  STROKE + C_NONE,
                  FILL + 'rgba(255, 255, 0, 0.5)' 
                ]);
                break;
            }
            if (mark.label) {
              addBody('text', ''+mark.label, {
                'class': pfx('mark', 'mark-'+c, 'mark-label'),
                x: mx,
                y: my,
                style: fontStyle(true, itn.color === itn.BLACK ? C_WHITE : C_BLACK)
              });
            }

            if (itn.hidden || mark.dimmed) {
              /* for dimmed or hidden intersections, we use a mask over with
               * background color (simpler) */
              rect(pfx('board-hidden'), mx - scale/2, my - scale/2, scale+0.2, scale+0.2, [
                STROKE+C_NONE,
                FILL+INLINE_BG,
                'opacity:'+(itn.hidden ? '1.0' : '0.7')
              ]);
            }
          } /* for i */
        } /* for j */
      } /* if _board */

      close('svg');

      self._svgWrapper.html(svg.join(""));
      self._svg = self._svgWrapper.children('svg').get(0);
      self.edit(); /* previous handlers were cleared */
    },
    _: undefined /* placeholder: must be last */
  };

  $.fn.goSgfViewer = (function (datakey, Class) {
    return function (options) {
      var isstr = (typeof options === 'string'),
          fargs, ret, target;

      if (isstr && !/^[a-zA-Z]/.test(options)) {
        console.error("Illegal method call");
        return this;
      } else if (!isstr && options && !$.isPlainObject(options)) {
        console.error("Invalid parameter: plain object or string expected");
        return this;
      }

      fargs = Aproto.slice.call(arguments, 1);

      this.each(function () {
        var el = $(this),
            inst = el.data(datakey),
            _ret, target;

        /* Operations on existing instance */
        if (isstr) {
          if (!inst) {
            console.error("Method call on uninitialized object");
            return;
          }

          target = inst[options];

          if (typeof target !== 'function') {
            _ret = target;
          } else {
            _ret = target.apply(inst, fargs);
          }

          ret = ret === undefined ? _ret : ret;
          /* stop at the first instance returning a value. */
          return ret === undefined;
        }

        if (inst) {
          console.warn("Instance already initialized.");
        } else {
          el.data(datakey, new Class(options||{}, el));
        }
      });

      return ret === undefined ? this : ret;
    };
  })(pfx('viewer'), GoSgfViewer);

  return (this.GoSgf.Viewer = GoSgfViewer);
});
