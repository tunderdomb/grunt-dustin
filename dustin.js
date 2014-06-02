var path = require("path")
var fs = require("fs")
var mkdirp = require("mkdirp")
var glob = require("glob")

// singleton
var adapter

/**
 * @return {Adapter}
 * */
function dustin( setup ){
  adapter = adapter || new Adapter(setup)
  return adapter
}

module.exports = dustin

// dustjs helpers
var dust = dustin.dust = require("dustjs-linkedin")
var helpers = require("dustjs-helpers")
dust.helpers = helpers.helpers

// dist client libs
var dustLibs = [
  "dust-core.js",
  "dust-core.min.js",
  "dust-full.js",
  "dust-full.min.js"
]

// custom client libs
var clientLibs = (function ( dustHelpersString ){
  for ( var helper in helpers ) {
    dustHelpersString += "dust.helpers." + helper + " = " + helpers[helper].toString() + ";\n"
  }
  return dustHelpersString + glob.sync(path.join(__dirname, "client/**/*.js")).map(dustin.read).join(";\n")
}(""))

// node helpers
var nativeHelpers = glob.sync(path.join(__dirname, "helpers/*.js")).map(function ( builtInHelper ){
  return require(builtInHelper)
})

// called when singleton first created to register custom node helpers
function registerNativeHelpers( adapter ){
  nativeHelpers.forEach(function ( nativeHelper ){
    nativeHelper(adapter, dustin, dust, dust.helpers)
  })
}

// save original formatter's reference
var origFormatter = dust.optimizers.format

// switch between minified and unformatted rendering
dustin.preserveWhiteSpace = function ( preserve ){
  if ( preserve ) {
    dust.optimizers.format = function ( ctx, node ){ return node }
  }
  else {
    dust.optimizers.format = origFormatter
  }
}

/**
 * Copy all dist files from the dust repo to the destination
 * and concat the onLoad function to each them.
 * */
dustin.copyClient = function ( dest, resolvePath ){
  var clientScript = clientLibs.replace(/"RESOLVE_PATH"/, '"' + resolvePath + '"')

  dustLibs.forEach(function doCopy( dustScript ){
    var destPath = path.join(process.cwd(), dest, dustScript)
    var clientPath = path.join(__dirname, "node_modules/dustjs-linkedin/dist", dustScript)
    var script = dustin.read(clientPath)
    script += ";\n" + clientScript
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

  if ( options.helpers ) this.registerHelpers(options.helpers)
  if ( options.data ) this.data(options.data)

  // By default Dust returns a "template not found" error
  // when a named template cannot be located in the cache.
  // Override onLoad to specify a fallback loading mechanism
  // (e.g., to load templates from the filesystem or a database).
  dust.onLoad = function ( name, cb ){
    cb(null, adapter.loadPartial(name))
  }
  options.setup && options.setup(this, dust)
}

/**
 * load a partial from disk by name
 * uses the resolve property to construct a path with the current working dir for a dust template.
 * appends .dust to the name argument.
 * @param name{String} the name of a dust template relative to `this.resolve` path.
 * */
Adapter.prototype.loadPartial = function ( name ){
  var partial = this.partials[name]
  var content
  if ( !this.cache || !partial ) {
    var src = path.join(process.cwd(), this.resolve, name + ".dust")
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
  if ( !content ) {
    throw new Error("Partial '" + name + "' not found in '" + this.currentDustTemplate + "'")
  }
  return content
}

/**
 * @param sources{String|String[]} .js file paths
 * */
Adapter.prototype.registerHelpers = function ( sources ){
  var adapter = this
  if ( typeof sources == "string" ) {
    sources = glob.sync(sources)
  }
  sources.forEach(function ( src ){
    src = path.join(process.cwd(), src)
    try {
      require(src)(adapter, dustin, dust)
    }
    catch ( e ) {
      console.error("Couldn't load helper '" + src + "'", e)
    }
  })
}

/**
 * @param sources{String|String[]} .json file paths
 * */
Adapter.prototype.data = function ( sources ){
  var context = this.context
  if ( typeof sources == "string" ) {
    sources = glob.sync(sources)
  }
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

function renderView( src, res, next, content, context ){
  this.render(src, content, context, function ( err, rendered ){
    if ( err ) {
      next(err)
    }
    else {
      res.send(rendered)
    }
  })
}

/**
 * registers a route to an express app.
 * If the route matches, it will render `template` relative to `this.resolveSrc`.
 * .dust is appended automatically.
 * @param app {Function} an express app
 * @param url {Function} a route to match
 * @param template {Function} a template to render
 * @param [context] {Function} optional context for this template
 * */
Adapter.prototype.addView = function ( app, url, template, context ){
  var adapter = this
  template = path.join(this.resolveSrc, template + ".dust")
  app.get(url, function ( req, res, next ){
    fs.readFile(template, "utf8", function ( err, content ){
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
          renderView.call(adapter, template, res, next, content, context)
        })
      }
      else {
        renderView.call(adapter, template, res, next, content, context)
      }
    })
  })
}