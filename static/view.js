(function (root, factory) {
  var modname = '';

  if (typeof define === 'function' && define.amd) {
    define(modname.toLowerCase(), ['jquery', 'gosgfviewer'], function () {
      return (root[modname] = factory.apply(root, arguments));
    });
  } else {
    root[modname] = factory.apply(root, [root.jQuery, root.GoSgf]);
    if (typeof module === 'object' && module.exports) module.exports = root[modname];
  }
})(typeof window !== 'undefined' ? window : this.window, function ($, GoSgf, undefined) {
  "use strict";

  var win = this;
  if (!win) {
    /* a window object must be defined, either implicit in browsers
     * or explicit for server-side use */
    throw new Error("A window object is required");
  }
  /* for IE10- that defines console only in dev mode,
   * breaking code that tries to use it. */
  if (!win.console) win.console = { error: function () {} };

  var Iproto = GoSgf.prototype.Board.prototype.Intersection.prototype,
      BLACK = Iproto.BLACK,
      WHITE = Iproto.WHITE,
      NONE = Iproto.NONE,
      not = Iproto.not;

  $.fn.goView = function (board, controls, toggle, loading) {
    var view = this.length ? this : $('body'),
        ctrl_dw, ctrl_dh,
        wrap, svg, _board, ratio;

    if (!this.is('body')) throw new Error("body container support only");

    board = $(board);
    controls = $(controls);
    toggle = $(toggle);
    loading = $(loading);

    if (!board.length || !controls.length) throw new Error("board or controls missing");

    function sv() { return board.goSgfViewer.apply(board, arguments); }
    sv();
    wrap = board.children();

    var cfind = controls.find.bind(controls),
        title = cfind('.go-sgf-title'),
        urlLink = cfind('.go-sgf-link'),
        result = cfind('.go-sgf-result'),
        whitePris = cfind('.go-sgf-white-prisonners'),
        whiteName = cfind('.go-sgf-white-name'),
        blackPris = cfind('.go-sgf-black-prisonners'),
        blackName = cfind('.go-sgf-black-name'),
        comment = cfind('.go-sgf-comment'),
        history = cfind('.go-sgf-history'),
        storage, store,
        buttons = {},
        overlays = {};

    function render() {
      var infos, rank;
      if (_board) {
        infos = _board.infos;
        _board.render();
        title.text(infos.event||'-');
        result.text(infos.result||'');
        result.toggle(!!infos.result);
        if (comment.length) {
          comment.val(infos.nodecomment||'');
          /* comm.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); */
          /* comment.html(comm.replace(/\\n/g, '<br/>')); */
        }
        whitePris.text(_board.capturedBy(WHITE));
        rank = infos.whiterank;
        whiteName.text((infos.whiteplayer||'White')+(rank?' ['+rank+']':''));
        blackPris.text(_board.capturedBy(BLACK));
        rank = infos.blackrank;
        blackName.text((infos.blackplayer||'Black')+(rank?' ['+rank+']':''));
        sv('redraw');
      } else {
        title.text('-');
        whitePris.text(0);
        whiteName.text('White');
        blackPris.text(0);
        blackName.text('Black');
      }
      svg = wrap.children('svg')[0];
    }

    function setData(data) {
      loading.fadeOut();
      sv('sgfData', data);
      _board = sv('board');
      /* default is to drawa redish outline on the stone
       * instead, we draw a circle mark here (can be overridden by another mark)
       */
      _board.lastMoveMark = {
        last: true,
        ignorelaststyle: true,
        type: 'circle'
      };
      render();
      $(win).trigger('resize');
    }

    var _toggle = function () {};
    cfind('.go-sgf-nav button').each(function () {
      var btn = $(this),
          action = btn.data('action'),
          tm;
      if (!action) return;
      switch (action) {
        case 'toggle':
          _toggle = function (play) {
            var off = btn.find(btn.data('off')),
                on = btn.find(btn.data('on')),
                info = $(btn.data('state-info'))

            off.toggle(!play);
            on.toggle(!!play);
            btn.data('toggle-state', play ? 'on' : 'off');
            info.text(play ? 'playing' : 'paused');
            if (play) {
              _step(true);
            } else if (tm) {
              clearTimeout(tm);
              tm = null;
            }
          }
          function _step(init) {
            var delay = +$(btn.data('timeout-src')).val();
            if (!(delay > 0)) src.val(delay = 1);
            if (init || _board.nav.next()) {
              render();
              if (_board.nav.next()) { /* XXX need Nav.isLast() */
                _board.nav.prev();
                tm = setTimeout(_step, 1000 * delay);
                return;
              }
            }
            tm = null;
            _toggle(false);
          }
          btn.on('click', function () {
            var state = btn.data('toggle-state')||'off';
            _toggle(state === 'off');
          });
          break;
        case 'first':
        case 'prev':
        case 'next':
        case 'last':
          btn.on('click', function () {
            _toggle(false); /* turn off auto playback */
            if (_board.nav[action]()) render();
          });
      }
    });

    var KBD_ACTIONS = {
      '32': _toggle, /* space */
      '33': 'first', /* page up */
      '34': 'last', /* page down */
      '37': 'prev', /* left */
      '39': 'next' /* right */
    };
    $(document).on('keydown', function (evt) {
      var action = KBD_ACTIONS[evt.which];
      if (evt.target.tagName == 'INPUT') return;
      if (typeof action === 'string') {
        if (_board && _board.nav[action]()) render();
      } else if (typeof action === 'function') {
        action();
      }
    });

    cfind('.go-sgf-loader').each(function (evt) {
      var btn = $(this),
          form = $(btn.data('form')), reader, overlay;

      overlay = form.data('overlay');
      if (!(overlay in overlays)) {
        overlays[overlay] = $();
        $(overlay).on('click', function (evt) {
          if (evt.target === this) {
            evt.preventDefault();
            evt.stopPropagation();
            overlays[overlay].fadeOut();
            $(this).fadeOut();
          }
        }).hide();
      }
      overlays[overlay] = overlays[overlay].add(form.get(0));

      switch (form.data('type')) {
        case 'url':
          form.on('submit', function (evt) {
            var url;
            evt.preventDefault();
            evt.stopPropagation();
            url = form.find('input[type="url"]').val().replace(/^ +| +$/g, '');
            form.fadeOut();
            $(overlay).fadeOut();
            url = '#url='+encodeURIComponent(url);
            if (url !== win.location.hash) {
              loading.fadeIn();
              setTimeout(function () {
                win.location.hash = url;
              }, 0);
            }
          });
          break;
        case 'file':
          if (!window.FileReader) {
            btn.hide();
            form.hide();
            return;
          }
          reader = new window.FileReader();
          reader.onabort = function () {};
          reader.onerror = function () {
            loading.fadeOut();
            console.error("Failed to read file");
          };
          reader.onload = function () {
            var res = encodeURIComponent(reader.result.replace(/[\r\n]+/g, ''));
            res = '#data='+res;
            if (win.location.hash === res) {
              loading.fadeOut();
            } else {
              win.location.hash = res;
            }
          };
          form.on('submit', function (evt) {
            form.fadeOut();
            $(overlay).fadeOut();
            evt.preventDefault();
            evt.stopPropagation();
          }).find('input[type="file"]').on('change', function (evt) {
            form.fadeOut();
            $(overlay).fadeOut();
            reader.abort();
            if (!evt.target.files.length) {
              loading.fadeOut();
              return;
            }
            loading.fadeIn();
            reader.readAsText(evt.target.files[0], 'latin1');
          });
      }

      btn.on('click', function (evt) {
        overlays[overlay].not(form).fadeOut();
        form.fadeIn();
        $(overlay).fadeIn();
      });
    });

    if (typeof Storage !== 'undefined') {
      history.show();
      if (history.length && !history.children('ul').length) {
        history.append('<ul/>');
      }

      store = function (hash) {
        var i, h = localStorage.history || '[]';

        try {
          h = JSON.parse(h) || [];
        } catch (e) { h = []; }

        if (hash) {
          for (i = 0; i < h.length; i++) {
            if (h[i] == hash) {
              h.splice(i, 1);
              break;
            }
          }
          h.unshift(hash);
          h = h.slice(0, 10); /* keep last 10 opened files only */
          localStorage.history = JSON.stringify(h);
        }

        /* now refresh history list */
        history.children('ul').each(function () {
          var i, ul = $(this), li, a, m;
          ul.empty();
          for (i = 0; i < h.length; i++) {
            m = h[i].match(/^#(url|data)=(.+)$/);
            if (!m) continue; /* skip weird cases that should not occur */
            li = $('<li/>').appendTo(ul);
            a = $('<a/>', { href: h[i] }).appendTo(li);
            if (m[1] == 'url') {
              a.text(decodeURIComponent(m[2]));
            } else {
              a.text('-- local file --');
            }
          }
        });
      };

      store(); /* init history */
    } else {
      store = function () {}; /* noop when Local data not supported */
      history.hide();
    }


    toggle.on('click', function (evt) {
      var expanded, css;
      toggle.toggleClass('go-sgf-expanded');
      expanded = toggle.hasClass('go-sgf-expanded');
      css = {
        'left': ratio >= 1.0 ? board.innerWidth() - (expanded?ctrl_dw:0) : '',
        'top': ratio < 1.0 ? board.innerHeight() - (expanded?ctrl_dh:0) : ''
      };
      controls.add(toggle).css(css);
    });

    $(win).on('resize', function () {
      var w = $(win).width(), h = $(win).height();
      ratio = w / h;

      /* XXX sizing hack because of a bug that doesn't dynamically resize
       * the parent block for implicit dimensions off the svg on window
       * resize. */
      wrap.css({'width': '', 'height': ''});
      if (svg.clientWidth && ratio >= 1.0) {
        wrap.width(svg.clientWidth);
      } else if (svg.clientHeight && ratio < 1.0) {
        wrap.height(svg.clientHeight);
      }

      ctrl_dw = w - board.innerWidth(),
      ctrl_dh = h - board.innerHeight();
      controls.css({
        'top': ratio >= 1.0 ? 0 : board.innerHeight(),
        'left': ratio >= 1.0 ? board.innerWidth(): 0,
        'width': '',
        'height': ''
      });

      if (ratio >= 1.0) controls.innerWidth(ctrl_dw);
      /* if (ratio < 1.0) controls.innerHeight(ctrl_dh); */
      ctrl_dw = controls.innerWidth() - ctrl_dw;
      ctrl_dh = controls.innerHeight() - ctrl_dh;

      toggle.removeClass('go-sgf-expanded').css({
        'top': ratio >= 1.0 ? '' : board.innerHeight(),
        'left': ratio >= 1.0 ? board.innerWidth() : ''
      }).toggle( ratio >= 1.0 && ctrl_dw > 0 || ratio < 1.0 && ctrl_dh > 0);

    }).on('hashchange', function (evt) {
      var hash = win.location.hash,
          url = (hash.match(/^#url=(.*)$/)||[])[1],
          data = (hash.match(/^#data=(.*)$/)||[])[1];

      if (url && win.GOSGF_FETCH) {
        url = decodeURIComponent(url);
        if (!_board) setData(); /* page was just loaded. Load empty board */
        urlLink.attr({href:url}).text(url).show();
        $.get(win.GOSGF_FETCH, { url: url }, function (_data) {
          setData(_data);
          store(hash);
        }).fail(function () {
          urllink.hide();
          loading.fadeOut();
          console.error("Invalid url");
        });
        return;
      } else if (hash == '#test') {
        data = '(;SZ[11:11]EV[Test]RE[?]'
             + 'AB[ca:ch]AW[da:dh]'
             + 'CR[ab:eb]LB[hb:CR]'
             + 'MA[ac:ec]LB[hc:MA]'
             + 'SL[ad:ed]LB[hd:SL]'
             + 'SQ[ae:ee]LB[he:SQ]'
             + 'TR[af:ef]LB[hf:TR]'
             + 'LB[ah:A]LB[bh:B]LB[ch:C]LB[dh:D]LB[eh:E]'
             + 'LB[ai::)]LB[bi::|]LB[ci::(]LB[di::x]LB[ei::3]'
             + 'VW[aa:af][ah:aj][ca:if][ch:ij]'
             + 'DD[ea:ei]'
             + 'C[Sgf test. [escaped\\] \\\n(this is on the same line)\nNew line.]'
             + 'PL[W]'
             + ')';
      } else {
        data = decodeURIComponent(data||'');
      }
      setTimeout(function () {
        setData(data);
        if (data && /^#data=/.test(hash)) store(hash);
        urlLink.hide();
      }, 0);
    }).trigger('hashchange');
  };

  $(function () { /* auto detect */
    $('.go-sgf-view').each(function () {
      var viewer = $(this),
          bd = viewer.find('.go-sgf-board:eq(0)'),
          ctrl = viewer.find('.go-sgf-controls:eq(0)'),
          toggle = viewer.find('.go-sgf-ctrl-toggle:eq(0)'),
          loader = viewer.find('.go-sgf-loading:eq(0)');
      viewer.goView(bd, ctrl, toggle, loader);
    });
  });
});
