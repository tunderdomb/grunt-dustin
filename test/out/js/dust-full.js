/*! Dust - Asynchronous Templating - v2.3.4
* http://linkedin.github.io/dustjs/
* Copyright (c) 2014 Aleksander Williams; Released under the MIT License */
(function(root) {
  var dust = {},
      NONE = 'NONE',
      ERROR = 'ERROR',
      WARN = 'WARN',
      INFO = 'INFO',
      DEBUG = 'DEBUG',
      loggingLevels = [DEBUG, INFO, WARN, ERROR, NONE],
      EMPTY_FUNC = function() {},
      logger = {},
      originalLog,
      loggerContext;

  dust.debugLevel = NONE;
  dust.silenceErrors = false;

  // Try to find the console in global scope
  if (root && root.console && root.console.log) {
    loggerContext = root.console;
    originalLog = root.console.log;
  }

  // robust logger for node.js, modern browsers, and IE <= 9.
  logger.log = loggerContext ? function() {
      // Do this for normal browsers
      if (typeof originalLog === 'function') {
        logger.log = function() {
          originalLog.apply(loggerContext, arguments);
        };
      } else {
        // Do this for IE <= 9
        logger.log = function() {
          var message = Array.prototype.slice.apply(arguments).join(' ');
          originalLog(message);
        };
      }
      logger.log.apply(this, arguments);
  } : function() { /* no op */ };

  /**
   * If dust.isDebug is true, Log dust debug statements, info statements, warning statements, and errors.
   * This default implementation will print to the console if it exists.
   * @param {String|Error} message the message to print/throw
   * @param {String} type the severity of the message(ERROR, WARN, INFO, or DEBUG)
   * @public
   */
  dust.log = function(message, type) {
    if(dust.isDebug && dust.debugLevel === NONE) {
      logger.log('[!!!DEPRECATION WARNING!!!]: dust.isDebug is deprecated.  Set dust.debugLevel instead to the level of logging you want ["debug","info","warn","error","none"]');
      dust.debugLevel = INFO;
    }

    type = type || INFO;
    if (dust.indexInArray(loggingLevels, type) >= dust.indexInArray(loggingLevels, dust.debugLevel)) {
      if(!dust.logQueue) {
        dust.logQueue = [];
      }
      dust.logQueue.push({message: message, type: type});
      logger.log('[DUST ' + type + ']: ' + message);
    }

    if (!dust.silenceErrors && type === ERROR) {
      if (typeof message === 'string') {
        throw new Error(message);
      } else {
        throw message;
      }
    }
  };

  /**
   * If debugging is turned on(dust.isDebug=true) log the error message and throw it.
   * Otherwise try to keep rendering.  This is useful to fail hard in dev mode, but keep rendering in production.
   * @param {Error} error the error message to throw
   * @param {Object} chunk the chunk the error was thrown from
   * @public
   */
  dust.onError = function(error, chunk) {
    logger.log('[!!!DEPRECATION WARNING!!!]: dust.onError will no longer return a chunk object.');
    dust.log(error.message || error, ERROR);
    if(!dust.silenceErrors) {
      throw error;
    } else {
      return chunk;
    }
  };

  dust.helpers = {};

  dust.cache = {};

  dust.register = function(name, tmpl) {
    if (!name) {
      return;
    }
    dust.cache[name] = tmpl;
  };

  dust.render = function(name, context, callback) {
    var chunk = new Stub(callback).head;
    try {
      dust.load(name, chunk, Context.wrap(context, name)).end();
    } catch (err) {
      dust.log(err, ERROR);
    }
  };

  dust.stream = function(name, context) {
    var stream = new Stream();
    dust.nextTick(function() {
      try {
        dust.load(name, stream.head, Context.wrap(context, name)).end();
      } catch (err) {
        dust.log(err, ERROR);
      }
    });
    return stream;
  };

  dust.renderSource = function(source, context, callback) {
    return dust.compileFn(source)(context, callback);
  };

  dust.compileFn = function(source, name) {
    // name is optional. When name is not provided the template can only be rendered using the callable returned by this function.
    // If a name is provided the compiled template can also be rendered by name.
    name = name || null;
    var tmpl = dust.loadSource(dust.compile(source, name));
    return function(context, callback) {
      var master = callback ? new Stub(callback) : new Stream();
      dust.nextTick(function() {
        if(typeof tmpl === 'function') {
          tmpl(master.head, Context.wrap(context, name)).end();
        }
        else {
          dust.log(new Error('Template [' + name + '] cannot be resolved to a Dust function'), ERROR);
        }
      });
      return master;
    };
  };

  dust.load = function(name, chunk, context) {
    var tmpl = dust.cache[name];
    if (tmpl) {
      return tmpl(chunk, context);
    } else {
      if (dust.onLoad) {
        return chunk.map(function(chunk) {
          dust.onLoad(name, function(err, src) {
            if (err) {
              return chunk.setError(err);
            }
            if (!dust.cache[name]) {
              dust.loadSource(dust.compile(src, name));
            }
            dust.cache[name](chunk, context).end();
          });
        });
      }
      return chunk.setError(new Error('Template Not Found: ' + name));
    }
  };

  dust.loadSource = function(source, path) {
    return eval(source);
  };

  if (Array.isArray) {
    dust.isArray = Array.isArray;
  } else {
    dust.isArray = function(arr) {
      return Object.prototype.toString.call(arr) === '[object Array]';
    };
  }

  // indexOf shim for arrays for IE <= 8
  // source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/indexOf
  dust.indexInArray = function(arr, item, fromIndex) {
    fromIndex = +fromIndex || 0;
    if (Array.prototype.indexOf) {
      return arr.indexOf(item, fromIndex);
    } else {
    if ( arr === undefined || arr === null ) {
      throw new TypeError( 'cannot call method "indexOf" of null' );
    }

    var length = arr.length; // Hack to convert object.length to a UInt32

    if (Math.abs(fromIndex) === Infinity) {
      fromIndex = 0;
    }

    if (fromIndex < 0) {
      fromIndex += length;
      if (fromIndex < 0) {
        fromIndex = 0;
      }
    }

    for (;fromIndex < length; fromIndex++) {
      if (arr[fromIndex] === item) {
        return fromIndex;
      }
    }

    return -1;
    }
  };

  dust.nextTick = (function() {
    return function(callback) {
      setTimeout(callback,0);
    };
  } )();

  dust.isEmpty = function(value) {
    if (dust.isArray(value) && !value.length) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return (!value);
  };

  // apply the filter chain and return the output string
  dust.filter = function(string, auto, filters) {
    if (filters) {
      for (var i=0, len=filters.length; i<len; i++) {
        var name = filters[i];
        if (name === 's') {
          auto = null;
          dust.log('Using unescape filter on [' + string + ']', DEBUG);
        }
        else if (typeof dust.filters[name] === 'function') {
          string = dust.filters[name](string);
        }
        else {
          dust.log('Invalid filter [' + name + ']', WARN);
        }
      }
    }
    // by default always apply the h filter, unless asked to unescape with |s
    if (auto) {
      string = dust.filters[auto](string);
    }
    return string;
  };

  dust.filters = {
    h: function(value) { return dust.escapeHtml(value); },
    j: function(value) { return dust.escapeJs(value); },
    u: encodeURI,
    uc: encodeURIComponent,
    js: function(value) {
      if (!JSON) {
        dust.log('JSON is undefined.  JSON stringify has not been used on [' + value + ']', WARN);
        return value;
      } else {
        return JSON.stringify(value);
      }
    },
    jp: function(value) {
      if (!JSON) {dust.log('JSON is undefined.  JSON parse has not been used on [' + value + ']', WARN);
        return value;
      } else {
        return JSON.parse(value);
      }
    }
  };

  function Context(stack, global, blocks, templateName) {
    this.stack  = stack;
    this.global = global;
    this.blocks = blocks;
    this.templateName = templateName;
  }

  dust.makeBase = function(global) {
    return new Context(new Stack(), global);
  };

  Context.wrap = function(context, name) {
    if (context instanceof Context) {
      return context;
    }
    return new Context(new Stack(context), {}, null, name);
  };

  /**
   * Public API for getting a value from the context.
   * @method get
   * @param {string|array} path The path to the value. Supported formats are:
   * 'key'
   * 'path.to.key'
   * '.path.to.key'
   * ['path', 'to', 'key']
   * ['key']
   * @param {boolean} [cur=false] Boolean which determines if the search should be limited to the
   * current context (true), or if get should search in parent contexts as well (false).
   * @public
   * @returns {string|object}
   */
  Context.prototype.get = function(path, cur) {
    if (typeof path === 'string') {
      if (path[0] === '.') {
        cur = true;
        path = path.substr(1);
      }
      path = path.split('.');
    }
    return this._get(cur, path);
  };

  /**
   * Get a value from the context
   * @method _get
   * @param {boolean} cur Get only from the current context
   * @param {array} down An array of each step in the path
   * @private
   * @return {string | object}
   */
  Context.prototype._get = function(cur, down) {
    var ctx = this.stack,
        i = 1,
        value, first, len, ctxThis;
    dust.log('Searching for reference [{' + down.join('.') + '}] in template [' + this.getTemplateName() + ']', DEBUG);
    first = down[0];
    len = down.length;

    if (cur && len === 0) {
      ctxThis = ctx;
      ctx = ctx.head;
    } else {
      if (!cur) {
        // Search up the stack for the first value
        while (ctx) {
          if (ctx.isObject) {
            ctxThis = ctx.head;
            value = ctx.head[first];
            if (value !== undefined) {
              break;
            }
          }
          ctx = ctx.tail;
        }

        if (value !== undefined) {
          ctx = value;
        } else {
          ctx = this.global ? this.global[first] : undefined;
        }
      } else if (ctx) {
        // if scope is limited by a leading dot, don't search up the tree
        if(ctx.head) {
          ctx = ctx.head[first];
        } else {
          //context's head is empty, value we are searching for is not defined
          ctx = undefined;
        }
      }

      while (ctx && i < len) {
        ctxThis = ctx;
        ctx = ctx[down[i]];
        i++;
      }
    }

    // Return the ctx or a function wrapping the application of the context.
    if (typeof ctx === 'function') {
      var fn = function() {
        try {
          return ctx.apply(ctxThis, arguments);
        } catch (err) {
          return dust.log(err, ERROR);
        }
      };
      fn.isFunction = true;
      return fn;
    } else {
      if (ctx === undefined) {
        dust.log('Cannot find the value for reference [{' + down.join('.') + '}] in template [' + this.getTemplateName() + ']');
      }
      return ctx;
    }
  };

  Context.prototype.getPath = function(cur, down) {
    return this._get(cur, down);
  };

  Context.prototype.push = function(head, idx, len) {
    return new Context(new Stack(head, this.stack, idx, len), this.global, this.blocks, this.getTemplateName());
  };

  Context.prototype.rebase = function(head) {
    return new Context(new Stack(head), this.global, this.blocks, this.getTemplateName());
  };

  Context.prototype.current = function() {
    return this.stack.head;
  };

  Context.prototype.getBlock = function(key, chk, ctx) {
    if (typeof key === 'function') {
      var tempChk = new Chunk();
      key = key(tempChk, this).data.join('');
    }

    var blocks = this.blocks;

    if (!blocks) {
      dust.log('No blocks for context[{' + key + '}] in template [' + this.getTemplateName() + ']', DEBUG);
      return;
    }
    var len = blocks.length, fn;
    while (len--) {
      fn = blocks[len][key];
      if (fn) {
        return fn;
      }
    }
  };

  Context.prototype.shiftBlocks = function(locals) {
    var blocks = this.blocks,
        newBlocks;

    if (locals) {
      if (!blocks) {
        newBlocks = [locals];
      } else {
        newBlocks = blocks.concat([locals]);
      }
      return new Context(this.stack, this.global, newBlocks, this.getTemplateName());
    }
    return this;
  };

  Context.prototype.getTemplateName = function() {
    return this.templateName;
  };

  function Stack(head, tail, idx, len) {
    this.tail = tail;
    this.isObject = head && typeof head === 'object';
    this.head = head;
    this.index = idx;
    this.of = len;
  }

  function Stub(callback) {
    this.head = new Chunk(this);
    this.callback = callback;
    this.out = '';
  }

  Stub.prototype.flush = function() {
    var chunk = this.head;

    while (chunk) {
      if (chunk.flushable) {
        this.out += chunk.data.join(''); //ie7 perf
      } else if (chunk.error) {
        this.callback(chunk.error);
        dust.log('Chunk error [' + chunk.error + '] thrown. Ceasing to render this template.', WARN);
        this.flush = EMPTY_FUNC;
        return;
      } else {
        return;
      }
      chunk = chunk.next;
      this.head = chunk;
    }
    this.callback(null, this.out);
  };

  function Stream() {
    this.head = new Chunk(this);
  }

  Stream.prototype.flush = function() {
    var chunk = this.head;

    while(chunk) {
      if (chunk.flushable) {
        this.emit('data', chunk.data.join('')); //ie7 perf
      } else if (chunk.error) {
        this.emit('error', chunk.error);
        dust.log('Chunk error [' + chunk.error + '] thrown. Ceasing to render this template.', WARN);
        this.flush = EMPTY_FUNC;
        return;
      } else {
        return;
      }
      chunk = chunk.next;
      this.head = chunk;
    }
    this.emit('end');
  };

  Stream.prototype.emit = function(type, data) {
    if (!this.events) {
      dust.log('No events to emit', INFO);
      return false;
    }
    var handler = this.events[type];
    if (!handler) {
      dust.log('Event type [' + type + '] does not exist', WARN);
      return false;
    }
    if (typeof handler === 'function') {
      handler(data);
    } else if (dust.isArray(handler)) {
      var listeners = handler.slice(0);
      for (var i = 0, l = listeners.length; i < l; i++) {
        listeners[i](data);
      }
    } else {
      dust.log('Event Handler [' + handler + '] is not of a type that is handled by emit', WARN);
    }
  };

  Stream.prototype.on = function(type, callback) {
    if (!this.events) {
      this.events = {};
    }
    if (!this.events[type]) {
      dust.log('Event type [' + type + '] does not exist. Using just the specified callback.', WARN);
      if(callback) {
        this.events[type] = callback;
      } else {
        dust.log('Callback for type [' + type + '] does not exist. Listener not registered.', WARN);
      }
    } else if(typeof this.events[type] === 'function') {
      this.events[type] = [this.events[type], callback];
    } else {
      this.events[type].push(callback);
    }
    return this;
  };

  Stream.prototype.pipe = function(stream) {
    this.on('data', function(data) {
      try {
        stream.write(data, 'utf8');
      } catch (err) {
        dust.log(err, ERROR);
      }
    }).on('end', function() {
      try {
        return stream.end();
      } catch (err) {
        dust.log(err, ERROR);
      }
    }).on('error', function(err) {
      stream.error(err);
    });
    return this;
  };

  function Chunk(root, next, taps) {
    this.root = root;
    this.next = next;
    this.data = []; //ie7 perf
    this.flushable = false;
    this.taps = taps;
  }

  Chunk.prototype.write = function(data) {
    var taps  = this.taps;

    if (taps) {
      data = taps.go(data);
    }
    this.data.push(data);
    return this;
  };

  Chunk.prototype.end = function(data) {
    if (data) {
      this.write(data);
    }
    this.flushable = true;
    this.root.flush();
    return this;
  };

  Chunk.prototype.map = function(callback) {
    var cursor = new Chunk(this.root, this.next, this.taps),
        branch = new Chunk(this.root, cursor, this.taps);

    this.next = branch;
    this.flushable = true;
    callback(branch);
    return cursor;
  };

  Chunk.prototype.tap = function(tap) {
    var taps = this.taps;

    if (taps) {
      this.taps = taps.push(tap);
    } else {
      this.taps = new Tap(tap);
    }
    return this;
  };

  Chunk.prototype.untap = function() {
    this.taps = this.taps.tail;
    return this;
  };

  Chunk.prototype.render = function(body, context) {
    return body(this, context);
  };

  Chunk.prototype.reference = function(elem, context, auto, filters) {
    if (typeof elem === 'function') {
      elem.isFunction = true;
      // Changed the function calling to use apply with the current context to make sure
      // that "this" is wat we expect it to be inside the function
      elem = elem.apply(context.current(), [this, context, null, {auto: auto, filters: filters}]);
      if (elem instanceof Chunk) {
        return elem;
      }
    }
    if (!dust.isEmpty(elem)) {
      return this.write(dust.filter(elem, auto, filters));
    } else {
      return this;
    }
  };

  Chunk.prototype.section = function(elem, context, bodies, params) {
    // anonymous functions
    if (typeof elem === 'function') {
      elem = elem.apply(context.current(), [this, context, bodies, params]);
      // functions that return chunks are assumed to have handled the body and/or have modified the chunk
      // use that return value as the current chunk and go to the next method in the chain
      if (elem instanceof Chunk) {
        return elem;
      }
    }
    var body = bodies.block,
        skip = bodies['else'];

    // a.k.a Inline parameters in the Dust documentations
    if (params) {
      context = context.push(params);
    }

    /*
    Dust's default behavior is to enumerate over the array elem, passing each object in the array to the block.
    When elem resolves to a value or object instead of an array, Dust sets the current context to the value
    and renders the block one time.
    */
    //non empty array is truthy, empty array is falsy
    if (dust.isArray(elem)) {
      if (body) {
        var len = elem.length, chunk = this;
        if (len > 0) {
          // any custom helper can blow up the stack
          // and store a flattened context, guard defensively
          if(context.stack.head) {
            context.stack.head['$len'] = len;
          }
          for (var i=0; i<len; i++) {
            if(context.stack.head) {
              context.stack.head['$idx'] = i;
            }
            chunk = body(chunk, context.push(elem[i], i, len));
          }
          if(context.stack.head) {
            context.stack.head['$idx'] = undefined;
            context.stack.head['$len'] = undefined;
          }
          return chunk;
        }
        else if (skip) {
          return skip(this, context);
        }
      }
    } else if (elem  === true) {
     // true is truthy but does not change context
      if (body) {
        return body(this, context);
      }
    } else if (elem || elem === 0) {
       // everything that evaluates to true are truthy ( e.g. Non-empty strings and Empty objects are truthy. )
       // zero is truthy
       // for anonymous functions that did not returns a chunk, truthiness is evaluated based on the return value
      if (body) {
        return body(this, context.push(elem));
      }
     // nonexistent, scalar false value, scalar empty string, null,
     // undefined are all falsy
    } else if (skip) {
      return skip(this, context);
    }
    dust.log('Not rendering section (#) block in template [' + context.getTemplateName() + '], because above key was not found', DEBUG);
    return this;
  };

  Chunk.prototype.exists = function(elem, context, bodies) {
    var body = bodies.block,
        skip = bodies['else'];

    if (!dust.isEmpty(elem)) {
      if (body) {
        return body(this, context);
      }
    } else if (skip) {
      return skip(this, context);
    }
    dust.log('Not rendering exists (?) block in template [' + context.getTemplateName() + '], because above key was not found', DEBUG);
    return this;
  };

  Chunk.prototype.notexists = function(elem, context, bodies) {
    var body = bodies.block,
        skip = bodies['else'];

    if (dust.isEmpty(elem)) {
      if (body) {
        return body(this, context);
      }
    } else if (skip) {
      return skip(this, context);
    }
    dust.log('Not rendering not exists (^) block check in template [' + context.getTemplateName() + '], because above key was found', DEBUG);
    return this;
  };

  Chunk.prototype.block = function(elem, context, bodies) {
    var body = bodies.block;

    if (elem) {
      body = elem;
    }

    if (body) {
      return body(this, context);
    }
    return this;
  };

  Chunk.prototype.partial = function(elem, context, params) {
    var partialContext;
    //put the params context second to match what section does. {.} matches the current context without parameters
    // start with an empty context
    partialContext = dust.makeBase(context.global);
    partialContext.blocks = context.blocks;
    if (context.stack && context.stack.tail){
      // grab the stack(tail) off of the previous context if we have it
      partialContext.stack = context.stack.tail;
    }
    if (params){
      //put params on
      partialContext = partialContext.push(params);
    }

    if(typeof elem === 'string') {
      partialContext.templateName = elem;
    }

    //reattach the head
    partialContext = partialContext.push(context.stack.head);

    var partialChunk;
    if (typeof elem === 'function') {
      partialChunk = this.capture(elem, partialContext, function(name, chunk) {
        partialContext.templateName = partialContext.templateName || name;
        dust.load(name, chunk, partialContext).end();
      });
    } else {
      partialChunk = dust.load(elem, this, partialContext);
    }
    return partialChunk;
  };

  Chunk.prototype.helper = function(name, context, bodies, params) {
    var chunk = this;
    // handle invalid helpers, similar to invalid filters
    try {
      if(dust.helpers[name]) {
        return dust.helpers[name](chunk, context, bodies, params);
      } else {
        dust.log('Invalid helper [' + name + ']', WARN);
        return chunk;
      }
    } catch (err) {
      dust.log(err, ERROR);
      return chunk;
    }
  };

  Chunk.prototype.capture = function(body, context, callback) {
    return this.map(function(chunk) {
      var stub = new Stub(function(err, out) {
        if (err) {
          chunk.setError(err);
        } else {
          callback(out, chunk);
        }
      });
      body(stub.head, context).end();
    });
  };

  Chunk.prototype.setError = function(err) {
    this.error = err;
    this.root.flush();
    return this;
  };

  function Tap(head, tail) {
    this.head = head;
    this.tail = tail;
  }

  Tap.prototype.push = function(tap) {
    return new Tap(tap, this);
  };

  Tap.prototype.go = function(value) {
    var tap = this;

    while(tap) {
      value = tap.head(value);
      tap = tap.tail;
    }
    return value;
  };

  var HCHARS = new RegExp(/[&<>\"\']/),
      AMP    = /&/g,
      LT     = /</g,
      GT     = />/g,
      QUOT   = /\"/g,
      SQUOT  = /\'/g;

  dust.escapeHtml = function(s) {
    if (typeof s === 'string') {
      if (!HCHARS.test(s)) {
        return s;
      }
      return s.replace(AMP,'&amp;').replace(LT,'&lt;').replace(GT,'&gt;').replace(QUOT,'&quot;').replace(SQUOT, '&#39;');
    }
    return s;
  };

  var BS = /\\/g,
      FS = /\//g,
      CR = /\r/g,
      LS = /\u2028/g,
      PS = /\u2029/g,
      NL = /\n/g,
      LF = /\f/g,
      SQ = /'/g,
      DQ = /"/g,
      TB = /\t/g;

  dust.escapeJs = function(s) {
    if (typeof s === 'string') {
      return s
        .replace(BS, '\\\\')
        .replace(FS, '\\/')
        .replace(DQ, '\\"')
        .replace(SQ, '\\\'')
        .replace(CR, '\\r')
        .replace(LS, '\\u2028')
        .replace(PS, '\\u2029')
        .replace(NL, '\\n')
        .replace(LF, '\\f')
        .replace(TB, '\\t');
    }
    return s;
  };


  if (typeof exports === 'object') {
    module.exports = dust;
  } else {
    root.dust = dust;
  }

})(this);

(function(root, factory) {
  if (typeof exports === 'object') {
    // in Node, require this file if we want to use the parser as a standalone module
    module.exports = factory(require('./dust'));
    // @see server file for parser methods exposed in node
  } else {
    // in the browser, store the factory output if we want to use the parser directly
    factory(root.dust);
  }
}(this, function(dust) {
  var parser = (function(){
  /*
   * Generated by PEG.js 0.7.0.
   *
   * http://pegjs.majda.cz/
   */
  
  function quote(s) {
    /*
     * ECMA-262, 5th ed., 7.8.4: All characters may appear literally in a
     * string literal except for the closing quote character, backslash,
     * carriage return, line separator, paragraph separator, and line feed.
     * Any character may appear in the form of an escape sequence.
     *
     * For portability, we also escape escape all control and non-ASCII
     * characters. Note that "\0" and "\v" escape sequences are not used
     * because JSHint does not like the first and IE the second.
     */
     return '"' + s
      .replace(/\\/g, '\\\\')  // backslash
      .replace(/"/g, '\\"')    // closing quote character
      .replace(/\x08/g, '\\b') // backspace
      .replace(/\t/g, '\\t')   // horizontal tab
      .replace(/\n/g, '\\n')   // line feed
      .replace(/\f/g, '\\f')   // form feed
      .replace(/\r/g, '\\r')   // carriage return
      .replace(/[\x00-\x07\x0B\x0E-\x1F\x80-\uFFFF]/g, escape)
      + '"';
  }
  
  var result = {
    /*
     * Parses the input with a generated parser. If the parsing is successfull,
     * returns a value explicitly or implicitly specified by the grammar from
     * which the parser was generated (see |PEG.buildParser|). If the parsing is
     * unsuccessful, throws |PEG.parser.SyntaxError| describing the error.
     */
    parse: function(input, startRule) {
      var parseFunctions = {
        "body": parse_body,
        "part": parse_part,
        "section": parse_section,
        "sec_tag_start": parse_sec_tag_start,
        "end_tag": parse_end_tag,
        "context": parse_context,
        "params": parse_params,
        "bodies": parse_bodies,
        "reference": parse_reference,
        "partial": parse_partial,
        "filters": parse_filters,
        "special": parse_special,
        "identifier": parse_identifier,
        "number": parse_number,
        "float": parse_float,
        "integer": parse_integer,
        "path": parse_path,
        "key": parse_key,
        "array": parse_array,
        "array_part": parse_array_part,
        "inline": parse_inline,
        "inline_part": parse_inline_part,
        "buffer": parse_buffer,
        "literal": parse_literal,
        "esc": parse_esc,
        "raw": parse_raw,
        "comment": parse_comment,
        "tag": parse_tag,
        "ld": parse_ld,
        "rd": parse_rd,
        "lb": parse_lb,
        "rb": parse_rb,
        "eol": parse_eol,
        "ws": parse_ws
      };
      
      if (startRule !== undefined) {
        if (parseFunctions[startRule] === undefined) {
          throw new Error("Invalid rule name: " + quote(startRule) + ".");
        }
      } else {
        startRule = "body";
      }
      
      var pos = { offset: 0, line: 1, column: 1, seenCR: false };
      var reportFailures = 0;
      var rightmostFailuresPos = { offset: 0, line: 1, column: 1, seenCR: false };
      var rightmostFailuresExpected = [];
      
      function padLeft(input, padding, length) {
        var result = input;
        
        var padLength = length - input.length;
        for (var i = 0; i < padLength; i++) {
          result = padding + result;
        }
        
        return result;
      }
      
      function escape(ch) {
        var charCode = ch.charCodeAt(0);
        var escapeChar;
        var length;
        
        if (charCode <= 0xFF) {
          escapeChar = 'x';
          length = 2;
        } else {
          escapeChar = 'u';
          length = 4;
        }
        
        return '\\' + escapeChar + padLeft(charCode.toString(16).toUpperCase(), '0', length);
      }
      
      function clone(object) {
        var result = {};
        for (var key in object) {
          result[key] = object[key];
        }
        return result;
      }
      
      function advance(pos, n) {
        var endOffset = pos.offset + n;
        
        for (var offset = pos.offset; offset < endOffset; offset++) {
          var ch = input.charAt(offset);
          if (ch === "\n") {
            if (!pos.seenCR) { pos.line++; }
            pos.column = 1;
            pos.seenCR = false;
          } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
            pos.line++;
            pos.column = 1;
            pos.seenCR = true;
          } else {
            pos.column++;
            pos.seenCR = false;
          }
        }
        
        pos.offset += n;
      }
      
      function matchFailed(failure) {
        if (pos.offset < rightmostFailuresPos.offset) {
          return;
        }
        
        if (pos.offset > rightmostFailuresPos.offset) {
          rightmostFailuresPos = clone(pos);
          rightmostFailuresExpected = [];
        }
        
        rightmostFailuresExpected.push(failure);
      }
      
      function parse_body() {
        var result0, result1;
        var pos0;
        
        pos0 = clone(pos);
        result0 = [];
        result1 = parse_part();
        while (result1 !== null) {
          result0.push(result1);
          result1 = parse_part();
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, p) { return ["body"].concat(p).concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        return result0;
      }
      
      function parse_part() {
        var result0;
        
        result0 = parse_raw();
        if (result0 === null) {
          result0 = parse_comment();
          if (result0 === null) {
            result0 = parse_section();
            if (result0 === null) {
              result0 = parse_partial();
              if (result0 === null) {
                result0 = parse_special();
                if (result0 === null) {
                  result0 = parse_reference();
                  if (result0 === null) {
                    result0 = parse_buffer();
                  }
                }
              }
            }
          }
        }
        return result0;
      }
      
      function parse_section() {
        var result0, result1, result2, result3, result4, result5, result6;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_sec_tag_start();
        if (result0 !== null) {
          result1 = [];
          result2 = parse_ws();
          while (result2 !== null) {
            result1.push(result2);
            result2 = parse_ws();
          }
          if (result1 !== null) {
            result2 = parse_rd();
            if (result2 !== null) {
              result3 = parse_body();
              if (result3 !== null) {
                result4 = parse_bodies();
                if (result4 !== null) {
                  result5 = parse_end_tag();
                  result5 = result5 !== null ? result5 : "";
                  if (result5 !== null) {
                    result6 = (function(offset, line, column, t, b, e, n) {if( (!n) || (t[1].text !== n.text) ) { throw new Error("Expected end tag for "+t[1].text+" but it was not found. At line : "+line+", column : " + column)} return true;})(pos.offset, pos.line, pos.column, result0, result3, result4, result5) ? "" : null;
                    if (result6 !== null) {
                      result0 = [result0, result1, result2, result3, result4, result5, result6];
                    } else {
                      result0 = null;
                      pos = clone(pos1);
                    }
                  } else {
                    result0 = null;
                    pos = clone(pos1);
                  }
                } else {
                  result0 = null;
                  pos = clone(pos1);
                }
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, t, b, e, n) { e.push(["param", ["literal", "block"], b]); t.push(e); return t.concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[0], result0[3], result0[4], result0[5]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        if (result0 === null) {
          pos0 = clone(pos);
          pos1 = clone(pos);
          result0 = parse_sec_tag_start();
          if (result0 !== null) {
            result1 = [];
            result2 = parse_ws();
            while (result2 !== null) {
              result1.push(result2);
              result2 = parse_ws();
            }
            if (result1 !== null) {
              if (input.charCodeAt(pos.offset) === 47) {
                result2 = "/";
                advance(pos, 1);
              } else {
                result2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"/\"");
                }
              }
              if (result2 !== null) {
                result3 = parse_rd();
                if (result3 !== null) {
                  result0 = [result0, result1, result2, result3];
                } else {
                  result0 = null;
                  pos = clone(pos1);
                }
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
          if (result0 !== null) {
            result0 = (function(offset, line, column, t) { t.push(["bodies"]); return t.concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[0]);
          }
          if (result0 === null) {
            pos = clone(pos0);
          }
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("section");
        }
        return result0;
      }
      
      function parse_sec_tag_start() {
        var result0, result1, result2, result3, result4, result5;
        var pos0, pos1;
        
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_ld();
        if (result0 !== null) {
          if (/^[#?^<+@%]/.test(input.charAt(pos.offset))) {
            result1 = input.charAt(pos.offset);
            advance(pos, 1);
          } else {
            result1 = null;
            if (reportFailures === 0) {
              matchFailed("[#?^<+@%]");
            }
          }
          if (result1 !== null) {
            result2 = [];
            result3 = parse_ws();
            while (result3 !== null) {
              result2.push(result3);
              result3 = parse_ws();
            }
            if (result2 !== null) {
              result3 = parse_identifier();
              if (result3 !== null) {
                result4 = parse_context();
                if (result4 !== null) {
                  result5 = parse_params();
                  if (result5 !== null) {
                    result0 = [result0, result1, result2, result3, result4, result5];
                  } else {
                    result0 = null;
                    pos = clone(pos1);
                  }
                } else {
                  result0 = null;
                  pos = clone(pos1);
                }
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, t, n, c, p) { return [t, n, c, p] })(pos0.offset, pos0.line, pos0.column, result0[1], result0[3], result0[4], result0[5]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        return result0;
      }
      
      function parse_end_tag() {
        var result0, result1, result2, result3, result4, result5;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_ld();
        if (result0 !== null) {
          if (input.charCodeAt(pos.offset) === 47) {
            result1 = "/";
            advance(pos, 1);
          } else {
            result1 = null;
            if (reportFailures === 0) {
              matchFailed("\"/\"");
            }
          }
          if (result1 !== null) {
            result2 = [];
            result3 = parse_ws();
            while (result3 !== null) {
              result2.push(result3);
              result3 = parse_ws();
            }
            if (result2 !== null) {
              result3 = parse_identifier();
              if (result3 !== null) {
                result4 = [];
                result5 = parse_ws();
                while (result5 !== null) {
                  result4.push(result5);
                  result5 = parse_ws();
                }
                if (result4 !== null) {
                  result5 = parse_rd();
                  if (result5 !== null) {
                    result0 = [result0, result1, result2, result3, result4, result5];
                  } else {
                    result0 = null;
                    pos = clone(pos1);
                  }
                } else {
                  result0 = null;
                  pos = clone(pos1);
                }
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, n) { return n })(pos0.offset, pos0.line, pos0.column, result0[3]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("end tag");
        }
        return result0;
      }
      
      function parse_context() {
        var result0, result1;
        var pos0, pos1, pos2;
        
        pos0 = clone(pos);
        pos1 = clone(pos);
        pos2 = clone(pos);
        if (input.charCodeAt(pos.offset) === 58) {
          result0 = ":";
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\":\"");
          }
        }
        if (result0 !== null) {
          result1 = parse_identifier();
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = clone(pos2);
          }
        } else {
          result0 = null;
          pos = clone(pos2);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, n) {return n})(pos1.offset, pos1.line, pos1.column, result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos1);
        }
        result0 = result0 !== null ? result0 : "";
        if (result0 !== null) {
          result0 = (function(offset, line, column, n) { return n ? ["context", n] : ["context"] })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        return result0;
      }
      
      function parse_params() {
        var result0, result1, result2, result3, result4;
        var pos0, pos1, pos2;
        
        reportFailures++;
        pos0 = clone(pos);
        result0 = [];
        pos1 = clone(pos);
        pos2 = clone(pos);
        result2 = parse_ws();
        if (result2 !== null) {
          result1 = [];
          while (result2 !== null) {
            result1.push(result2);
            result2 = parse_ws();
          }
        } else {
          result1 = null;
        }
        if (result1 !== null) {
          result2 = parse_key();
          if (result2 !== null) {
            if (input.charCodeAt(pos.offset) === 61) {
              result3 = "=";
              advance(pos, 1);
            } else {
              result3 = null;
              if (reportFailures === 0) {
                matchFailed("\"=\"");
              }
            }
            if (result3 !== null) {
              result4 = parse_number();
              if (result4 === null) {
                result4 = parse_identifier();
                if (result4 === null) {
                  result4 = parse_inline();
                }
              }
              if (result4 !== null) {
                result1 = [result1, result2, result3, result4];
              } else {
                result1 = null;
                pos = clone(pos2);
              }
            } else {
              result1 = null;
              pos = clone(pos2);
            }
          } else {
            result1 = null;
            pos = clone(pos2);
          }
        } else {
          result1 = null;
          pos = clone(pos2);
        }
        if (result1 !== null) {
          result1 = (function(offset, line, column, k, v) {return ["param", ["literal", k], v]})(pos1.offset, pos1.line, pos1.column, result1[1], result1[3]);
        }
        if (result1 === null) {
          pos = clone(pos1);
        }
        while (result1 !== null) {
          result0.push(result1);
          pos1 = clone(pos);
          pos2 = clone(pos);
          result2 = parse_ws();
          if (result2 !== null) {
            result1 = [];
            while (result2 !== null) {
              result1.push(result2);
              result2 = parse_ws();
            }
          } else {
            result1 = null;
          }
          if (result1 !== null) {
            result2 = parse_key();
            if (result2 !== null) {
              if (input.charCodeAt(pos.offset) === 61) {
                result3 = "=";
                advance(pos, 1);
              } else {
                result3 = null;
                if (reportFailures === 0) {
                  matchFailed("\"=\"");
                }
              }
              if (result3 !== null) {
                result4 = parse_number();
                if (result4 === null) {
                  result4 = parse_identifier();
                  if (result4 === null) {
                    result4 = parse_inline();
                  }
                }
                if (result4 !== null) {
                  result1 = [result1, result2, result3, result4];
                } else {
                  result1 = null;
                  pos = clone(pos2);
                }
              } else {
                result1 = null;
                pos = clone(pos2);
              }
            } else {
              result1 = null;
              pos = clone(pos2);
            }
          } else {
            result1 = null;
            pos = clone(pos2);
          }
          if (result1 !== null) {
            result1 = (function(offset, line, column, k, v) {return ["param", ["literal", k], v]})(pos1.offset, pos1.line, pos1.column, result1[1], result1[3]);
          }
          if (result1 === null) {
            pos = clone(pos1);
          }
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, p) { return ["params"].concat(p) })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("params");
        }
        return result0;
      }
      
      function parse_bodies() {
        var result0, result1, result2, result3, result4, result5;
        var pos0, pos1, pos2;
        
        reportFailures++;
        pos0 = clone(pos);
        result0 = [];
        pos1 = clone(pos);
        pos2 = clone(pos);
        result1 = parse_ld();
        if (result1 !== null) {
          if (input.charCodeAt(pos.offset) === 58) {
            result2 = ":";
            advance(pos, 1);
          } else {
            result2 = null;
            if (reportFailures === 0) {
              matchFailed("\":\"");
            }
          }
          if (result2 !== null) {
            result3 = parse_key();
            if (result3 !== null) {
              result4 = parse_rd();
              if (result4 !== null) {
                result5 = parse_body();
                if (result5 !== null) {
                  result1 = [result1, result2, result3, result4, result5];
                } else {
                  result1 = null;
                  pos = clone(pos2);
                }
              } else {
                result1 = null;
                pos = clone(pos2);
              }
            } else {
              result1 = null;
              pos = clone(pos2);
            }
          } else {
            result1 = null;
            pos = clone(pos2);
          }
        } else {
          result1 = null;
          pos = clone(pos2);
        }
        if (result1 !== null) {
          result1 = (function(offset, line, column, k, v) {return ["param", ["literal", k], v]})(pos1.offset, pos1.line, pos1.column, result1[2], result1[4]);
        }
        if (result1 === null) {
          pos = clone(pos1);
        }
        while (result1 !== null) {
          result0.push(result1);
          pos1 = clone(pos);
          pos2 = clone(pos);
          result1 = parse_ld();
          if (result1 !== null) {
            if (input.charCodeAt(pos.offset) === 58) {
              result2 = ":";
              advance(pos, 1);
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("\":\"");
              }
            }
            if (result2 !== null) {
              result3 = parse_key();
              if (result3 !== null) {
                result4 = parse_rd();
                if (result4 !== null) {
                  result5 = parse_body();
                  if (result5 !== null) {
                    result1 = [result1, result2, result3, result4, result5];
                  } else {
                    result1 = null;
                    pos = clone(pos2);
                  }
                } else {
                  result1 = null;
                  pos = clone(pos2);
                }
              } else {
                result1 = null;
                pos = clone(pos2);
              }
            } else {
              result1 = null;
              pos = clone(pos2);
            }
          } else {
            result1 = null;
            pos = clone(pos2);
          }
          if (result1 !== null) {
            result1 = (function(offset, line, column, k, v) {return ["param", ["literal", k], v]})(pos1.offset, pos1.line, pos1.column, result1[2], result1[4]);
          }
          if (result1 === null) {
            pos = clone(pos1);
          }
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, p) { return ["bodies"].concat(p) })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("bodies");
        }
        return result0;
      }
      
      function parse_reference() {
        var result0, result1, result2, result3;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_ld();
        if (result0 !== null) {
          result1 = parse_identifier();
          if (result1 !== null) {
            result2 = parse_filters();
            if (result2 !== null) {
              result3 = parse_rd();
              if (result3 !== null) {
                result0 = [result0, result1, result2, result3];
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, n, f) { return ["reference", n, f].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[1], result0[2]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("reference");
        }
        return result0;
      }
      
      function parse_partial() {
        var result0, result1, result2, result3, result4, result5, result6, result7, result8;
        var pos0, pos1, pos2;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_ld();
        if (result0 !== null) {
          if (input.charCodeAt(pos.offset) === 62) {
            result1 = ">";
            advance(pos, 1);
          } else {
            result1 = null;
            if (reportFailures === 0) {
              matchFailed("\">\"");
            }
          }
          if (result1 === null) {
            if (input.charCodeAt(pos.offset) === 43) {
              result1 = "+";
              advance(pos, 1);
            } else {
              result1 = null;
              if (reportFailures === 0) {
                matchFailed("\"+\"");
              }
            }
          }
          if (result1 !== null) {
            result2 = [];
            result3 = parse_ws();
            while (result3 !== null) {
              result2.push(result3);
              result3 = parse_ws();
            }
            if (result2 !== null) {
              pos2 = clone(pos);
              result3 = parse_key();
              if (result3 !== null) {
                result3 = (function(offset, line, column, k) {return ["literal", k]})(pos2.offset, pos2.line, pos2.column, result3);
              }
              if (result3 === null) {
                pos = clone(pos2);
              }
              if (result3 === null) {
                result3 = parse_inline();
              }
              if (result3 !== null) {
                result4 = parse_context();
                if (result4 !== null) {
                  result5 = parse_params();
                  if (result5 !== null) {
                    result6 = [];
                    result7 = parse_ws();
                    while (result7 !== null) {
                      result6.push(result7);
                      result7 = parse_ws();
                    }
                    if (result6 !== null) {
                      if (input.charCodeAt(pos.offset) === 47) {
                        result7 = "/";
                        advance(pos, 1);
                      } else {
                        result7 = null;
                        if (reportFailures === 0) {
                          matchFailed("\"/\"");
                        }
                      }
                      if (result7 !== null) {
                        result8 = parse_rd();
                        if (result8 !== null) {
                          result0 = [result0, result1, result2, result3, result4, result5, result6, result7, result8];
                        } else {
                          result0 = null;
                          pos = clone(pos1);
                        }
                      } else {
                        result0 = null;
                        pos = clone(pos1);
                      }
                    } else {
                      result0 = null;
                      pos = clone(pos1);
                    }
                  } else {
                    result0 = null;
                    pos = clone(pos1);
                  }
                } else {
                  result0 = null;
                  pos = clone(pos1);
                }
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, s, n, c, p) { var key = (s ===">")? "partial" : s; return [key, n, c, p].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[1], result0[3], result0[4], result0[5]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("partial");
        }
        return result0;
      }
      
      function parse_filters() {
        var result0, result1, result2;
        var pos0, pos1, pos2;
        
        reportFailures++;
        pos0 = clone(pos);
        result0 = [];
        pos1 = clone(pos);
        pos2 = clone(pos);
        if (input.charCodeAt(pos.offset) === 124) {
          result1 = "|";
          advance(pos, 1);
        } else {
          result1 = null;
          if (reportFailures === 0) {
            matchFailed("\"|\"");
          }
        }
        if (result1 !== null) {
          result2 = parse_key();
          if (result2 !== null) {
            result1 = [result1, result2];
          } else {
            result1 = null;
            pos = clone(pos2);
          }
        } else {
          result1 = null;
          pos = clone(pos2);
        }
        if (result1 !== null) {
          result1 = (function(offset, line, column, n) {return n})(pos1.offset, pos1.line, pos1.column, result1[1]);
        }
        if (result1 === null) {
          pos = clone(pos1);
        }
        while (result1 !== null) {
          result0.push(result1);
          pos1 = clone(pos);
          pos2 = clone(pos);
          if (input.charCodeAt(pos.offset) === 124) {
            result1 = "|";
            advance(pos, 1);
          } else {
            result1 = null;
            if (reportFailures === 0) {
              matchFailed("\"|\"");
            }
          }
          if (result1 !== null) {
            result2 = parse_key();
            if (result2 !== null) {
              result1 = [result1, result2];
            } else {
              result1 = null;
              pos = clone(pos2);
            }
          } else {
            result1 = null;
            pos = clone(pos2);
          }
          if (result1 !== null) {
            result1 = (function(offset, line, column, n) {return n})(pos1.offset, pos1.line, pos1.column, result1[1]);
          }
          if (result1 === null) {
            pos = clone(pos1);
          }
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, f) { return ["filters"].concat(f) })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("filters");
        }
        return result0;
      }
      
      function parse_special() {
        var result0, result1, result2, result3;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_ld();
        if (result0 !== null) {
          if (input.charCodeAt(pos.offset) === 126) {
            result1 = "~";
            advance(pos, 1);
          } else {
            result1 = null;
            if (reportFailures === 0) {
              matchFailed("\"~\"");
            }
          }
          if (result1 !== null) {
            result2 = parse_key();
            if (result2 !== null) {
              result3 = parse_rd();
              if (result3 !== null) {
                result0 = [result0, result1, result2, result3];
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, k) { return ["special", k].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[2]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("special");
        }
        return result0;
      }
      
      function parse_identifier() {
        var result0;
        var pos0;
        
        reportFailures++;
        pos0 = clone(pos);
        result0 = parse_path();
        if (result0 !== null) {
          result0 = (function(offset, line, column, p) { var arr = ["path"].concat(p); arr.text = p[1].join('.'); return arr; })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        if (result0 === null) {
          pos0 = clone(pos);
          result0 = parse_key();
          if (result0 !== null) {
            result0 = (function(offset, line, column, k) { var arr = ["key", k]; arr.text = k; return arr; })(pos0.offset, pos0.line, pos0.column, result0);
          }
          if (result0 === null) {
            pos = clone(pos0);
          }
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("identifier");
        }
        return result0;
      }
      
      function parse_number() {
        var result0;
        var pos0;
        
        reportFailures++;
        pos0 = clone(pos);
        result0 = parse_float();
        if (result0 === null) {
          result0 = parse_integer();
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, n) { return ['literal', n]; })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("number");
        }
        return result0;
      }
      
      function parse_float() {
        var result0, result1, result2, result3;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_integer();
        if (result0 !== null) {
          if (input.charCodeAt(pos.offset) === 46) {
            result1 = ".";
            advance(pos, 1);
          } else {
            result1 = null;
            if (reportFailures === 0) {
              matchFailed("\".\"");
            }
          }
          if (result1 !== null) {
            result3 = parse_integer();
            if (result3 !== null) {
              result2 = [];
              while (result3 !== null) {
                result2.push(result3);
                result3 = parse_integer();
              }
            } else {
              result2 = null;
            }
            if (result2 !== null) {
              result0 = [result0, result1, result2];
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, l, r) { return parseFloat(l + "." + r.join('')); })(pos0.offset, pos0.line, pos0.column, result0[0], result0[2]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("float");
        }
        return result0;
      }
      
      function parse_integer() {
        var result0, result1;
        var pos0;
        
        reportFailures++;
        pos0 = clone(pos);
        if (/^[0-9]/.test(input.charAt(pos.offset))) {
          result1 = input.charAt(pos.offset);
          advance(pos, 1);
        } else {
          result1 = null;
          if (reportFailures === 0) {
            matchFailed("[0-9]");
          }
        }
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            if (/^[0-9]/.test(input.charAt(pos.offset))) {
              result1 = input.charAt(pos.offset);
              advance(pos, 1);
            } else {
              result1 = null;
              if (reportFailures === 0) {
                matchFailed("[0-9]");
              }
            }
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, digits) { return parseInt(digits.join(""), 10); })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("integer");
        }
        return result0;
      }
      
      function parse_path() {
        var result0, result1, result2;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_key();
        result0 = result0 !== null ? result0 : "";
        if (result0 !== null) {
          result2 = parse_array_part();
          if (result2 === null) {
            result2 = parse_array();
          }
          if (result2 !== null) {
            result1 = [];
            while (result2 !== null) {
              result1.push(result2);
              result2 = parse_array_part();
              if (result2 === null) {
                result2 = parse_array();
              }
            }
          } else {
            result1 = null;
          }
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, k, d) {
            d = d[0];
            if (k && d) {
              d.unshift(k);
              return [false, d].concat([['line', line], ['col', column]]);
            }
            return [true, d].concat([['line', line], ['col', column]]);
          })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        if (result0 === null) {
          pos0 = clone(pos);
          pos1 = clone(pos);
          if (input.charCodeAt(pos.offset) === 46) {
            result0 = ".";
            advance(pos, 1);
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\".\"");
            }
          }
          if (result0 !== null) {
            result1 = [];
            result2 = parse_array_part();
            if (result2 === null) {
              result2 = parse_array();
            }
            while (result2 !== null) {
              result1.push(result2);
              result2 = parse_array_part();
              if (result2 === null) {
                result2 = parse_array();
              }
            }
            if (result1 !== null) {
              result0 = [result0, result1];
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
          if (result0 !== null) {
            result0 = (function(offset, line, column, d) {
              if (d.length > 0) {
                return [true, d[0]].concat([['line', line], ['col', column]]);
              }
              return [true, []].concat([['line', line], ['col', column]]);
            })(pos0.offset, pos0.line, pos0.column, result0[1]);
          }
          if (result0 === null) {
            pos = clone(pos0);
          }
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("path");
        }
        return result0;
      }
      
      function parse_key() {
        var result0, result1, result2;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        if (/^[a-zA-Z_$]/.test(input.charAt(pos.offset))) {
          result0 = input.charAt(pos.offset);
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[a-zA-Z_$]");
          }
        }
        if (result0 !== null) {
          result1 = [];
          if (/^[0-9a-zA-Z_$\-]/.test(input.charAt(pos.offset))) {
            result2 = input.charAt(pos.offset);
            advance(pos, 1);
          } else {
            result2 = null;
            if (reportFailures === 0) {
              matchFailed("[0-9a-zA-Z_$\\-]");
            }
          }
          while (result2 !== null) {
            result1.push(result2);
            if (/^[0-9a-zA-Z_$\-]/.test(input.charAt(pos.offset))) {
              result2 = input.charAt(pos.offset);
              advance(pos, 1);
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("[0-9a-zA-Z_$\\-]");
              }
            }
          }
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, h, t) { return h + t.join('') })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("key");
        }
        return result0;
      }
      
      function parse_array() {
        var result0, result1, result2;
        var pos0, pos1, pos2, pos3, pos4;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        pos2 = clone(pos);
        pos3 = clone(pos);
        result0 = parse_lb();
        if (result0 !== null) {
          pos4 = clone(pos);
          if (/^[0-9]/.test(input.charAt(pos.offset))) {
            result2 = input.charAt(pos.offset);
            advance(pos, 1);
          } else {
            result2 = null;
            if (reportFailures === 0) {
              matchFailed("[0-9]");
            }
          }
          if (result2 !== null) {
            result1 = [];
            while (result2 !== null) {
              result1.push(result2);
              if (/^[0-9]/.test(input.charAt(pos.offset))) {
                result2 = input.charAt(pos.offset);
                advance(pos, 1);
              } else {
                result2 = null;
                if (reportFailures === 0) {
                  matchFailed("[0-9]");
                }
              }
            }
          } else {
            result1 = null;
          }
          if (result1 !== null) {
            result1 = (function(offset, line, column, n) {return n.join('')})(pos4.offset, pos4.line, pos4.column, result1);
          }
          if (result1 === null) {
            pos = clone(pos4);
          }
          if (result1 === null) {
            result1 = parse_identifier();
          }
          if (result1 !== null) {
            result2 = parse_rb();
            if (result2 !== null) {
              result0 = [result0, result1, result2];
            } else {
              result0 = null;
              pos = clone(pos3);
            }
          } else {
            result0 = null;
            pos = clone(pos3);
          }
        } else {
          result0 = null;
          pos = clone(pos3);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, a) {return a; })(pos2.offset, pos2.line, pos2.column, result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos2);
        }
        if (result0 !== null) {
          result1 = parse_array_part();
          result1 = result1 !== null ? result1 : "";
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, i, nk) { if(nk) { nk.unshift(i); } else {nk = [i] } return nk; })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("array");
        }
        return result0;
      }
      
      function parse_array_part() {
        var result0, result1, result2;
        var pos0, pos1, pos2, pos3;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        pos2 = clone(pos);
        pos3 = clone(pos);
        if (input.charCodeAt(pos.offset) === 46) {
          result1 = ".";
          advance(pos, 1);
        } else {
          result1 = null;
          if (reportFailures === 0) {
            matchFailed("\".\"");
          }
        }
        if (result1 !== null) {
          result2 = parse_key();
          if (result2 !== null) {
            result1 = [result1, result2];
          } else {
            result1 = null;
            pos = clone(pos3);
          }
        } else {
          result1 = null;
          pos = clone(pos3);
        }
        if (result1 !== null) {
          result1 = (function(offset, line, column, k) {return k})(pos2.offset, pos2.line, pos2.column, result1[1]);
        }
        if (result1 === null) {
          pos = clone(pos2);
        }
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            pos2 = clone(pos);
            pos3 = clone(pos);
            if (input.charCodeAt(pos.offset) === 46) {
              result1 = ".";
              advance(pos, 1);
            } else {
              result1 = null;
              if (reportFailures === 0) {
                matchFailed("\".\"");
              }
            }
            if (result1 !== null) {
              result2 = parse_key();
              if (result2 !== null) {
                result1 = [result1, result2];
              } else {
                result1 = null;
                pos = clone(pos3);
              }
            } else {
              result1 = null;
              pos = clone(pos3);
            }
            if (result1 !== null) {
              result1 = (function(offset, line, column, k) {return k})(pos2.offset, pos2.line, pos2.column, result1[1]);
            }
            if (result1 === null) {
              pos = clone(pos2);
            }
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result1 = parse_array();
          result1 = result1 !== null ? result1 : "";
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, d, a) { if (a) { return d.concat(a); } else { return d; } })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("array_part");
        }
        return result0;
      }
      
      function parse_inline() {
        var result0, result1, result2;
        var pos0, pos1;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        if (input.charCodeAt(pos.offset) === 34) {
          result0 = "\"";
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\\"\"");
          }
        }
        if (result0 !== null) {
          if (input.charCodeAt(pos.offset) === 34) {
            result1 = "\"";
            advance(pos, 1);
          } else {
            result1 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\"\"");
            }
          }
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column) { return ["literal", ""].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        if (result0 === null) {
          pos0 = clone(pos);
          pos1 = clone(pos);
          if (input.charCodeAt(pos.offset) === 34) {
            result0 = "\"";
            advance(pos, 1);
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\\"\"");
            }
          }
          if (result0 !== null) {
            result1 = parse_literal();
            if (result1 !== null) {
              if (input.charCodeAt(pos.offset) === 34) {
                result2 = "\"";
                advance(pos, 1);
              } else {
                result2 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\\"\"");
                }
              }
              if (result2 !== null) {
                result0 = [result0, result1, result2];
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
          if (result0 !== null) {
            result0 = (function(offset, line, column, l) { return ["literal", l].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[1]);
          }
          if (result0 === null) {
            pos = clone(pos0);
          }
          if (result0 === null) {
            pos0 = clone(pos);
            pos1 = clone(pos);
            if (input.charCodeAt(pos.offset) === 34) {
              result0 = "\"";
              advance(pos, 1);
            } else {
              result0 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\\"\"");
              }
            }
            if (result0 !== null) {
              result2 = parse_inline_part();
              if (result2 !== null) {
                result1 = [];
                while (result2 !== null) {
                  result1.push(result2);
                  result2 = parse_inline_part();
                }
              } else {
                result1 = null;
              }
              if (result1 !== null) {
                if (input.charCodeAt(pos.offset) === 34) {
                  result2 = "\"";
                  advance(pos, 1);
                } else {
                  result2 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\\"\"");
                  }
                }
                if (result2 !== null) {
                  result0 = [result0, result1, result2];
                } else {
                  result0 = null;
                  pos = clone(pos1);
                }
              } else {
                result0 = null;
                pos = clone(pos1);
              }
            } else {
              result0 = null;
              pos = clone(pos1);
            }
            if (result0 !== null) {
              result0 = (function(offset, line, column, p) { return ["body"].concat(p).concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[1]);
            }
            if (result0 === null) {
              pos = clone(pos0);
            }
          }
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("inline");
        }
        return result0;
      }
      
      function parse_inline_part() {
        var result0;
        var pos0;
        
        result0 = parse_special();
        if (result0 === null) {
          result0 = parse_reference();
          if (result0 === null) {
            pos0 = clone(pos);
            result0 = parse_literal();
            if (result0 !== null) {
              result0 = (function(offset, line, column, l) { return ["buffer", l] })(pos0.offset, pos0.line, pos0.column, result0);
            }
            if (result0 === null) {
              pos = clone(pos0);
            }
          }
        }
        return result0;
      }
      
      function parse_buffer() {
        var result0, result1, result2, result3, result4, result5;
        var pos0, pos1, pos2, pos3;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        result0 = parse_eol();
        if (result0 !== null) {
          result1 = [];
          result2 = parse_ws();
          while (result2 !== null) {
            result1.push(result2);
            result2 = parse_ws();
          }
          if (result1 !== null) {
            result0 = [result0, result1];
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, e, w) { return ["format", e, w.join('')].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[0], result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        if (result0 === null) {
          pos0 = clone(pos);
          pos1 = clone(pos);
          pos2 = clone(pos);
          pos3 = clone(pos);
          reportFailures++;
          result1 = parse_tag();
          reportFailures--;
          if (result1 === null) {
            result1 = "";
          } else {
            result1 = null;
            pos = clone(pos3);
          }
          if (result1 !== null) {
            pos3 = clone(pos);
            reportFailures++;
            result2 = parse_raw();
            reportFailures--;
            if (result2 === null) {
              result2 = "";
            } else {
              result2 = null;
              pos = clone(pos3);
            }
            if (result2 !== null) {
              pos3 = clone(pos);
              reportFailures++;
              result3 = parse_comment();
              reportFailures--;
              if (result3 === null) {
                result3 = "";
              } else {
                result3 = null;
                pos = clone(pos3);
              }
              if (result3 !== null) {
                pos3 = clone(pos);
                reportFailures++;
                result4 = parse_eol();
                reportFailures--;
                if (result4 === null) {
                  result4 = "";
                } else {
                  result4 = null;
                  pos = clone(pos3);
                }
                if (result4 !== null) {
                  if (input.length > pos.offset) {
                    result5 = input.charAt(pos.offset);
                    advance(pos, 1);
                  } else {
                    result5 = null;
                    if (reportFailures === 0) {
                      matchFailed("any character");
                    }
                  }
                  if (result5 !== null) {
                    result1 = [result1, result2, result3, result4, result5];
                  } else {
                    result1 = null;
                    pos = clone(pos2);
                  }
                } else {
                  result1 = null;
                  pos = clone(pos2);
                }
              } else {
                result1 = null;
                pos = clone(pos2);
              }
            } else {
              result1 = null;
              pos = clone(pos2);
            }
          } else {
            result1 = null;
            pos = clone(pos2);
          }
          if (result1 !== null) {
            result1 = (function(offset, line, column, c) {return c})(pos1.offset, pos1.line, pos1.column, result1[4]);
          }
          if (result1 === null) {
            pos = clone(pos1);
          }
          if (result1 !== null) {
            result0 = [];
            while (result1 !== null) {
              result0.push(result1);
              pos1 = clone(pos);
              pos2 = clone(pos);
              pos3 = clone(pos);
              reportFailures++;
              result1 = parse_tag();
              reportFailures--;
              if (result1 === null) {
                result1 = "";
              } else {
                result1 = null;
                pos = clone(pos3);
              }
              if (result1 !== null) {
                pos3 = clone(pos);
                reportFailures++;
                result2 = parse_raw();
                reportFailures--;
                if (result2 === null) {
                  result2 = "";
                } else {
                  result2 = null;
                  pos = clone(pos3);
                }
                if (result2 !== null) {
                  pos3 = clone(pos);
                  reportFailures++;
                  result3 = parse_comment();
                  reportFailures--;
                  if (result3 === null) {
                    result3 = "";
                  } else {
                    result3 = null;
                    pos = clone(pos3);
                  }
                  if (result3 !== null) {
                    pos3 = clone(pos);
                    reportFailures++;
                    result4 = parse_eol();
                    reportFailures--;
                    if (result4 === null) {
                      result4 = "";
                    } else {
                      result4 = null;
                      pos = clone(pos3);
                    }
                    if (result4 !== null) {
                      if (input.length > pos.offset) {
                        result5 = input.charAt(pos.offset);
                        advance(pos, 1);
                      } else {
                        result5 = null;
                        if (reportFailures === 0) {
                          matchFailed("any character");
                        }
                      }
                      if (result5 !== null) {
                        result1 = [result1, result2, result3, result4, result5];
                      } else {
                        result1 = null;
                        pos = clone(pos2);
                      }
                    } else {
                      result1 = null;
                      pos = clone(pos2);
                    }
                  } else {
                    result1 = null;
                    pos = clone(pos2);
                  }
                } else {
                  result1 = null;
                  pos = clone(pos2);
                }
              } else {
                result1 = null;
                pos = clone(pos2);
              }
              if (result1 !== null) {
                result1 = (function(offset, line, column, c) {return c})(pos1.offset, pos1.line, pos1.column, result1[4]);
              }
              if (result1 === null) {
                pos = clone(pos1);
              }
            }
          } else {
            result0 = null;
          }
          if (result0 !== null) {
            result0 = (function(offset, line, column, b) { return ["buffer", b.join('')].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0);
          }
          if (result0 === null) {
            pos = clone(pos0);
          }
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("buffer");
        }
        return result0;
      }
      
      function parse_literal() {
        var result0, result1, result2;
        var pos0, pos1, pos2, pos3;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        pos2 = clone(pos);
        pos3 = clone(pos);
        reportFailures++;
        result1 = parse_tag();
        reportFailures--;
        if (result1 === null) {
          result1 = "";
        } else {
          result1 = null;
          pos = clone(pos3);
        }
        if (result1 !== null) {
          result2 = parse_esc();
          if (result2 === null) {
            if (/^[^"]/.test(input.charAt(pos.offset))) {
              result2 = input.charAt(pos.offset);
              advance(pos, 1);
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("[^\"]");
              }
            }
          }
          if (result2 !== null) {
            result1 = [result1, result2];
          } else {
            result1 = null;
            pos = clone(pos2);
          }
        } else {
          result1 = null;
          pos = clone(pos2);
        }
        if (result1 !== null) {
          result1 = (function(offset, line, column, c) {return c})(pos1.offset, pos1.line, pos1.column, result1[1]);
        }
        if (result1 === null) {
          pos = clone(pos1);
        }
        if (result1 !== null) {
          result0 = [];
          while (result1 !== null) {
            result0.push(result1);
            pos1 = clone(pos);
            pos2 = clone(pos);
            pos3 = clone(pos);
            reportFailures++;
            result1 = parse_tag();
            reportFailures--;
            if (result1 === null) {
              result1 = "";
            } else {
              result1 = null;
              pos = clone(pos3);
            }
            if (result1 !== null) {
              result2 = parse_esc();
              if (result2 === null) {
                if (/^[^"]/.test(input.charAt(pos.offset))) {
                  result2 = input.charAt(pos.offset);
                  advance(pos, 1);
                } else {
                  result2 = null;
                  if (reportFailures === 0) {
                    matchFailed("[^\"]");
                  }
                }
              }
              if (result2 !== null) {
                result1 = [result1, result2];
              } else {
                result1 = null;
                pos = clone(pos2);
              }
            } else {
              result1 = null;
              pos = clone(pos2);
            }
            if (result1 !== null) {
              result1 = (function(offset, line, column, c) {return c})(pos1.offset, pos1.line, pos1.column, result1[1]);
            }
            if (result1 === null) {
              pos = clone(pos1);
            }
          }
        } else {
          result0 = null;
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, b) { return b.join('') })(pos0.offset, pos0.line, pos0.column, result0);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("literal");
        }
        return result0;
      }
      
      function parse_esc() {
        var result0;
        var pos0;
        
        pos0 = clone(pos);
        if (input.substr(pos.offset, 2) === "\\\"") {
          result0 = "\\\"";
          advance(pos, 2);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\\\\\\"\"");
          }
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column) { return '"' })(pos0.offset, pos0.line, pos0.column);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        return result0;
      }
      
      function parse_raw() {
        var result0, result1, result2, result3;
        var pos0, pos1, pos2, pos3, pos4;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        if (input.substr(pos.offset, 2) === "{`") {
          result0 = "{`";
          advance(pos, 2);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"{`\"");
          }
        }
        if (result0 !== null) {
          result1 = [];
          pos2 = clone(pos);
          pos3 = clone(pos);
          pos4 = clone(pos);
          reportFailures++;
          if (input.substr(pos.offset, 2) === "`}") {
            result2 = "`}";
            advance(pos, 2);
          } else {
            result2 = null;
            if (reportFailures === 0) {
              matchFailed("\"`}\"");
            }
          }
          reportFailures--;
          if (result2 === null) {
            result2 = "";
          } else {
            result2 = null;
            pos = clone(pos4);
          }
          if (result2 !== null) {
            if (input.length > pos.offset) {
              result3 = input.charAt(pos.offset);
              advance(pos, 1);
            } else {
              result3 = null;
              if (reportFailures === 0) {
                matchFailed("any character");
              }
            }
            if (result3 !== null) {
              result2 = [result2, result3];
            } else {
              result2 = null;
              pos = clone(pos3);
            }
          } else {
            result2 = null;
            pos = clone(pos3);
          }
          if (result2 !== null) {
            result2 = (function(offset, line, column, char) {return char})(pos2.offset, pos2.line, pos2.column, result2[1]);
          }
          if (result2 === null) {
            pos = clone(pos2);
          }
          while (result2 !== null) {
            result1.push(result2);
            pos2 = clone(pos);
            pos3 = clone(pos);
            pos4 = clone(pos);
            reportFailures++;
            if (input.substr(pos.offset, 2) === "`}") {
              result2 = "`}";
              advance(pos, 2);
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("\"`}\"");
              }
            }
            reportFailures--;
            if (result2 === null) {
              result2 = "";
            } else {
              result2 = null;
              pos = clone(pos4);
            }
            if (result2 !== null) {
              if (input.length > pos.offset) {
                result3 = input.charAt(pos.offset);
                advance(pos, 1);
              } else {
                result3 = null;
                if (reportFailures === 0) {
                  matchFailed("any character");
                }
              }
              if (result3 !== null) {
                result2 = [result2, result3];
              } else {
                result2 = null;
                pos = clone(pos3);
              }
            } else {
              result2 = null;
              pos = clone(pos3);
            }
            if (result2 !== null) {
              result2 = (function(offset, line, column, char) {return char})(pos2.offset, pos2.line, pos2.column, result2[1]);
            }
            if (result2 === null) {
              pos = clone(pos2);
            }
          }
          if (result1 !== null) {
            if (input.substr(pos.offset, 2) === "`}") {
              result2 = "`}";
              advance(pos, 2);
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("\"`}\"");
              }
            }
            if (result2 !== null) {
              result0 = [result0, result1, result2];
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, rawText) { return ["raw", rawText.join('')].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("raw");
        }
        return result0;
      }
      
      function parse_comment() {
        var result0, result1, result2, result3;
        var pos0, pos1, pos2, pos3, pos4;
        
        reportFailures++;
        pos0 = clone(pos);
        pos1 = clone(pos);
        if (input.substr(pos.offset, 2) === "{!") {
          result0 = "{!";
          advance(pos, 2);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"{!\"");
          }
        }
        if (result0 !== null) {
          result1 = [];
          pos2 = clone(pos);
          pos3 = clone(pos);
          pos4 = clone(pos);
          reportFailures++;
          if (input.substr(pos.offset, 2) === "!}") {
            result2 = "!}";
            advance(pos, 2);
          } else {
            result2 = null;
            if (reportFailures === 0) {
              matchFailed("\"!}\"");
            }
          }
          reportFailures--;
          if (result2 === null) {
            result2 = "";
          } else {
            result2 = null;
            pos = clone(pos4);
          }
          if (result2 !== null) {
            if (input.length > pos.offset) {
              result3 = input.charAt(pos.offset);
              advance(pos, 1);
            } else {
              result3 = null;
              if (reportFailures === 0) {
                matchFailed("any character");
              }
            }
            if (result3 !== null) {
              result2 = [result2, result3];
            } else {
              result2 = null;
              pos = clone(pos3);
            }
          } else {
            result2 = null;
            pos = clone(pos3);
          }
          if (result2 !== null) {
            result2 = (function(offset, line, column, c) {return c})(pos2.offset, pos2.line, pos2.column, result2[1]);
          }
          if (result2 === null) {
            pos = clone(pos2);
          }
          while (result2 !== null) {
            result1.push(result2);
            pos2 = clone(pos);
            pos3 = clone(pos);
            pos4 = clone(pos);
            reportFailures++;
            if (input.substr(pos.offset, 2) === "!}") {
              result2 = "!}";
              advance(pos, 2);
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("\"!}\"");
              }
            }
            reportFailures--;
            if (result2 === null) {
              result2 = "";
            } else {
              result2 = null;
              pos = clone(pos4);
            }
            if (result2 !== null) {
              if (input.length > pos.offset) {
                result3 = input.charAt(pos.offset);
                advance(pos, 1);
              } else {
                result3 = null;
                if (reportFailures === 0) {
                  matchFailed("any character");
                }
              }
              if (result3 !== null) {
                result2 = [result2, result3];
              } else {
                result2 = null;
                pos = clone(pos3);
              }
            } else {
              result2 = null;
              pos = clone(pos3);
            }
            if (result2 !== null) {
              result2 = (function(offset, line, column, c) {return c})(pos2.offset, pos2.line, pos2.column, result2[1]);
            }
            if (result2 === null) {
              pos = clone(pos2);
            }
          }
          if (result1 !== null) {
            if (input.substr(pos.offset, 2) === "!}") {
              result2 = "!}";
              advance(pos, 2);
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("\"!}\"");
              }
            }
            if (result2 !== null) {
              result0 = [result0, result1, result2];
            } else {
              result0 = null;
              pos = clone(pos1);
            }
          } else {
            result0 = null;
            pos = clone(pos1);
          }
        } else {
          result0 = null;
          pos = clone(pos1);
        }
        if (result0 !== null) {
          result0 = (function(offset, line, column, c) { return ["comment", c.join('')].concat([['line', line], ['col', column]]) })(pos0.offset, pos0.line, pos0.column, result0[1]);
        }
        if (result0 === null) {
          pos = clone(pos0);
        }
        reportFailures--;
        if (reportFailures === 0 && result0 === null) {
          matchFailed("comment");
        }
        return result0;
      }
      
      function parse_tag() {
        var result0, result1, result2, result3, result4, result5, result6, result7;
        var pos0, pos1, pos2;
        
        pos0 = clone(pos);
        result0 = parse_ld();
        if (result0 !== null) {
          result1 = [];
          result2 = parse_ws();
          while (result2 !== null) {
            result1.push(result2);
            result2 = parse_ws();
          }
          if (result1 !== null) {
            if (/^[#?^><+%:@\/~%]/.test(input.charAt(pos.offset))) {
              result2 = input.charAt(pos.offset);
              advance(pos, 1);
            } else {
              result2 = null;
              if (reportFailures === 0) {
                matchFailed("[#?^><+%:@\\/~%]");
              }
            }
            if (result2 !== null) {
              result3 = [];
              result4 = parse_ws();
              while (result4 !== null) {
                result3.push(result4);
                result4 = parse_ws();
              }
              if (result3 !== null) {
                pos1 = clone(pos);
                pos2 = clone(pos);
                reportFailures++;
                result5 = parse_rd();
                reportFailures--;
                if (result5 === null) {
                  result5 = "";
                } else {
                  result5 = null;
                  pos = clone(pos2);
                }
                if (result5 !== null) {
                  pos2 = clone(pos);
                  reportFailures++;
                  result6 = parse_eol();
                  reportFailures--;
                  if (result6 === null) {
                    result6 = "";
                  } else {
                    result6 = null;
                    pos = clone(pos2);
                  }
                  if (result6 !== null) {
                    if (input.length > pos.offset) {
                      result7 = input.charAt(pos.offset);
                      advance(pos, 1);
                    } else {
                      result7 = null;
                      if (reportFailures === 0) {
                        matchFailed("any character");
                      }
                    }
                    if (result7 !== null) {
                      result5 = [result5, result6, result7];
                    } else {
                      result5 = null;
                      pos = clone(pos1);
                    }
                  } else {
                    result5 = null;
                    pos = clone(pos1);
                  }
                } else {
                  result5 = null;
                  pos = clone(pos1);
                }
                if (result5 !== null) {
                  result4 = [];
                  while (result5 !== null) {
                    result4.push(result5);
                    pos1 = clone(pos);
                    pos2 = clone(pos);
                    reportFailures++;
                    result5 = parse_rd();
                    reportFailures--;
                    if (result5 === null) {
                      result5 = "";
                    } else {
                      result5 = null;
                      pos = clone(pos2);
                    }
                    if (result5 !== null) {
                      pos2 = clone(pos);
                      reportFailures++;
                      result6 = parse_eol();
                      reportFailures--;
                      if (result6 === null) {
                        result6 = "";
                      } else {
                        result6 = null;
                        pos = clone(pos2);
                      }
                      if (result6 !== null) {
                        if (input.length > pos.offset) {
                          result7 = input.charAt(pos.offset);
                          advance(pos, 1);
                        } else {
                          result7 = null;
                          if (reportFailures === 0) {
                            matchFailed("any character");
                          }
                        }
                        if (result7 !== null) {
                          result5 = [result5, result6, result7];
                        } else {
                          result5 = null;
                          pos = clone(pos1);
                        }
                      } else {
                        result5 = null;
                        pos = clone(pos1);
                      }
                    } else {
                      result5 = null;
                      pos = clone(pos1);
                    }
                  }
                } else {
                  result4 = null;
                }
                if (result4 !== null) {
                  result5 = [];
                  result6 = parse_ws();
                  while (result6 !== null) {
                    result5.push(result6);
                    result6 = parse_ws();
                  }
                  if (result5 !== null) {
                    result6 = parse_rd();
                    if (result6 !== null) {
                      result0 = [result0, result1, result2, result3, result4, result5, result6];
                    } else {
                      result0 = null;
                      pos = clone(pos0);
                    }
                  } else {
                    result0 = null;
                    pos = clone(pos0);
                  }
                } else {
                  result0 = null;
                  pos = clone(pos0);
                }
              } else {
                result0 = null;
                pos = clone(pos0);
              }
            } else {
              result0 = null;
              pos = clone(pos0);
            }
          } else {
            result0 = null;
            pos = clone(pos0);
          }
        } else {
          result0 = null;
          pos = clone(pos0);
        }
        if (result0 === null) {
          result0 = parse_reference();
        }
        return result0;
      }
      
      function parse_ld() {
        var result0;
        
        if (input.charCodeAt(pos.offset) === 123) {
          result0 = "{";
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"{\"");
          }
        }
        return result0;
      }
      
      function parse_rd() {
        var result0;
        
        if (input.charCodeAt(pos.offset) === 125) {
          result0 = "}";
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"}\"");
          }
        }
        return result0;
      }
      
      function parse_lb() {
        var result0;
        
        if (input.charCodeAt(pos.offset) === 91) {
          result0 = "[";
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"[\"");
          }
        }
        return result0;
      }
      
      function parse_rb() {
        var result0;
        
        if (input.charCodeAt(pos.offset) === 93) {
          result0 = "]";
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"]\"");
          }
        }
        return result0;
      }
      
      function parse_eol() {
        var result0;
        
        if (input.charCodeAt(pos.offset) === 10) {
          result0 = "\n";
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("\"\\n\"");
          }
        }
        if (result0 === null) {
          if (input.substr(pos.offset, 2) === "\r\n") {
            result0 = "\r\n";
            advance(pos, 2);
          } else {
            result0 = null;
            if (reportFailures === 0) {
              matchFailed("\"\\r\\n\"");
            }
          }
          if (result0 === null) {
            if (input.charCodeAt(pos.offset) === 13) {
              result0 = "\r";
              advance(pos, 1);
            } else {
              result0 = null;
              if (reportFailures === 0) {
                matchFailed("\"\\r\"");
              }
            }
            if (result0 === null) {
              if (input.charCodeAt(pos.offset) === 8232) {
                result0 = "\u2028";
                advance(pos, 1);
              } else {
                result0 = null;
                if (reportFailures === 0) {
                  matchFailed("\"\\u2028\"");
                }
              }
              if (result0 === null) {
                if (input.charCodeAt(pos.offset) === 8233) {
                  result0 = "\u2029";
                  advance(pos, 1);
                } else {
                  result0 = null;
                  if (reportFailures === 0) {
                    matchFailed("\"\\u2029\"");
                  }
                }
              }
            }
          }
        }
        return result0;
      }
      
      function parse_ws() {
        var result0;
        
        if (/^[\t\x0B\f \xA0\uFEFF]/.test(input.charAt(pos.offset))) {
          result0 = input.charAt(pos.offset);
          advance(pos, 1);
        } else {
          result0 = null;
          if (reportFailures === 0) {
            matchFailed("[\\t\\x0B\\f \\xA0\\uFEFF]");
          }
        }
        if (result0 === null) {
          result0 = parse_eol();
        }
        return result0;
      }
      
      
      function cleanupExpected(expected) {
        expected.sort();
        
        var lastExpected = null;
        var cleanExpected = [];
        for (var i = 0; i < expected.length; i++) {
          if (expected[i] !== lastExpected) {
            cleanExpected.push(expected[i]);
            lastExpected = expected[i];
          }
        }
        return cleanExpected;
      }
      
      
      
      var result = parseFunctions[startRule]();
      
      /*
       * The parser is now in one of the following three states:
       *
       * 1. The parser successfully parsed the whole input.
       *
       *    - |result !== null|
       *    - |pos.offset === input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 2. The parser successfully parsed only a part of the input.
       *
       *    - |result !== null|
       *    - |pos.offset < input.length|
       *    - |rightmostFailuresExpected| may or may not contain something
       *
       * 3. The parser did not successfully parse any part of the input.
       *
       *   - |result === null|
       *   - |pos.offset === 0|
       *   - |rightmostFailuresExpected| contains at least one failure
       *
       * All code following this comment (including called functions) must
       * handle these states.
       */
      if (result === null || pos.offset !== input.length) {
        var offset = Math.max(pos.offset, rightmostFailuresPos.offset);
        var found = offset < input.length ? input.charAt(offset) : null;
        var errorPosition = pos.offset > rightmostFailuresPos.offset ? pos : rightmostFailuresPos;
        
        throw new parser.SyntaxError(
          cleanupExpected(rightmostFailuresExpected),
          found,
          offset,
          errorPosition.line,
          errorPosition.column
        );
      }
      
      return result;
    },
    
    /* Returns the parser source code. */
    toSource: function() { return this._source; }
  };
  
  /* Thrown when a parser encounters a syntax error. */
  
  result.SyntaxError = function(expected, found, offset, line, column) {
    function buildMessage(expected, found) {
      var expectedHumanized, foundHumanized;
      
      switch (expected.length) {
        case 0:
          expectedHumanized = "end of input";
          break;
        case 1:
          expectedHumanized = expected[0];
          break;
        default:
          expectedHumanized = expected.slice(0, expected.length - 1).join(", ")
            + " or "
            + expected[expected.length - 1];
      }
      
      foundHumanized = found ? quote(found) : "end of input";
      
      return "Expected " + expectedHumanized + " but " + foundHumanized + " found.";
    }
    
    this.name = "SyntaxError";
    this.expected = expected;
    this.found = found;
    this.message = buildMessage(expected, found);
    this.offset = offset;
    this.line = line;
    this.column = column;
  };
  
  result.SyntaxError.prototype = Error.prototype;
  
  return result;
})();

  // expose parser methods
  dust.parse = parser.parse;

  return parser;
}));
  


(function(root, factory) {
  if (typeof exports === 'object') {
    // in Node, require this file if we want to use the compiler as a standalone module
    module.exports = factory(require('./parser').parse, require('./dust'));
  } else {
    // in the browser, store the factory output if we want to use the compiler directly
    factory(root.dust.parse, root.dust);
  }
}(this, function(parse, dust) {
  var compiler = {},
      isArray = dust.isArray;

  
  compiler.compile = function(source, name) {
    // the name parameter is optional.
    // this can happen for templates that are rendered immediately (renderSource which calls compileFn) or
    // for templates that are compiled as a callable (compileFn)
    //
    // for the common case (using compile and render) a name is required so that templates will be cached by name and rendered later, by name.
    if (!name && name !== null) {
      dust.log(new Error("Template name parameter cannot be undefined when calling dust.compile"), 'ERROR');
    }
 
    try {
      var ast = filterAST(parse(source));
      return compile(ast, name);
    }
    catch (err)
    {
      if (!err.line || !err.column) {
        throw err;
      }
      throw new SyntaxError(err.message + ' At line : ' + err.line + ', column : ' + err.column);
    }
  };

  function filterAST(ast) {
    var context = {};
    return compiler.filterNode(context, ast);
  }

  compiler.filterNode = function(context, node) {
    return compiler.optimizers[node[0]](context, node);
  };

  compiler.optimizers = {
    body:      compactBuffers,
    buffer:    noop,
    special:   convertSpecial,
    format:    nullify,        // TODO: convert format
    reference: visit,
    '#':       visit,
    '?':       visit,
    '^':       visit,
    '<':       visit,
    '+':       visit,
    '@':       visit,
    '%':       visit,
    partial:   visit,
    context:   visit,
    params:    visit,
    bodies:    visit,
    param:     visit,
    filters:   noop,
    key:       noop,
    path:      noop,
    literal:   noop,
    raw:       noop,
    comment:   nullify,
    line:      nullify,
    col:       nullify
  };

  compiler.pragmas = {
    esc: function(compiler, context, bodies, params) {
      var old = compiler.auto,
          out;
      if (!context) {
        context = 'h';
      }
      compiler.auto = (context === 's') ? '' : context;
      out = compileParts(compiler, bodies.block);
      compiler.auto = old;
      return out;
    }
  };

  function visit(context, node) {
    var out = [node[0]],
        i, len, res;
    for (i=1, len=node.length; i<len; i++) {
      res = compiler.filterNode(context, node[i]);
      if (res) {
        out.push(res);
      }
    }
    return out;
  }

  // Compacts consecutive buffer nodes into a single node
  function compactBuffers(context, node) {
    var out = [node[0]],
        memo, i, len, res;
    for (i=1, len=node.length; i<len; i++) {
      res = compiler.filterNode(context, node[i]);
      if (res) {
        if (res[0] === 'buffer') {
          if (memo) {
            memo[1] += res[1];
          } else {
            memo = res;
            out.push(res);
          }
        } else {
          memo = null;
          out.push(res);
        }
      }
    }
    return out;
  }

  var specialChars = {
    's': ' ',
    'n': '\n',
    'r': '\r',
    'lb': '{',
    'rb': '}'
  };

  function convertSpecial(context, node) {
    return ['buffer', specialChars[node[1]]];
  }

  function noop(context, node) {
    return node;
  }

  function nullify(){}

  function compile(ast, name) {
    var context = {
      name: name,
      bodies: [],
      blocks: {},
      index: 0,
      auto: 'h'
    };

    return '(function(){dust.register(' +
        (name ? '"' + name + '"' : 'null') + ',' +
        compiler.compileNode(context, ast) +
        ');' +
        compileBlocks(context) +
        compileBodies(context) +
        'return body_0;' +
        '})();';
  }

  function compileBlocks(context) {
    var out = [],
        blocks = context.blocks,
        name;

    for (name in blocks) {
      out.push('"' + name + '":' + blocks[name]);
    }
    if (out.length) {
      context.blocks = 'ctx=ctx.shiftBlocks(blocks);';
      return 'var blocks={' + out.join(',') + '};';
    }
    return context.blocks = '';
  }

  function compileBodies(context) {
    var out = [],
        bodies = context.bodies,
        blx = context.blocks,
        i, len;

    for (i=0, len=bodies.length; i<len; i++) {
      out[i] = 'function body_' + i + '(chk,ctx){' +
          blx + 'return chk' + bodies[i] + ';}';
    }
    return out.join('');
  }

  function compileParts(context, body) {
    var parts = '',
        i, len;
    for (i=1, len=body.length; i<len; i++) {
      parts += compiler.compileNode(context, body[i]);
    }
    return parts;
  }

  compiler.compileNode = function(context, node) {
    return compiler.nodes[node[0]](context, node);
  };

  compiler.nodes = {
    body: function(context, node) {
      var id = context.index++,
          name = 'body_' + id;
      context.bodies[id] = compileParts(context, node);
      return name;
    },

    buffer: function(context, node) {
      return '.write(' + escape(node[1]) + ')';
    },

    format: function(context, node) {
      return '.write(' + escape(node[1] + node[2]) + ')';
    },

    reference: function(context, node) {
      return '.reference(' + compiler.compileNode(context, node[1]) +
        ',ctx,' + compiler.compileNode(context, node[2]) + ')';
    },

    '#': function(context, node) {
      return compileSection(context, node, 'section');
    },

    '?': function(context, node) {
      return compileSection(context, node, 'exists');
    },

    '^': function(context, node) {
      return compileSection(context, node, 'notexists');
    },

    '<': function(context, node) {
      var bodies = node[4];
      for (var i=1, len=bodies.length; i<len; i++) {
        var param = bodies[i],
            type = param[1][1];
        if (type === 'block') {
          context.blocks[node[1].text] = compiler.compileNode(context, param[2]);
          return '';
        }
      }
      return '';
    },

    '+': function(context, node) {
      if (typeof(node[1].text) === 'undefined'  && typeof(node[4]) === 'undefined'){
        return '.block(ctx.getBlock(' +
              compiler.compileNode(context, node[1]) +
              ',chk, ctx),' + compiler.compileNode(context, node[2]) + ', {},' +
              compiler.compileNode(context, node[3]) +
              ')';
      } else {
        return '.block(ctx.getBlock(' +
            escape(node[1].text) +
            '),' + compiler.compileNode(context, node[2]) + ',' +
            compiler.compileNode(context, node[4]) + ',' +
            compiler.compileNode(context, node[3]) +
            ')';
      }
    },

    '@': function(context, node) {
      return '.helper(' +
        escape(node[1].text) +
        ',' + compiler.compileNode(context, node[2]) + ',' +
        compiler.compileNode(context, node[4]) + ',' +
        compiler.compileNode(context, node[3]) +
        ')';
    },

    '%': function(context, node) {
      // TODO: Move these hacks into pragma precompiler
      var name = node[1][1],
          rawBodies,
          bodies,
          rawParams,
          params,
          ctx, b, p, i, len;
      if (!compiler.pragmas[name]) {
        return '';
      }

      rawBodies = node[4];
      bodies = {};
      for (i=1, len=rawBodies.length; i<len; i++) {
        b = rawBodies[i];
        bodies[b[1][1]] = b[2];
      }

      rawParams = node[3];
      params = {};
      for (i=1, len=rawParams.length; i<len; i++) {
        p = rawParams[i];
        params[p[1][1]] = p[2][1];
      }

      ctx = node[2][1] ? node[2][1].text : null;

      return compiler.pragmas[name](context, ctx, bodies, params);
    },

    partial: function(context, node) {
      return '.partial(' +
          compiler.compileNode(context, node[1]) +
          ',' + compiler.compileNode(context, node[2]) +
          ',' + compiler.compileNode(context, node[3]) + ')';
    },

    context: function(context, node) {
      if (node[1]) {
        return 'ctx.rebase(' + compiler.compileNode(context, node[1]) + ')';
      }
      return 'ctx';
    },

    params: function(context, node) {
      var out = [];
      for (var i=1, len=node.length; i<len; i++) {
        out.push(compiler.compileNode(context, node[i]));
      }
      if (out.length) {
        return '{' + out.join(',') + '}';
      }
      return 'null';
    },

    bodies: function(context, node) {
      var out = [];
      for (var i=1, len=node.length; i<len; i++) {
        out.push(compiler.compileNode(context, node[i]));
      }
      return '{' + out.join(',') + '}';
    },

    param: function(context, node) {
      return compiler.compileNode(context, node[1]) + ':' + compiler.compileNode(context, node[2]);
    },

    filters: function(context, node) {
      var list = [];
      for (var i=1, len=node.length; i<len; i++) {
        var filter = node[i];
        list.push('"' + filter + '"');
      }
      return '"' + context.auto + '"' +
        (list.length ? ',[' + list.join(',') + ']' : '');
    },

    key: function(context, node) {
      return 'ctx.get(["' + node[1] + '"], false)';
    },

    path: function(context, node) {
      var current = node[1],
          keys = node[2],
          list = [];

      for (var i=0,len=keys.length; i<len; i++) {
        if (isArray(keys[i])) {
          list.push(compiler.compileNode(context, keys[i]));
        } else {
          list.push('"' + keys[i] + '"');
        }
      }
      return 'ctx.getPath(' + current + ', [' + list.join(',') + '])';
    },

    literal: function(context, node) {
      return escape(node[1]);
    },
    raw: function(context, node) {
      return ".write(" + escape(node[1]) + ")";
    }
  };

  function compileSection(context, node, cmd) {
    return '.' + cmd + '(' +
      compiler.compileNode(context, node[1]) +
      ',' + compiler.compileNode(context, node[2]) + ',' +
      compiler.compileNode(context, node[4]) + ',' +
      compiler.compileNode(context, node[3]) +
      ')';
  }

  var BS = /\\/g,
      DQ = /"/g,
      LF = /\f/g,
      NL = /\n/g,
      CR = /\r/g,
      TB = /\t/g;
  function escapeToJsSafeString(str) {
    return str.replace(BS, '\\\\')
              .replace(DQ, '\\"')
              .replace(LF, '\\f')
              .replace(NL, '\\n')
              .replace(CR, '\\r')
              .replace(TB, '\\t');
  }

  var escape = (typeof JSON === 'undefined') ?
                  function(str) { return '"' + escapeToJsSafeString(str) + '"';} :
                  JSON.stringify;

  // expose compiler methods
  dust.compile = compiler.compile;
  dust.filterNode = compiler.filterNode;
  dust.optimizers = compiler.optimizers;
  dust.pragmas = compiler.pragmas;
  dust.compileNode = compiler.compileNode;
  dust.nodes = compiler.nodes;
  
  return compiler;

}));;
/* Dust Helpers */
/*! dustjs-helpers - v1.2.0
* https://github.com/linkedin/dustjs-helpers
* Copyright (c) 2014 Aleksander Williams; Released under the MIT License */
(function(dust){

// Note: all error conditions are logged to console and failed silently

/* make a safe version of console if it is not available
 * currently supporting:
 *   _console.log
 * */
var _console = (typeof console !== 'undefined')? console: {
  log: function(){
     /* a noop*/
   }
};

function isSelect(context) {
  var value = context.current();
  return typeof value === "object" && value.isSelect === true;
}

// Utility method : toString() equivalent for functions
function jsonFilter(key, value) {
  if (typeof value === "function") {
    //to make sure all environments format functions the same way
    return value.toString()
      //remove all leading and trailing whitespace
      .replace(/(^\s+|\s+$)/mg, '')
      //remove new line characters
      .replace(/\n/mg, '')
      //replace , and 0 or more spaces with ", "
      .replace(/,\s*/mg, ', ')
      //insert space between ){
      .replace(/\)\{/mg, ') {')
    ;
  }
  return value;
}

// Utility method: to invoke the given filter operation such as eq/gt etc
function filter(chunk, context, bodies, params, filterOp) {
  params = params || {};
  var body = bodies.block,
      actualKey,
      expectedValue,
      filterOpType = params.filterOpType || '';
  // when @eq, @lt etc are used as standalone helpers, key is required and hence check for defined
  if ( typeof params.key !== "undefined") {
    actualKey = dust.helpers.tap(params.key, chunk, context);
  }
  else if (isSelect(context)) {
    actualKey = context.current().selectKey;
    //  supports only one of the blocks in the select to be selected
    if (context.current().isResolved) {
      filterOp = function() { return false; };
    }
  }
  else {
    _console.log ("No key specified for filter in:" + filterOpType + " helper ");
    return chunk;
  }
  expectedValue = dust.helpers.tap(params.value, chunk, context);
  // coerce both the actualKey and expectedValue to the same type for equality and non-equality compares
  if (filterOp(coerce(expectedValue, params.type, context), coerce(actualKey, params.type, context))) {
    if (isSelect(context)) {
      context.current().isResolved = true;
    }
    // we want helpers without bodies to fail gracefully so check it first
    if(body) {
     return chunk.render(body, context);
    }
    else {
      _console.log( "Missing body block in the " + filterOpType + " helper ");
      return chunk;
    }
   }
   else if (bodies['else']) {
    return chunk.render(bodies['else'], context);
  }
  return chunk;
}

function coerce (value, type, context) {
  if (value) {
    switch (type || typeof(value)) {
      case 'number': return +value;
      case 'string': return String(value);
      case 'boolean': {
        value = (value === 'false' ? false : value);
        return Boolean(value);
      }
      case 'date': return new Date(value);
      case 'context': return context.get(value);
    }
  }

  return value;
}

var helpers = {

  // Utility helping to resolve dust references in the given chunk
  // uses the Chunk.render method to resolve value
  /*
   Reference resolution rules:
   if value exists in JSON:
    "" or '' will evaluate to false, boolean false, null, or undefined will evaluate to false,
    numeric 0 evaluates to true, so does, string "0", string "null", string "undefined" and string "false". 
    Also note that empty array -> [] is evaluated to false and empty object -> {} and non-empty object are evaluated to true
    The type of the return value is string ( since we concatenate to support interpolated references 

   if value does not exist in JSON and the input is a single reference: {x}
     dust render emits empty string, and we then return false   
     
   if values does not exist in JSON and the input is interpolated references : {x} < {y}
     dust render emits <  and we return the partial output 
     
  */
  "tap": function(input, chunk, context) {
    // return given input if there is no dust reference to resolve
    // dust compiles a string/reference such as {foo} to a function
    if (typeof input !== "function") {
      return input;
    }

    var dustBodyOutput = '',
      returnValue;

    //use chunk render to evaluate output. For simple functions result will be returned from render call,
    //for dust body functions result will be output via callback function
    returnValue = chunk.tap(function(data) {
      dustBodyOutput += data;
      return '';
    }).render(input, context);

    chunk.untap();

    //assume it's a simple function call if return result is not a chunk
    if (returnValue.constructor !== chunk.constructor) {
      //use returnValue as a result of tap
      return returnValue;
    } else if (dustBodyOutput === '') {
      return false;
    } else {
      return dustBodyOutput;
    }
  },

  "sep": function(chunk, context, bodies) {
    var body = bodies.block;
    if (context.stack.index === context.stack.of - 1) {
      return chunk;
    }
    if(body) {
     return bodies.block(chunk, context);
    }
    else {
     return chunk;
    }
  },

  "idx": function(chunk, context, bodies) {
    var body = bodies.block;
     if(body) {
       return bodies.block(chunk, context.push(context.stack.index));
     }
     else {
       return chunk;
     }
  },

  /**
   * contextDump helper
   * @param key specifies how much to dump.
   * "current" dumps current context. "full" dumps the full context stack.
   * @param to specifies where to write dump output.
   * Values can be "console" or "output". Default is output.
   */
  "contextDump": function(chunk, context, bodies, params) {
    var p = params || {},
      to = p.to || 'output',
      key = p.key || 'current',
      dump;
    to = dust.helpers.tap(to, chunk, context);
    key = dust.helpers.tap(key, chunk, context);
    if (key === 'full') {
      dump = JSON.stringify(context.stack, jsonFilter, 2);
    }
    else {
      dump = JSON.stringify(context.stack.head, jsonFilter, 2);
    }
    if (to === 'console') {
      _console.log(dump);
      return chunk;
    }
    else {
      return chunk.write(dump);
    }
  },
  /**
   if helper for complex evaluation complex logic expressions.
   Note : #1 if helper fails gracefully when there is no body block nor else block
          #2 Undefined values and false values in the JSON need to be handled specially with .length check
             for e.g @if cond=" '{a}'.length && '{b}'.length" is advised when there are chances of the a and b been
             undefined or false in the context
          #3 Use only when the default ? and ^ dust operators and the select fall short in addressing the given logic,
             since eval executes in the global scope
          #4 All dust references are default escaped as they are resolved, hence eval will block malicious scripts in the context
             Be mindful of evaluating a expression that is passed through the unescape filter -> |s
   @param cond, either a string literal value or a dust reference
                a string literal value, is enclosed in double quotes, e.g. cond="2>3"
                a dust reference is also enclosed in double quotes, e.g. cond="'{val}'' > 3"
    cond argument should evaluate to a valid javascript expression
   **/

  "if": function( chunk, context, bodies, params ){
    var body = bodies.block,
        skip = bodies['else'];
    if( params && params.cond){
      var cond = params.cond;
      cond = dust.helpers.tap(cond, chunk, context);
      // eval expressions with given dust references
      if(eval(cond)){
       if(body) {
        return chunk.render( bodies.block, context );
       }
       else {
         _console.log( "Missing body block in the if helper!" );
         return chunk;
       }
      }
      if(skip){
       return chunk.render( bodies['else'], context );
      }
    }
    // no condition
    else {
      _console.log( "No condition given in the if helper!" );
    }
    return chunk;
  },

  /**
   * math helper
   * @param key is the value to perform math against
   * @param method is the math method,  is a valid string supported by math helper like mod, add, subtract
   * @param operand is the second value needed for operations like mod, add, subtract, etc.
   * @param round is a flag to assure that an integer is returned
   */
  "math": function ( chunk, context, bodies, params ) {
    //key and method are required for further processing
    if( params && typeof params.key !== "undefined" && params.method ){
      var key  = params.key,
          method = params.method,
          // operand can be null for "abs", ceil and floor
          operand = params.operand,
          round = params.round,
          mathOut = null,
          operError = function(){_console.log("operand is required for this math method"); return null;};
      key  = dust.helpers.tap(key, chunk, context);
      operand = dust.helpers.tap(operand, chunk, context);
      //  TODO: handle  and tests for negatives and floats in all math operations
      switch(method) {
        case "mod":
          if(operand === 0 || operand === -0) {
            _console.log("operand for divide operation is 0/-0: expect Nan!");
          }
          mathOut = parseFloat(key) %  parseFloat(operand);
          break;
        case "add":
          mathOut = parseFloat(key) + parseFloat(operand);
          break;
        case "subtract":
          mathOut = parseFloat(key) - parseFloat(operand);
          break;
        case "multiply":
          mathOut = parseFloat(key) * parseFloat(operand);
          break;
        case "divide":
         if(operand === 0 || operand === -0) {
           _console.log("operand for divide operation is 0/-0: expect Nan/Infinity!");
         }
          mathOut = parseFloat(key) / parseFloat(operand);
          break;
        case "ceil":
          mathOut = Math.ceil(parseFloat(key));
          break;
        case "floor":
          mathOut = Math.floor(parseFloat(key));
          break;
        case "round":
          mathOut = Math.round(parseFloat(key));
          break;
        case "abs":
          mathOut = Math.abs(parseFloat(key));
          break;
        default:
          _console.log( "method passed is not supported" );
     }

      if (mathOut !== null){
        if (round) {
          mathOut = Math.round(mathOut);
        }
        if (bodies && bodies.block) {
          // with bodies act like the select helper with mathOut as the key
          // like the select helper bodies['else'] is meaningless and is ignored
          return chunk.render(bodies.block, context.push({ isSelect: true, isResolved: false, selectKey: mathOut }));
        } else {
          // self closing math helper will return the calculated output
          return chunk.write(mathOut);
        }
       } else {
        return chunk;
      }
    }
    // no key parameter and no method
    else {
      _console.log( "Key is a required parameter for math helper along with method/operand!" );
    }
    return chunk;
  },
   /**
   select helper works with one of the eq/ne/gt/gte/lt/lte/default providing the functionality
   of branching conditions
   @param key,  ( required ) either a string literal value or a dust reference
                a string literal value, is enclosed in double quotes, e.g. key="foo"
                a dust reference may or may not be enclosed in double quotes, e.g. key="{val}" and key=val are both valid
   @param type (optional), supported types are  number, boolean, string, date, context, defaults to string
   **/
  "select": function(chunk, context, bodies, params) {
    var body = bodies.block;
    // key is required for processing, hence check for defined
    if( params && typeof params.key !== "undefined"){
      // returns given input as output, if the input is not a dust reference, else does a context lookup
      var key = dust.helpers.tap(params.key, chunk, context);
      // bodies['else'] is meaningless and is ignored
      if( body ) {
       return chunk.render(bodies.block, context.push({ isSelect: true, isResolved: false, selectKey: key }));
      }
      else {
       _console.log( "Missing body block in the select helper ");
       return chunk;
      }
    }
    // no key
    else {
      _console.log( "No key given in the select helper!" );
    }
    return chunk;
  },

  /**
   eq helper compares the given key is same as the expected value
   It can be used standalone or in conjunction with select for multiple branching
   @param key,  The actual key to be compared ( optional when helper used in conjunction with select)
                either a string literal value or a dust reference
                a string literal value, is enclosed in double quotes, e.g. key="foo"
                a dust reference may or may not be enclosed in double quotes, e.g. key="{val}" and key=val are both valid
   @param value, The expected value to compare to, when helper is used standalone or in conjunction with select
   @param type (optional), supported types are  number, boolean, string, date, context, defaults to string
   Note : use type="number" when comparing numeric
   **/
  "eq": function(chunk, context, bodies, params) {
    if(params) {
      params.filterOpType = "eq";
    }
    return filter(chunk, context, bodies, params, function(expected, actual) { return actual === expected; });
  },

  /**
   ne helper compares the given key is not the same as the expected value
   It can be used standalone or in conjunction with select for multiple branching
   @param key,  The actual key to be compared ( optional when helper used in conjunction with select)
                either a string literal value or a dust reference
                a string literal value, is enclosed in double quotes, e.g. key="foo"
                a dust reference may or may not be enclosed in double quotes, e.g. key="{val}" and key=val are both valid
   @param value, The expected value to compare to, when helper is used standalone or in conjunction with select
   @param type (optional), supported types are  number, boolean, string, date, context, defaults to string
   Note : use type="number" when comparing numeric
   **/
  "ne": function(chunk, context, bodies, params) {
    if(params) {
      params.filterOpType = "ne";
      return filter(chunk, context, bodies, params, function(expected, actual) { return actual !== expected; });
    }
   return chunk;
  },

  /**
   lt helper compares the given key is less than the expected value
   It can be used standalone or in conjunction with select for multiple branching
   @param key,  The actual key to be compared ( optional when helper used in conjunction with select)
                either a string literal value or a dust reference
                a string literal value, is enclosed in double quotes, e.g. key="foo"
                a dust reference may or may not be enclosed in double quotes, e.g. key="{val}" and key=val are both valid
   @param value, The expected value to compare to, when helper is used standalone  or in conjunction with select
   @param type (optional), supported types are  number, boolean, string, date, context, defaults to string
   Note : use type="number" when comparing numeric
   **/
  "lt": function(chunk, context, bodies, params) {
     if(params) {
       params.filterOpType = "lt";
       return filter(chunk, context, bodies, params, function(expected, actual) { return actual < expected; });
     }
  },

  /**
   lte helper compares the given key is less or equal to the expected value
   It can be used standalone or in conjunction with select for multiple branching
   @param key,  The actual key to be compared ( optional when helper used in conjunction with select)
                either a string literal value or a dust reference
                a string literal value, is enclosed in double quotes, e.g. key="foo"
                a dust reference may or may not be enclosed in double quotes, e.g. key="{val}" and key=val are both valid
   @param value, The expected value to compare to, when helper is used standalone or in conjunction with select
   @param type (optional), supported types are  number, boolean, string, date, context, defaults to string
   Note : use type="number" when comparing numeric
  **/
  "lte": function(chunk, context, bodies, params) {
     if(params) {
       params.filterOpType = "lte";
       return filter(chunk, context, bodies, params, function(expected, actual) { return actual <= expected; });
     }
    return chunk;
  },


  /**
   gt helper compares the given key is greater than the expected value
   It can be used standalone or in conjunction with select for multiple branching
   @param key,  The actual key to be compared ( optional when helper used in conjunction with select)
                either a string literal value or a dust reference
                a string literal value, is enclosed in double quotes, e.g. key="foo"
                a dust reference may or may not be enclosed in double quotes, e.g. key="{val}" and key=val are both valid
   @param value, The expected value to compare to, when helper is used standalone  or in conjunction with select
   @param type (optional), supported types are  number, boolean, string, date, context, defaults to string
   Note : use type="number" when comparing numeric
   **/
  "gt": function(chunk, context, bodies, params) {
    // if no params do no go further
    if(params) {
      params.filterOpType = "gt";
      return filter(chunk, context, bodies, params, function(expected, actual) { return actual > expected; });
    }
    return chunk;
  },

 /**
   gte helper, compares the given key is greater than or equal to the expected value
   It can be used standalone or in conjunction with select for multiple branching
   @param key,  The actual key to be compared ( optional when helper used in conjunction with select)
                either a string literal value or a dust reference
                a string literal value, is enclosed in double quotes, e.g. key="foo"
                a dust reference may or may not be enclosed in double quotes, e.g. key="{val}" and key=val are both valid
   @param value, The expected value to compare to, when helper is used standalone or in conjunction with select
   @param type (optional), supported types are  number, boolean, string, date, context, defaults to string
   Note : use type="number" when comparing numeric
  **/
  "gte": function(chunk, context, bodies, params) {
     if(params) {
      params.filterOpType = "gte";
      return filter(chunk, context, bodies, params, function(expected, actual) { return actual >= expected; });
     }
    return chunk; 
  },

  // to be used in conjunction with the select helper
  // TODO: fix the helper to do nothing when used standalone
  "default": function(chunk, context, bodies, params) {
    // does not require any params
     if(params) {
        params.filterOpType = "default";
      }
     return filter(chunk, context, bodies, params, function(expected, actual) { return true; });
  },

  /**
  * size helper prints the size of the given key
  * Note : size helper is self closing and does not support bodies
  * @param key, the element whose size is returned
  */
  "size": function( chunk, context, bodies, params ) {
    var key, value=0, nr, k;
    params = params || {};
    key = params.key;
    if (!key || key === true) { //undefined, null, "", 0
      value = 0;
    }
    else if(dust.isArray(key)) { //array
      value = key.length;
    }
    else if (!isNaN(parseFloat(key)) && isFinite(key)) { //numeric values
      value = key;
    }
    else if (typeof key  === "object") { //object test
      //objects, null and array all have typeof ojbect...
      //null and array are already tested so typeof is sufficient http://jsperf.com/isobject-tests
      nr = 0;
      for(k in key){
        if(Object.hasOwnProperty.call(key,k)){
          nr++;
        }
      }
      value = nr;
    } else {
      value = (key + '').length; //any other value (strings etc.)
    }
    return chunk.write(value);
  }
  
  
};

dust.helpers = helpers;

})(typeof exports !== 'undefined' ? module.exports = require('dustjs-linkedin') : dust);

/* Dustin Helpers */
dust.helpers["for"] = function ( chunk, context, bodies, params ){
  params = params || {}
  var obj = params["$in"] || context.current()
    , keyVar = params["$key"] || "$key"
    , valueVar = params["$value"] || "$value"
    , body = bodies.block
    , key
    , value
    , contextObj

  if ( obj && body ) {
    for ( key in obj ) {
      if ( obj.hasOwnProperty(key) ) {
        value = obj[key]
        contextObj = {}
        contextObj[keyVar] = key
        contextObj[valueVar] = value
        contextObj.type = typeof value
        chunk = body(chunk, context.push(contextObj))
      }
    }
  }

  return chunk
}
;
dust.helpers.macro = function ( chunk, context, bodies, params ){
  var body = bodies.block
    , partial = params.partial
    , template

  delete params.partial
  context = context.push(params)

  if ( partial ) {
    template = dust.cache[partial]
    if( !template ) {
      console.error("Missing template: '"+partial+"'")
      return chunk
    }
    return template(chunk, context)
  }
  return body ? body(chunk, context) : chunk
};
dust.helpers["with"] = function ( chunk, context, bodies, params ){
  var body = bodies.block
  if ( body ) {
    chunk = body(chunk, context.push(context.current()))
  }
  return chunk
}

/* User Helpers */
dust.helpers.hello = function ( chunk, context, bodies, params ){
  var body = bodies.block
  context = context.push(params)
  chunk.write("hello ")
  return body ? body(chunk, context) : chunk
}
/* Dustin functions */
dust.onLoad = function ( template, done ){
  var script = document.createElement("script")
  script.src = "template/"+template+".js"
  script.async = false
  document.head.appendChild(script)
  var ok
    , error = null
  script.onload = function( e ){
    ok || done(error)
    ok = true
  }
  script.onerror = function( e ){
    ok || done(error = e)
    ok = true
  }
};
dust.renderElement = function( template, context, done ){
  dust.render(template, context, function( err, rendered ){
    if( err ) done(err)
    else{
      var div = document.createElement("div")
      div.innerHTML = rendered
      var fragment = document.createDocumentFragment()
      while ( div.childNodes.length ) {
        fragment.appendChild(div.childNodes[0])
      }
      done(null, fragment)
      div = fragment = null
    }
  })
}
