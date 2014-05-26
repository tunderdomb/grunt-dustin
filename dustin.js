var path = require("path")
var fs = require("fs")
var mkdirp = require("mkdirp")
var glob = require("glob")

var adapter

/**
 * @return {Adapter}
 * */
function dustin( setup ){
  adapter = adapter || new Adapter(setup)
  return adapter
}

module.exports = dustin

var dust = dustin.dust = require("dustjs-linkedin")
var helpers = require("dustjs-helpers")
dust.helpers = helpers.helpers
var nativeHelpers = glob.sync(path.join(__dirname, "helpers/*.js")).map(function ( builtInHelper ){
  return require(builtInHelper)
})

function registerNativeHelpers( adapter ){
  nativeHelpers.forEach(function ( nativeHelper ){
    nativeHelper(adapter, dustin, dustin.dust, dustin.dust.helpers)
  })
}

var origFormatter = dust.optimizers.format

dustin.preserveWhiteSpace = function ( preserve ){
  if ( preserve ) {
    dust.optimizers.format = function ( ctx, node ){ return node }
  }
  else {
    dust.optimizers.format = origFormatter
  }
}

function copy( src, dest ){
  mkdirp.sync(path.dirname(dest))
  fs.createReadStream(src)
    .pipe(fs.createWriteStream(dest))
  console.log("Copied client libs: '%s'", dest)
}

/**
 * Copy all dist files from the dust repo to the destination
 * and concat the onLoad function to each them.
 * */
dustin.copyClient = function ( dest, resolvePath ){
  var onLoad = dustin.read(path.join(__dirname, "client/onLoad.js"))
    , scripts = [
      "dust-core.js",
      "dust-core.min.js",
      "dust-full.js",
      "dust-full.min.js"
    ]
  onLoad = onLoad.replace(/"resolvePath"/, '"' + resolvePath + '"')
  scripts.forEach(function doCopy( clientScript ){
    var destPath = path.join(process.cwd(), dest, clientScript)
    var clientPath = path.join(__dirname, "node_modules/dustjs-linkedin/dist", clientScript)
    var script = dustin.read(clientPath)
    script += ";\n" + onLoad
    mkdirp.sync(path.dirname(destPath))
    fs.writeFileSync(destPath, script, "utf8")
  })
}

dustin.read = function ( src ){
  try {
    return fs.readFileSync(src, "utf8")
  }
  catch ( e ) {
    return null
  }
}

dustin.nameOf = function ( src ){
  return path.basename(src, path.extname(src))
}

dustin.extend = function ( obj, extension ){
  for ( var prop in extension ) {
    obj[prop] = extension[prop]
  }
  return obj
}

dustin.merge = function ( obj, extension ){
  var ret = {}
    , prop
  for ( prop in obj ) {
    ret[prop] = obj[prop]
  }
  for ( prop in extension ) {
    ret[prop] = extension[prop]
  }
  return ret
}

/**
 * resolve a partial name to a proper path part
 * @example
 *
 * var root = "res/partials/"
 *   , src = "res/partials/services/blabla.mustache"
 * resolvePartialName( src, root ) -> services/blabla
 *
 * @param src{String} the full partial source from the partials list (Adapter.partials)
 * @param root{String} the partials' root folder
 * */
dustin.resolvePartialName = function ( src, root ){
  if ( !root ) return src
  root = (root).replace(/\/+$/, "")
  src = src.replace(root, "").replace(/^\/|\.\w*?$/g, "")
  return src
}

/**
 * Adapter
 * constructor for a template object
 * */
function Adapter( options ){
  options = options || {}
  var adapter = this

  this.resolve = options.resolve || ""
  this.resolveSrc = options.resolveSrc || process.cwd()
  this.cache = !!options.cache

  dustin.preserveWhiteSpace(!!options.preserveWhiteSpace)
  registerNativeHelpers(adapter)

  this.context = {}
  this.partials = {}
  // keep track of the current root template for error reporting
  this.currentDustTemplate = null

  // By default Dust returns a "template not found" error
  // when a named template cannot be located in the cache.
  // Override onLoad to specify a fallback loading mechanism
  // (e.g., to load templates from the filesystem or a database).
  dust.onLoad = function ( name, cb ){
    cb(null, adapter.loadPartial(name))
  }
  options.setup && options.setup(this, dust)
}

Adapter.prototype.loadPartial = function ( name ){
  var partial = this.partials[name]
  var content
  if ( !this.cache || !partial ) {
    var src = path.join(process.cwd(), this.resolve, name+".dust")
    content = dustin.read(src)
    if ( this.cache && partial ) {
      this.partials[name] = {
        src: src,
        name: name,
        content: content
      }
    }
  }
  else {
    content = partial && partial.content
  }
  if( !content ) {
    throw new Error("Partial '" + name + "' not found in '" + this.currentDustTemplate + "'")
  }
  return content
}

Adapter.prototype.registerHelpers = function ( sources ){
  var adapter = this
  sources.forEach(function ( src ){
    src = path.join(process.cwd(), src)
    try {
      require(src)(adapter, dustin, dust)
    }
    catch ( e ) {}
  })
}

/**
 * @param sources{String[]} .json file paths
 * */
Adapter.prototype.data = function ( sources ){
  var context = this.context
  sources.forEach(function ( file ){
    try {
      context[dustin.nameOf(file)] = JSON.parse(dustin.read(file))
    }
    catch ( e ) {
      console.warn("Invalid data path: '" + file + "'")
    }
  })
}

/** ====================
 *  Render a template
 * ==================== */
Adapter.prototype.render = function ( src, content, context, done ){
  var adapter = this

  context = context
    ? dustin.merge(adapter.context, context)
    : adapter.context

  try {
    var name = path.basename(src, path.extname(src))
    adapter.currentDustTemplate = src
    dust.loadSource(dust.compile(content, name))
    dust.render(name, context, function ( err, out ){
      done(err, out)
      // clear dust cache each time a root template is rendered
      // because there's no other way r/n to disable caching
      if ( !adapter.cache ) {
        dust.cache = {}
      }
      delete adapter.currentDustTemplate
    })
  }
  catch ( e ) {
    done(e)
    if ( !adapter.cache ) {
      dust.cache = {}
    }
    delete adapter.currentDustTemplate
  }
}

/** ====================
 *  compile a template
 * ==================== */
Adapter.prototype.compile = function ( src, content, done ){
  try {
    var name = dustin.resolvePartialName(src, this.resolve)
    var compiled = dust.compile(content, name)
    done(null, compiled)
  }
  catch ( e ) {
    done(e)
  }
}

Adapter.prototype.renderView = function ( src, res, next, content, context ){
  this.render(src, content, context, function ( err, rendered ){
    if ( err ) {
      next(err)
    }
    else {
      res.send(rendered)
    }
  })
}

Adapter.prototype.addView = function ( app, url, src, context ){
  var adapter = this
  src = path.join(this.resolveSrc, src + ".dust")
  app.get(url, function ( req, res, next ){
    fs.readFile(src, "utf8", function ( err, content ){
      if ( err ) {
        next(err)
        return
      }
      if ( typeof context == "function" ) {
        context(function ( err, context ){
          if ( err ) {
            next(err)
            return
          }
          adapter.renderView(src, res, next, content, context)
        })
      }
      else {
        adapter.renderView(src, res, next, content, context)
      }
    })
  })
}