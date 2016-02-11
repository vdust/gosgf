(function (root, factory) {
  var modname = 'GoSgf';

  if (typeof define === 'function' && define.amd) {
    define(modname.toLowerCase(), [], function () {
      return (root[modname] = factory.apply(root, arguments));
    });
  } else {
    root[modname] = factory.apply(root, []); 
    if (typeof module === 'object' && module.exports) module.exports = root[modname];
  }
})(typeof window !== 'undefined' ? window : this, function (undefined) {
  "use strict";

  var global = this, /* for convenience */
      hasBuffer = typeof global.Buffer !== 'undefined',
      floor = Math.floor,
      min = Math.min,
      max = Math.max,
      slice = Array.prototype.slice,
      each;

  function each(array, cb) {
    array.forEach(cb, array);
    return array;
  }
  function merge(dest) {
    each(slice.call(arguments, 1), function (a, i) {
      if (!a instanceof Array) throw new Error("argument "+i+" is not an array");
      if (a.length) {
        each(a, function (v) {
          dest.push(v);
        });
      }
    });
    return dest;
  }
  function eachKey(obj, cb) {
    var keys = Object.keys(obj), i;
    for (i = 0; i < keys.length; i++) {
      cb.call(obj, keys[i], obj[keys[i]], obj);
    }
    return obj;
  }
  /* extend([deep,] dest, obj1, ...) */
  function extend(deep, dest) {
    var offset = 2;
    if (typeof deep !== 'boolean') {
      dest = deep;
      deep = false;
      offset = 1;
    }
    each(slice.call(arguments, offset), function (o, i) {
      if (o === undefined) return;
      if (typeof o !== 'object') throw new Error("argument "+i+" is not an object");
      eachKey(o, function (k, v) {
        if (!deep || typeof v !== 'object' || v instanceof Array) {
          dest[k] = v;
        } else {
          extend(dest[k], v);
        }
      });
    });
    return dest;
  }

  var NONE = 0, BLACK = 1, WHITE = 2;

  var _cpRE = /([\]:\\])/g,
      _anyRE = /([\]\\])/g;
  function anyToString(v, composed) {
    if (v === undefined) return '';
    if (typeof v.toString === 'function') {
      v = v.toString();
    } else {
      v = ''+v;
    }
    return v.replace(composed ? _cpRE : _anyRE, '\\$1');
  }

  function Point(x, y) {
    if (arguments.length === 1) {
      this.fromString(x);
    } else {
      this.x = +x;
      this.y = +y;
    }
  }
  Point.prototype = {
    moveCHARS: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
    fromString: function (s) {
      var chars = this.moveCHARS, x, y;
      x = chars.indexOf(s[0]);
      y = chars.indexOf(s[1]);
      if (x < 0 || y < 0) throw new Error("Invalid point string");
      this.x = x;
      this.y = y;
    },
    toArray: function () {
      return [ this.x, this.y ];
    },
    toString: function () {
      var chars = this.moveCHARS;
      return chars[this.x] + chars[this.y];
    }
  };

  function Composed(first, second) {
    this.first = first;
    this.second = second;
  }
  Composed.prototype = {
    toArray: function () {
      return [ this.first, this.second ];
    },
    toString: function () {
      return anyToString(this.first, true) + ':' + anyToString(this.second, true);
    }
  };


  function Node() {
    this._raw = {};
  }


  function Spec() {
    this._init.apply(this, arguments);
  }
  Spec.prototype = {
    Point: Point,
    Composed: Composed,
    charset: 'latin1',
    utf8: {
      'utf8': 1,
      'UTF8': 1,
      'utf-8': 1,
      'UTF-8': 1
    },
    _checkRoot: function (key) {
      if (!this.isroot) {
        throw "Root property '"+key+"' used outside of root node";
      }
    },
    _checkSpecVersion: function (version) {
      switch (version) {
        case 3:
        case 4:
          return true;
      }
      throw "Unsupported SGF format version";
    },
    _decode: function (value) {
      /* According to the sgf spec, raw values are assumed to be latin1, unless
       * an explicit charset is provided. Due to browsers and node.js
       * limitations, we support only latin-1 and utf-8 encodings here.
       *
       * Since Browser-side js doesn't have a Buffer class, we need to use a
       * trick in case of utf-8 charset:
       * escape() encodes as latin1 while decodeURIComponent() decodes as utf8.
       */
      if (value === undefined) value = '';
      if (this.utf8[this.charset]) {
        if (hasBuffer) {
          value = (new Buffer(value, 'binary')).toString('utf8');
        } else {
          /* XXX trick for browser-side script (see above) */
          try {
            value = decodeURIComponent(escape(value));
          } catch (e) {}
        }
      }
      return value;
    },
    _formatPoint: function (value) {
      if (value.length != 2) return;
      try {
        return new (this.Point)(value);
      } catch (e) {
        return;
      }
    },
    _formatReal: function (value) {
      return +value;
    },
    _formatComposeNumbers: function (value) {
      var numbers = value.split(':'),
          C = this.Composed, composed;
      if (numbers.length == 1) {
        composed = new C(floor(numbers[0]), floor(numbers[0]));
      } else if (numbers.length == 2) {
        composed = new C(floor(numbers[0]), floor(numbers[1]));
      }
      return (isNaN(composed.first) || isNaN(composed.second)) ? undefined : composed;
    },
    _formatPoints: function (value, isrange) {
      var self = this,
          accu, x, y;
      if (!value) return [];
      value = value.split(':');
      if (value.length == 1) {
        return self._formatPoint(value[0]);
      } else if (value.length == 2) {
        value[0] = self._formatPoint(value[0]);
        value[1] = self._formatPoint(value[1]);
        if (!value[0] || !value[1]) return;
        if (!isrange) return new (self.Composed)(value[0], value[1]);
        accu = [];
        for (y = value[0].y; y <= value[1].y; y++) {
          for (x = value[0].x; x <= value[1].x; x++) {
            accu.push(new (self.Point)(x, y));
          }
        }
        return accu;
      }
      return;
    },
    _formatLabel: function (value) {
      if (!value) return [];
      value = value.match(/^([^:]+):(.*)*/);
      if (!value) return undefined;
      value = new (this.Composed)(this._formatPoint(value[1]), this._formatSimpleText(value[2]));
      return value.first ? value : undefined;
    },
    _formatColor: function (value) {
      switch (value.toUpperCase()) {
        case "W":
          return WHITE;
        case "B":
          return BLACK;
      }
      return;
    },
    _formatText: function (value) {
      if (value === undefined) value = '';
      value = this._decode(value);
      value = value.replace(/\n\r|\r\n|\r|\n/g, "\n");
      value = value.replace(/\\\n/g, "");
      value = value.replace(/\\(.)/g, "$1");
      return value;
    },
    _formatSimpleText: function (value) {
      value = this._formatText(value);
      value = value.replace(/\s+/g, ' ');
      value = value.replace(/^ +| +$/, '');
      return value;
    },
    _formatHighlight: function (value) {
      value = this._formatReal(value);
      switch (value) {
        case 1:
        case 2:
          return value;
      }
      return;
    },
    _oneValue: function (values, formater, defaultEmpty, extra) {
      if (values.length > 1) return;
      if (!values.length) return defaultEmpty;
      if (formater) {
        return formater.apply(this, merge([values[0]], extra||[]));
      }
      return values[0];
    },
    _listValues: function (values, formater, allowEmpty, extra) {
      var self = this, accu, i, v;
      if (!values.length) {
        return allowEmpty ? [] : undefined;
      }
      accu = [];
      each(values, function (v) {
        if (formater) {
          v = formater.apply(self, merge([v], extra||[]));
        }
        if (v instanceof Array) {
          merge(accu, v);
        } else if (v !== undefined) {
          accu.push(v);
        }
      });
      return accu;
    },

    decodePoint: function (key, values) {
      return this._oneValue(values, this._formatPoint);
    },
    decodeFlag: function (key, values) {
      /* ignoring values */
      return true;
    },
    decodeNumber: function (key, values) {
      return this._oneValue(values, this._formatReal);
    },
    decodeSpec: function (key, values) {
      this._checkRoot(key);
      values = this.decodeNumber(key, values);
      this._checkSpecVersion(values);
      return values;
    },
    decodeGameType: function (key, values) {
      this._checkRoot(key);
      values = this.decodeNumber(key, values);
      if (values != 1) throw "Unsupported game type. expect: 1, for: " + values;
      return values;
    },
    decodeVariationMode: function (key, values) {
      this._checkRoot(key);
      values = this.decodeNumber(key, values);
      if (values < 0 || values > 3) {
        /* strip unknow flags */
        values = values > 0 ? values&3 : 0;
      }
      return values;
    },
    decodeBoardSize: function (key, values) {
      var l, size;
      this._checkRoot(key);
      values = this._oneValue(values, this._formatComposeNumbers);
      l = this.Point.prototype.moveCHARS.length;
      if (values.first < 2 || values.second < 2 || values.first > l || values.second > l) {
        throw "Illegal board size. 2 < SZ < " + l;
      }
      return values.toArray();
    },
    decodePointsList: function (key, values, allowEmpty) {
      return this._listValues(values, this._formatPoints, allowEmpty, [true]);
    },
    decodePointsEList: function (key, values) {
      return this.decodePointsList(key, values, true);
    },
    decodeColor: function (key, values) {
      return this._oneValue(values, this._formatColor);
    },
    decodeCharset: function (key, values) {
      this._checkRoot(key);
      values = this._oneValue(values);
      if (values) this.charset = values;
      return values;
    },
    decodeSimpleText: function (key, values) {
      return this._oneValue(values, this._formatSimpleText);
    },
    decodeText: function (key, values) {
      return this._oneValue(values, this._formatText);
    },
    decodeHighlight: function (key, values) {
      return this._oneValue(values, this._formatHighlight);
    },
    decodeReal: function (key, values) {
      return this._oneValue(values, this._formatReal);
    },
    decodeComposedPointsList: function (key, values) {
      return this._listValues(values, this._formatPoints);
    },
    decodeLabelList: function (key, values) {
      return this._listValues(values, this._formatLabel);
    },
    decodeSimpleTexts: function (key, values) {
      var s = this._oneValue(values, this._formatSimpleText),
          v = s.split(':'), s1, s2;
      s1 = v.shift();
      while (s1.substr(-1) == "\\" && v.length) {
        s1 += ':'+v.shift();
      }
      s2 = v.join(":");
      return new (this.Composed)(s1, s2);
    },
    decodeNumberText: function (key, values) {
      var s = this.decodeSimpleTexts(key, values),
          n = this._formatReal(s[0]);
      if (isNaN(n)) return undefined;
      return new (this.Composed)(n, s[1]);
    },
    encodeValue: function (v) {
      return '['+anyToString(v)+']';
    },
    encodeFlag: function (v) {
      return '[]';
    },
    encodeBoardSize: function (s) {
      return '['+(s[0] === s[1] ? s[0] : s.join(':'))+']';
    },
    encodeList: function (list) {
      var self = this;
      if (!list || !list.length) return '[]';
      return list.map(function (v) { return self.encodeValue(v); }).join('');
    },
    encodeColor: function (c) {
      return '['+(c === BLACK ? 'B' : (c === WHITE ? 'W' : ''))+']';
    },
    encodePointsList: function (list) {
      /* TODO: compress the list to rectangles where possible
       * Need rectangles decomposition algorithm
       */
      return this.encodeList(list);
    },

    _init: function () {
      var self = this,
          decodePoint = self.decodePoint,
          decodeFlag = self.decodeFlag,
          decodeNumber = self.decodeNumber,
          decodePointsEList = self.decodePointsEList,
          decodePointsList = self.decodePointsList,
          decodeSimpleText = self.decodeSimpleText,
          decodeText = self.decodeText,
          decodeHighlight = self.decodeHighlight,
          decodeReal = self.decodeReal,
          decodeComposedPointsList = self.decodeComposedPointsList,
          encodeValue = self.encodeValue,
          encodeFlag = self.encodeFlag,
          encodePointsList = self.encodePointsList,
          encodeList = self.encodeList;

      self.DECODERS = {
        B:  decodePoint,
        W:  decodePoint,
        KO: decodeFlag,
        DO: decodeFlag,
        IT: decodeFlag,
        MN: decodeNumber,
        OB: decodeNumber,
        OW: decodeNumber,
        PM: decodeNumber,
        HA: decodeNumber,
        FF: self.decodeSpec,
        GM: self.decodeGameType,
        ST: self.decodeVariationMode,
        SZ: self.decodeBoardSize,
        DD: decodePointsEList,
        VW: decodePointsEList,
        TB: decodePointsEList,
        TW: decodePointsEList,
        AB: decodePointsList,
        AE: decodePointsList,
        AW: decodePointsList,
        CR: decodePointsList,
        MA: decodePointsList,
        SL: decodePointsList,
        SQ: decodePointsList,
        TR: decodePointsList,
        PL: self.decodeColor,
        CA: self.decodeCharset,
        DT: decodeSimpleText,
        RE: decodeSimpleText,
        RU: decodeSimpleText,
        N:  decodeSimpleText,
        AN: decodeSimpleText,
        BR: decodeSimpleText,
        BT: decodeSimpleText,
        CP: decodeSimpleText,
        EV: decodeSimpleText,
        GN: decodeSimpleText,
        ON: decodeSimpleText,
        OT: decodeSimpleText,
        PB: decodeSimpleText,
        PC: decodeSimpleText,
        PW: decodeSimpleText,
        RO: decodeSimpleText,
        SO: decodeSimpleText,
        US: decodeSimpleText,
        WR: decodeSimpleText,
        WT: decodeSimpleText,
        C:  decodeText,
        GC: decodeText,
        DM: decodeHighlight,
        GB: decodeHighlight,
        GW: decodeHighlight,
        HO: decodeHighlight,
        UC: decodeHighlight,
        BM: decodeHighlight,
        TE: decodeHighlight,
        V:  decodeReal,
        TM: decodeReal,
        BL: decodeReal,
        WL: decodeReal,
        KM: decodeReal,
        AR: decodeComposedPointsList,
        LN: decodeComposedPointsList,
        LB: self.decodeLabelList,
        AP: self.decodeSimpleTexts,
        FG: self.decodeNumberText
      };

      self.ENCODERS = {
        B:  encodeValue,
        W:  encodeValue,
        KO: encodeFlag,
        DO: encodeFlag,
        IT: encodeFlag,
        MN: encodeValue,
        OB: encodeValue,
        OW: encodeValue,
        PM: encodeValue,
        HA: encodeValue,
        FF: encodeValue,
        GM: encodeValue,
        ST: encodeValue,
        SZ: self.encodeBoardSize,
        DD: encodePointsList,
        VW: encodePointsList,
        TB: encodePointsList,
        TW: encodePointsList,
        AB: encodePointsList,
        AE: encodePointsList,
        AW: encodePointsList,
        CR: encodePointsList,
        MA: encodePointsList,
        SL: encodePointsList,
        SQ: encodePointsList,
        TR: encodePointsList,
        PL: self.encodeColor,
        CA: encodeValue,
        DT: encodeValue,
        RE: encodeValue,
        RU: encodeValue,
        N:  encodeValue,
        AN: encodeValue,
        BR: encodeValue,
        BT: encodeValue,
        CP: encodeValue,
        EV: encodeValue,
        GN: encodeValue,
        ON: encodeValue,
        OT: encodeValue,
        PB: encodeValue,
        PC: encodeValue,
        PW: encodeValue,
        RO: encodeValue,
        SO: encodeValue,
        US: encodeValue,
        WR: encodeValue,
        WT: encodeValue,
        C:  encodeValue,
        GC: encodeValue,
        DM: encodeValue,
        GB: encodeValue,
        GW: encodeValue,
        HO: encodeValue,
        UC: encodeValue,
        BM: encodeValue,
        TE: encodeValue,
        V:  encodeValue,
        TM: encodeValue,
        BL: encodeValue,
        WL: encodeValue,
        KM: encodeValue,
        AR: encodeList,
        LN: encodeList,
        LB: encodeList,
        AP: encodeValue,
        FG: encodeValue
      };
      self.reset();
    },
    reset: function () {
      this.charset = Spec.prototype.charset;
      this.isroot = true;
    },
    checkCharset: function (node) {
      var ca;
      if (this.isroot && node._raw && 'CA' in node._raw) {
        ca = node._raw.CA;
        delete node._raw.CA;
        node.CA = this.DECODERS.CA.call(this, 'CA', ca);
      }
      return node.CA;
    },
    validate: function (node, key, values) {
      if (values) {
        values = (this.DECODERS[key]||function(){}).call(this, key, values);
        if (values !== undefined) node[key] = values;
      }
      return values;
    },
    validateNode: function (node, keepRaw) {
      var self = this;
      if (!node._raw) return;
      self.checkCharset(node);
      eachKey(node._raw, function (k, values) {
        if (self.validate(node, k, values) !== undefined) {
          delete node._raw[k]; /* known values are removed from _raw */
        }
      });
      if (!keepRaw) delete node._raw;
    },
    nodeToString: function (node) {
      var self = this, props = [];
      eachKey(node, function (k, value) {
        if (k[0] === '_') return;
        value = (self.ENCODERS[k]||function(){}).call(self, value);
        props.push(k+(value||'[]'));
      });
      eachKey(node._raw||{}, function (k, value) {
        /* raw values are already escaped */
        props.push(k+'['+value+']');
      });
      return ';'+props.join('');
    },
  };

  var TOK_VARIANT_START = 1,
      TOK_NODE_START = 2,
      TOK_NODE_END = 3,
      TOK_PROP_NAME = 4,
      TOK_VALUE_START = 5,
      TOK_VALUE = 6,
      TOK_VALUE_END = 7,
      TOK_VARIANT_END = 8,
      TOK_END = 9,
      TOK_PROP_CHAR = 10,
      TOK_SPACE = 11,
      TOK_ESCAPE = 12,
      TOK_ERROR = 100,
      TOK_UNREACHABLE = 101; /* debug state for states that should not be possible */
  var STATE_START = 1,
      STATE_VARIANT = 2,
      STATE_VARIANTS = 3,
      STATE_NODE = 4,
      STATE_NODE_END = 5,
      STATE_PROPNAME = 6,
      STATE_PROP = 7,
      STATE_VALUE = 8,
      STATE_VALUE_END = 9,
      STATE_VALUES = 10;

  var TOKENS = {
    '(': TOK_VARIANT_START,
    ')': TOK_VARIANT_END,
    ';': TOK_NODE_START,
    '[': TOK_VALUE_START,
    ']': TOK_VALUE_END,
    '\\': TOK_ESCAPE,
  };
  function _addToken(s, tok) {
    if (!s) return;
    each(s.split(''), function (s) {
      TOKENS[s] = tok;
    });
  }
  _addToken(' \t\r\n\d', TOK_SPACE);
  _addToken('ABCDEFGHIJKLMNOPQRSTUVWXYZ', TOK_PROP_CHAR);

  function Tokenizer(data) {
    /* The sgf spec says that files are latin1 by default.
     * In order to load files correctly from browsers, the server should ensure
     * that data is sent as biary/latin1 so that it can be converted to utf-8 if
     * necessary (see Spec._decode()). Special care must be taken if data is
     * put directly in an utf-8 encoded html page to ensure latin1 codepoints
     * are preserved (buffer.toString('binary') before sending as utf8 in the
     * output stream).
     *
     * For server-side use, data can be passed in as a raw buffer instead and
     * let the implementation do the necessary conversions.
     */
    if (hasBuffer && data instanceof global.Buffer) {
      data = data.toString('binary');
    }
    this._input = data;
    this.reset();
  }
  Tokenizer.prototype = {
    reset: function () {
      this._pos = 0;
      this._state = STATE_START;
      this._depth = 0;
    },
    get: function () {
      var self = this,
          _mem = self._pos,
          _len = 0,
          _state, c, r, tok, esc;
      function state(s) { self._state = s; }
      while(true) {
        _state = self._state
        if (self._pos >= self._input.length) { /* EOF */
          tok = TOK_END;
          break;
        }
        c = self._input[self._pos++];
        if (esc) {
          esc = 0;
          _len++;
          continue;
        }

        tok = TOKENS[c];

        if (_state !== STATE_VALUE && _state !== STATE_PROPNAME && tok === TOK_SPACE) {
          _mem++; /* skip spaces in thoses contexts. */
          continue;
        }

        switch (_state) {
          case STATE_START:
            if (tok === TOK_VARIANT_START) {
              self._depth++;
              state(STATE_VARIANT);
            } else {
              tok = TOK_ERROR;
            }
            break;
          case STATE_VARIANT:
            if (tok === TOK_NODE_START) {
              state(STATE_NODE);
            } else {
              tok = TOK_ERROR;
            }
            break;
          case STATE_VARIANTS:
            switch (tok) {
              case TOK_VARIANT_START:
                self._depth++;
                state(STATE_VARIANT);
                break;
              case TOK_VARIANT_END:
                state((--self._depth) > 0 ? STATE_VARIANTS : STATE_START);
                break;
              default:
                tok = TOK_ERROR;
            }
            break;
          case STATE_NODE:
            switch (tok) {
              case TOK_PROP_CHAR:
                state(STATE_PROPNAME);
                _len++;
                tok = null;
                break;
              case TOK_NODE_START:
              case TOK_VARIANT_START:
              case TOK_VARIANT_END:
                self._pos--;
                state(STATE_NODE_END);
                tok = TOK_NODE_END;
                break;
              default:
                tok = TOK_ERROR;
            }
            break;
          case STATE_NODE_END:
            switch (tok) {
              case TOK_NODE_START:
                state(STATE_NODE);
                break;
              case TOK_VARIANT_START:
                self._depth++;
                state(STATE_VARIANT);
                break;
              case TOK_VARIANT_END:
                state((--self._depth) > 0 ? STATE_VARIANTS : STATE_START);
                break;
              default:
                tok = TOK_UNREACHABLE;
            }
            break;
          case STATE_PROPNAME:
            switch (tok) {
              case TOK_VALUE_START:
                /* we skip spaces, so we roll back only for value_start here */
                self._pos--;
              case TOK_SPACE:
                state(STATE_PROP);
                tok = TOK_PROP_NAME;
                break;
              case TOK_PROP_CHAR:
                _len++;
                tok = null;
                break;
              default:
                tok = TOK_ERROR;
            }
            break;
          case STATE_PROP:
            switch (tok) {
              case TOK_VALUE_START:
                state(STATE_VALUE);
                break;
              default:
                tok = TOK_ERROR;
            }
            break;
          case STATE_VALUE:
            switch (tok) {
              case TOK_VALUE_END:
                self._pos--;
                state(STATE_VALUE_END);
                tok = TOK_VALUE;
                break;
              case TOK_ESCAPE:
                esc = 1;
              default:
                _len++;
                tok = null;
            }
            break;
          case STATE_VALUE_END:
            if (tok !== TOK_VALUE_END) tok = TOK_ERROR;
            state(STATE_VALUES);
            break;
          case STATE_VALUES:
            switch (tok) {
              case TOK_VALUE_START:
                state(STATE_VALUE);
                break;
              case TOK_NODE_START:
              case TOK_VARIANT_START:
              case TOK_VARIANT_END:
                self._pos--;
                state(STATE_NODE_END);
                tok = TOK_NODE_END;
                break;
              case TOK_PROP_CHAR:
                _len++;
                state(STATE_PROPNAME);
                tok = null;
                break;
              default:
                tok = TOK_ERROR;
            }
            break;
          default:
            /* Should not be reachable (debug state only) */
            tok = TOK_UNREACHABLE;
        }
        if (tok != null) break;
      }

      if (tok == TOK_ERROR) _len = 0;
      tok = { token: tok };
      if (_len) tok.value = self._input.substr(_mem, _len);
      return tok;
    },
  };



  function GameTree(nodes, variants) {
    this.nodes = nodes||[];
    this.variants = variants||[];
  }
  GameTree.prototype = {
    Node: Node,
    addNode: function (node) {
      if (node) this.nodes.push(node);
    },
    addVariant: function (gametree) {
      if (gametree && gametree.nodes.length) {
        /* A valid gametree contains at least one node */
        this.variants.push(gametree);
      }
    },
    toSgf: function (spec) {
      if (!spec) return ''; /* missing spec: abort gametree encoding */
      return '('
           + this.nodes.map(function (n) { return spec.nodeToString(n); }).join('')
           + this.variants.map(function (gt) { return gt.toSgf(spec); }).join('')
           + ')';
    },
  };

  function GoSgf(data) {
    this._class = GoSgf; /* for self reference */
    this.clear();
    if (data === true) this.addEmpty();
    else if (typeof data === 'string') this.add(data);
    else if (data && data.nodes) this.collection.push(data);
  }
  GoSgf.prototype = {
    Tokenizer: Tokenizer,
    Spec: Spec,
    GameTree: GameTree,

    clear: function () {
      this.collection = [];
    },
    getBoard: function (i) {
      var gt = this.collection[i||0];
      if (gt) return new (this.Board)(gt);
    },
    add: function (data) {
      var tokenizer = new (this.Tokenizer)(data),
          spec = new (this.Spec)(),
          tok;
      while (true) {
        tok = tokenizer.get();
        if (tok.token === TOK_END) break;
        if (tok.token !== TOK_VARIANT_START) {
          throw new Error("Parser error: unexpected token");
        }
        spec.reset();
        this.collection.push(this._variant(tokenizer, spec));
      }
    },
    addEmpty: function (size) {
      this.add('(;SZ['+(size||19)+'])');
    },
    toSgf: function () {
      var spec = new (this.Spec)();
      return this.collection.map(function (c) { return c.toSgf(spec); }).join('');
    },
    _variant: function (tokenizer, spec) {
      var gametree = new (this.GameTree)(), tok, more = true;

      while (more) {
        tok = tokenizer.get();
        switch (tok.token) {
          case TOK_VARIANT_END:
            more = false;
            break;
          case TOK_NODE_START:
            gametree.addNode(this._node(tokenizer, spec));
            spec.isroot = false;
            break;
          case TOK_VARIANT_START:
            gametree.addVariant(this._variant(tokenizer, spec));
            break;
          default:
            throw new Error("Parser error: unexpected token");
        }
      }
      return gametree;
    },
    _node: function (tokenizer, spec) {
      var node = new (this.GameTree.prototype.Node)(),
          more = true,
          property = null,
          tok;

      while (more) {
        tok = tokenizer.get();
        switch (tok.token) {
          case TOK_NODE_END:
            more = false;
            break;
          case TOK_PROP_NAME:
            property = tok.value;
            break;
          case TOK_VALUE_START:
            if (!(property in node._raw)) {
              node._raw[property] = [];
            }
            node._raw[property].push(this._value(tokenizer));
            break;
          default:
            throw new Error("Parser error: unexpected token");
        }
      }
      spec.validateNode(node);
      return node;
    },
    _value: function (tokenizer) {
      var tok, tokend;
      tok = tokenizer.get();
      tokend = tokenizer.get();
      if (tok.token != TOK_VALUE || tokend.token != TOK_VALUE_END) {
        throw new Error("Parser error: unexpected token");
      }
      return tok.value;
    }
  };



  function Intersection() {
    this.color = NONE;
  }
  Intersection.getColor = function (color) {
    var m;
    if (typeof color === 'string') {
      if ((/^b(?:lack)?$/i).test(color)) return BLACK;
      if ((/^w(?:hite)?$/i).test(color)) return WHITE;
      return NONE;
    }
    color = +color;
    return (color === BLACK ? BLACK : (color === WHITE ? WHITE : NONE));
  };
  Intersection.not = function (color) {
    if (color === undefined) {
      color = (this ? this.color : NONE);
    } else color = Intersection.getColor(color);
    return color === BLACK ? WHITE : (color === WHITE ? BLACK : NONE);
  };
  Intersection.prototype = {
    NONE: NONE,
    BLACK: BLACK,
    WHITE: WHITE,
    getColor: Intersection.getColor,
    not: Intersection.not
  };

  function Nav() { this._init.apply(this, arguments); }
  Nav.prototype = {
    _init: function (gametree, board) {
      this._gametree = gametree;
      this._board = board;
      this._cursor = [0];
    },
    moveTo: function (path) {
      if (!this.get(path)) return false;
      this._cursor = path.slice(0);
      return true;
    },
    moveToRoot: function () { return this.moveTo([0]); },
    _getVariant: function (path) {
      var variant = this._gametree, i,
          path = path || this._cursor;

      for (i = 0; variant && i < path.length - 1; i++) {
        variant = variant.variants[path[i]];
      }

      return [variant, path[i]];
    },
    get: function (path) {
      var variant = this._getVariant(path);
      return variant[0] ? variant[0].nodes[variant[1]] : undefined;
    },
    root: function () {
      return this.get([0]);
    },
    isroot: function () {
      return this._cursor.length === 1 && this._cursor[0] === 0;
    },
    first: function () {
      var c = this._cursor;
      if (c.length === 1 && c[0] === 0) return false;
      this._cursor = [0];
      return true;
    },
    prev: function () {
      var cursor = this._cursor,
          node = cursor[cursor.length - 1] - 1,
          variant;

      if (node < 0) {
        if (cursor.length == 1) return false;
        variant = cursor.slice(0, -2);
        variant.push(0);
        variant = this._getVariant(variant);
        if (!variant[0]) return false;
        cursor.splice(-2, 2, variant[0].nodes.length - 1);
      } else {
        cursor.splice(-1, 1, node);
      }

      return true;
    },
    next: function () {
      var variant = this._getVariant(), node;
      node = variant[1];
      variant = variant[0];
      if (!variant) return false; /* error */

      if (variant.nodes[++node]) {
        this._cursor.splice(-1, 1, node);
      } else if (variant.variants[0]) {
        this._cursor.splice(-1, 1, 0, 0);
      } else {
        return false;
      }

      return true;
    },
    last: function () {
      /* go to the last node through the first variations from the current node */
      var cursor = this._cursor,
          v = this._getVariant(),
          n = v[1],
          variant = v[0];

      if (!variant.variants.length && n === (variant.nodes.length - 1)) {
        return false;
      }
      cursor.pop(); /* pop current node in current variant */
      while (variant.variants.length) {
        cursor.push(0);
        variant = variant.variants[0];
      }
      cursor.push(variant.nodes.length - 1);
      return true;
    },
    variant: function (nvar) {
      var cursor = this._cursor,
          variant = this._getVariant();

      if (arguments.length === 0) {
        return (variant[1] || cursor.length === 1) ? 0 : cursor.slice(-2, 1)[0];
      }

      if (!variant[0] || variant[1]) return false;
      nvar = +nvar;
      if (!(nvar >= 0 && nvar < variant[0].variants.length)) return false;

      cursor[cursor.length - 2] = nvar;
      return true;
    },
    nextVariant: function () {
      var cursor = this._cursor,
          variant = this._getVariant(),
          lvi = cursor.length - 2;

      if (!variant[0] || variant[1]) return false;

      if ((cursor[lvi] + 1) < variant[0].variants.length) {
        cursor[lvi]++;
        return true;
      }
      return false;
    },
    prevVariant: function () {
      var cursor = this._cursor,
          lc = cursor.length;
      if (cursor[lc - 1] || !cursor[lc - 2]) return false;
      cursor[lc - 2]--;
      return true;
    },
    variantsCount: function () {
      var variant = this._getVariant(), l;
      if (!variant[0]) return false;
      l = (variant[0].variants||[]).length;
      return !variant[1] && l > 0 ? l : 1;
    },
    hasVariants: function () {
      return this.variantsCount() > 1;
    },
    _checkNavPath: function (path) {
      if (path._cursor) {
        if (path._gametree !== this._gametree) {
          /* not the same game tree => not a descendant */
          return false;
        }
        return path._cursor;
      } else if (path instanceof Array) {
        /* check the node actually exists */
        if (!this.get(path)) return false;
      } else {
        throw new Error("Instance must be a Nav instance or a path (array of integers).");
      }
      return path;
    },
    _comparePaths: function (path1, path2, _dir) {
      if (path1.length < path2.length) return this._comparePaths(path2, path1, -1);

      for (var i = 0; i < path2.length - 1; i++) {
        if (path1[i] != path2[i]) {
          /* paths not related */
          return undefined;
        }
      }

      if (path1[i] == path2[i]) return 0;

      return (path1.length > path2.length || path1[i] > path2[i])
           ? _dir || 1 : -_dir || -1;
    },
    descendantof: function (path, orSelf) {
      var res;

      path = this._checkNavPath(path);
      if (!path) return false;

      res = this._comparePaths(this._cursor, path);
      if (res === undefined) return false;
      return res > 0 || (orSelf && !res);
    },
    ascendantof: function (path, orSelf) {
      var res;

      path = this._checkNavPath(path);
      if (path) return false;

      res = this._comparePaths(this._cursor, path);
      if (res === undefined) return false;
      return res < 0 || (orSelf && !res);
    },
    relatedto: function (path) {
      path = this._checkNavPath(path);
      if (path === false) return false;
      return this._comprePaths(this._cursor, path) !== undefined;
    },
    length: function () {
      var variant = this._gametree,
          path = this._cursor,
          l = 0, i;

      for (i = 0; variant && i < path.length - 1; i++) {
        l += variant.nodes.length;
        variant = variant.variants[path[i]];
      }

      return l + path[i] + 1;
    },
    copy: function () {
      var nav = new (this._board.Nav)(this._gametree, this._board);
      nav._cursor = this._cursor.slice(0);
      return nav;
    },
    getNodes: function (fromPath) {
      var variant = this._gametree,
          path = this._cursor,
          i, j, nodes = [], fpl;

      if (fromPath) {
        /* check that fromPath is an ascendant path */
        fromPath = this._checkNavPath(fromPath);
        if (!fromPath) return nodes;
        if (!(this._comparePaths(this._cursor, fromPath) > 0)) { // !(undefined>0)==true
          return nodes;
        }
      } else {
        fromPath = [-1]; /* special case to include root node */
      }

      fpl = fromPath.length - 1;

      for (i = 0; variant && i < path.length - 1; i++) {
        if (i < fpl) continue;
        if (i == fpl) {
          merge(nodes, variant.nodes.slice(fromPath[i]+1));
        } else {
          merge(nodes, variant.nodes);
        }
        variant = variant.variants[path[i]];
      }

      return merge(nodes, variant.nodes.slice(i == fpl ? fromPath[i]+1 : 0, path[i] + 1));
    }
  };

  function Rect(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.width = w;
    this.height = h;
  }
  Rect.prototype.toArray = function () {
    return [ this.x, this.y, this.width, this.height ];
  };

  function Board(gametree) {
    this._init(gametree);
  }
  GoSgf.prototype.Board = Board;
  Board.prototype = {
    Rect: Rect,
    Nav: Nav,
    Intersection: Intersection,
    _init: function (gametree) {
      this.setGame(gametree);
      this.lastMoveMark = { last: true };
    },
    get: function (x, y) {
      var self = this;
      if (y !== undefined) x += self._boardsize[0] * y;
      return self._board && self._board[x];
    },
    setGame: function (gametree) {
      var self = this, nav;
      self.nav = new (self.Nav)(gametree, self);
      self.clearBoard();
    },
    clearBoard: function () {
      var self = this,
          sz = self._boardsize = self.nav.root().SZ || [19,19],
          board = self._board = [],
          i;
      sz = sz[0] * sz[1];
      for (i = 0; i < sz; i++) board.push(new self.Intersection());
      self._hidden = [];
      self._renderedNav = null;
      self.lastmove = null;
      self._captured = [0, 0, 0];
      self.nextplayer = BLACK;
      self.infos = {};
    },
    _checkCaptured: function (m0) {
      var self = this,
          size = self._boardsize,
          board = self._board,
          sx = size[0],
          sy = size[1],
          sz = sx * sy,
          x0 = m0.x,
          y0 = m0.y,
          itn0 = board[x0 + y0 * sx],
          checkColor, _merge, libs, check, handled,
          c, itn, ck, i, j;

      if (itn0.color === NONE) return;

      checkColor = itn0.not();
      _merge = [{0:0},{1:1},{2:2},{3:3}];
      libs = [];
      check = [
        {x:x0, y: y0-1, g: 0},
        {x:x0 - 1, y: y0, g: 1},
        {x:x0, y: y0 + 1, g: 2},
        {x:x0 + 1, y: y0, g: 3}
      ];
      /* initialize check state of intersections */
      for (i = 0; i < board.length; i++) {
        delete board[i]._check;
      }

      while ((c = check.pop())) {
        if (libs[c.g]) continue;
        if (c.x < 0 || c.x >= sx || c.y < 0 || c.y >= sy) continue;
        itn = board[c.x + c.y * sx];
        if (itn.color === NONE) {
          libs[c.g] = true;
          continue;
        } else if (itn.color === checkColor) {
          ck = itn._check;
          if (ck === undefined) {
            itn._check = c.g;
            check.push({x: c.x, y: c.y - 1, g: c.g});
            check.push({x: c.x - 1, y: c.y, g: c.g});
            check.push({x: c.x, y: c.y + 1, g: c.g});
            check.push({x: c.x + 1, y: c.y, g: c.g});
          } else if (ck !== c.g) {
            extend(_merge[c.g], _merge[ck]);
            extend(_merge[ck], _merge[c.g]);
            if (libs[c.g] || libs[ck]) {
              eachKey(_merge[c.g], function (k, g) {
                libs[g] = libs[c.g] || libs[ck];
              });
            }
          }
        }
      }
      handled = {}
      for (i = 0; i < 4; i++) {
        if (i in handled || libs[i]) continue;
        for (j = 0; j < board.length; j++) {
          itn = board[j];
          if (itn._check in _merge[i]) {
            self._captured[checkColor]++;
            itn.color = NONE;
          }
        }
        extend(handled, _merge[i]);
      }
    },
    capturedBy: function (color) {
      if (!this._captured) return 0;
      return this._captured[this.Intersection.prototype.not(color)];
    },
    updateVisible: function (node) {
      var self = this, i, p, flags = [],
          w = self._boardsize[0],
          board = self._board;

      if (!('VW' in node)) return;

      self._VW = node.VW; /* save the active VW property */

      for (i = 0; i < board.length; i++) {
        delete board[i].hidden;
      }

      if (!node.VW.length) return;

      for (i = 0; i < board.length; i++) {
        board[i].hidden = true;
      }
      for (i = 0; i < node.VW.length; i++) {
        p = node.VW[i];
        delete board[p.x + w * p.y].hidden;
      }
    },
    visibleBox: function () {
      var self = this,
          w = self._boardsize[0],
          h = self._boardsize[1],
          mx = w, my = h,
          Mx = 0, My = 0,
          i, j;

      for (j = 0; j < h; j++) {
        for (i = 0; i < w; i++) {
          if (!self._board[i + j * w].hidden) {
            mx = min(mx, i);
            Mx = max(Mx, i);
            my = min(my, j);
            My = max(My, j);
          }
        }
      }

      return new self.Rect(x, y, Mx - mx + 1, My - my + 1);
    },
    MARKS: [
      {p: 'DD', mark: { dimmed: true }},
      {p: 'LB', mark: {}, composed: true}, /* special case */
      /* following marks are mutually exclusive */
      {p: 'CR', mark: { type: 'circle' }},
      {p: 'MA', mark: { type: 'cross' }},
      {p: 'SL', mark: { type: 'selected' }},
      {p: 'SQ', mark: { type: 'square' }},
      {p: 'TR', mark: { type: 'triangle' }}
    ],
    updateMarks: function (node) {
      var self = this,
          board = self._board,
          w = self._boardsize[0],
          len = board.length,
          lm = self.lastmove,
          i;

      for (i = 0; i < len; i++) {
        delete board[i].mark;
        if (lm && (lm.x + w * lm.y) == i) {
          board[i].mark = extend({}, self.lastMoveMark);
        }
      }

      each(self.MARKS, function (def) {
        each(node[def.p]||[], function (point) {
          var value = {}, i;
          if (def.composed) {
            value = { label: point.second };
            point = point.first;
          }
          i = point.x + w * point.y;
          if (i < 0 || i > len) return;
          board[i].mark = extend(board[i].mark||{}, value, def.mark);
        });
      });
    },
    INFO_PROPERTIES: [
      {p: 'AN', k: 'annotator'},
      {p: 'BR', k: 'blackrank'},
      {p: 'BT', k: 'blackteam'},
      {p: 'CP', k: 'copy'},
      {p: 'DT', k: 'date'},
      {p: 'EV', k: 'event'},
      {p: 'GC', k: 'gamecomment'},
      {p: 'ON', k: 'opening'},
      {p: 'OT', k: 'overtime'},
      {p: 'PB', k: 'blackplayer'},
      {p: 'PC', k: 'location'},
      {p: 'PW', k: 'whiteplayer'},
      {p: 'RE', k: 'result'},
      {p: 'RO', k: 'round'},
      {p: 'RU', k: 'rules'},
      {p: 'SO', k: 'source'},
      {p: 'TM', k: 'maintime'},
      {p: 'US', k: 'user'},
      {p: 'WR', k: 'whiterank'},
      {p: 'WT', k: 'whiteteam'},
      {p: 'C', k: 'nodecomment', clear: 1},
      {p: 'BL', k: 'blacktimeleft', clear: 1},
      {p: 'OB', k: 'blackmovesleft', clear: 1},
      {p: 'OW', k: 'whitemovesleft', clear: 1},
      {p: 'WL', k: 'whitetimeleft', clear: 1}
    ],
    updateInfos: function (node) {
      var infos = this.infos;
      each(this.INFO_PROPERTIES, function (def) {
        if (def.clear) delete infos[def.k];
        if (def.p in node) {
          infos[def.k] = node[def.p];
        }
      })
    },
    _renderNode: function (node, isroot) {
      /* Assume the rendered board state is that of the previous node in the
       * tree. */
      var self = this,
          board = this._board,
          w = self._boardsize[0],
          len = board.length,
          setup = [],
          move, moveItn;

      each([
        {p: 'AB', c: BLACK},
        {p: 'AW', c: WHITE},
        {p: 'AE', c: NONE}
      ], function (set) {
        var color = set.c, i, itn;
        set = node[set.p]||[];
        for (i = 0; i < set.length; i++) {
          itn = set[i].x + set[i].y * w;
          /* ignore points out of bound and points already setup in previous
           * sets */
          if (itn < 0 || itn >= len || setup[itn]) continue;
          board[itn].color = color;
          setup[itn] = 1;
        }
      });

      each([
        {p: 'B', c: BLACK},
        {p: 'W', c: WHITE}
      ], function (m) {
        var itn;
        if (move) return; /* cannot set both players moves */
        if (m.p in node) {
          move = node[m.p];
          itn = move.x + move.y * w;
          if (itn < 0 || itn >= len || board[itn].color !== NONE) {
            move = {error: "Illegal move"};
            return;
          }
          moveItn = board[itn];
          moveItn.color = m.c;

          setup[itn] = 1;
        }
      });

      if (move) {
        if (move.error) return false;
        self._checkCaptured(move);
      }
      self.lastmove = move;

      if ('PL' in node) {
        self.nextplayer = node.PL;
      } else if (moveItn && moveItn.color !== NONE) {
        self.nextplayer = moveItn.not();
      }

      self.updateVisible(node);
      self.updateInfos(node);

      return true;
    },
    render: function () {
      var self = this, isroot = true, nodes;

      if (self._renderedNav) {
        if (self.nav.descendantof(self._renderedNav, true)) {
          isroot = false;
        } else {
          self.clearBoard();
        }
      }
      nodes = self.nav.getNodes(self._renderedNav);
      try {
        each(nodes, function (n) {
          if (!self._renderNode(n, isroot)) {
            var e = new Error("Illegal move detected!");
            e.___illegal = true;
            throw e;
          }
          isroot = false;
        });
      } catch (e) {
        if (e.___illegal) {
          self._renderedNav = null;
          return false;
        }
        throw e;
      }
      self.updateMarks(self.nav.get());
      self._renderedNav = self.nav.copy();
      return true;
    },
    renderNext: function (variant) {
      if (!this.nav.next()) return false;
      this.nav.variant(variant);
      return this.render();
    },
    getFlatSgf: function () {
      /* Create a GoSgf object with data flattened to root node */
      var self = this,
          node = new (GameTree.prototype.Node)(),
          sz = self._boardsize,
          board = self._board,
          SpecProto = Spec.prototype,
          itn, i, j, p, mark, label, props, hasHidden, vw = [];

      node.FF = 4; /* spec version */
      node.CA = 'utf8';
      node.GM = 1; /* game mode (1 = Go) */
      node.SZ = sz;
      each(self.INFO_PROPERTIES, function (def) {
        if (def.k in self.infos) node[def.p] = self.infos[def.k];
      });

      for (j = 0; j < sz[1]; j++) {
        for (i = 0; i < sz[0]; i++) {
          itn = board[i + sz[0] * j];
          props = [];
          label = null;
          p = new (SpecProto.Point)(i, j);
          mark = itn.mark;
          if (itn.color !== NONE) {
            props.push({k: itn.color === BLACK ? 'AB' : 'AW', v: p});
          }
          if (mark) {
            each(self.MARKS, function (def) {
              if (def.mark.dimmed && mark.dimmed) {
                props.push({k: def.p, v: p});
              } else if (def.composed && mark.label) {
                props.push({k: def.p, v: new (SpecProto.Composed)(p, mark.label)});
              } else if (def.mark.type == mark.type) {
                props.push({k: def.p, v: p});
              }
            });
          }
          each(props, function (prop) {
            if (!(prop.k in node)) node[prop.k] = [];
            node[prop.k].push(prop.v);
          });

          if (itn.hidden) hasHidden = true;
          else vw.push(p);
        }
      }
      if (hasHidden) node.VW = vw; /* board partially visible */
      return new GoSgf(new GameTree([node]));
    },
    toggleState: function (x, y, target) {
      /* note: This is a quick editing tool that doesn't modify the underlying
       * gametree. Rendering the board again will clear the modifications.
       * one can use getFlatSgf() to save the state of the board as a
       * single-node gametree after toggleState() is called.
       *
       * target = {
       *  color: BLACK|WHITE|NONE, // optional
       *  mark: { ... }
       * }
       */
      var itn = this._board[x + this._boardsize[0] * y],
          orig = {},
          c, mark;

      this._renderedNav = null; /* no more nav sync at this point. */

      if ('color' in target) {
        orig.color = itn.color;
        c = itn.getColor(target.color);
        itn.color = (itn.color !== NONE) ? NONE : c;
      }
      if ('hidden' in target) {
        orig.hidden = itn.hidden;
        itn.hidden = (itn.hidden && target.hidden) ? false : !!target.hidden;
        if (!itn.hidden) delete itn.hidden;
      }
      mark = target.mark;
      if (mark) {
        if (!itn.mark) itn.mark = {};
        orig.mark = {};
        if (mark.type) {
          orig.mark.type = itn.mark.type;
          if (itn.mark.type === mark.type) {
            delete itn.mark.type;
          } else {
            itn.mark.type = mark.type;
          }
        }
        if (mark.label) {
          orig.mark.label = itn.mark.label;
          if (itn.mark.label) {
            delete itn.mark.label
          } else {
            itn.mark.label = mark.label;
          }
        }
        if (mark.dimmed) {
          orig.mark.dimmed = itn.mark.dimmed;
          if (itm.mark.dimmed) {
            delete itn.mark.dimmed;
          } else {
            itn.mark.dimmed
          }
        }
        if (!Object.keys(itn.mark).length) delete itn.mark;
      }
      /* return removed properties to allow post-change inspection */
      return orig;
    },
    toggleMove: function (x, y, color) {
      return this.toggleState(x, y, { color: color });
    },
    toggleMark: function (x, y, type, label) {
      var state;

      if (typeof type === boolean) {
        state = { dimmed: true };
      } else if (type === 'label') {
        state = { label: label||'' };
      } else {
        state = { type: type };
      }

      return this.toggleState(x, y, state);
    },
    toggleHidden: function (x, y) {
      return this.toggleState(x, y, { hidden: true });
    }
  }

  return GoSgf;
});
