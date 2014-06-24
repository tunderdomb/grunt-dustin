var path = require("path")
var glob = require("glob")

var util = require("./util")
var lib = require("./lib")

util.extend(dustin, lib)

// dustjs helpers
var dust = dustin.dust = require("dustjs-linkedin")
var helpers = require("dustjs-helpers")
dust.helpers = helpers.helpers

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

function nameOf( src ){
  return path.basename(src, path.extname(src))
}

function resolveTemplateName( templatePath, resolveDir ){
  return templatePath
    .replace(/\\/g, "/")
    .replace(resolveDir, "")
    .replace(process.cwd().replace(/\\/g, "/"), "")
    .replace(".dust", "")
}

function resolveTemplatePath( resolveDir, template ){
  return path.join(process.cwd(), resolveDir, template + ".dust")
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
function resolvePartialName( src, root ){
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
  this.cache = !!options.cache

  dustin.preserveWhiteSpace(!!options.preserveWhiteSpace)
  lib.registerHelpers(adapter, dustin, dust)

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
 * switch between minified and unformatted rendering
 * */
Adapter.prototype.preserveWhiteSpace = function( preserve ){
  dustin.preserveWhiteSpace(preserve)
  return this
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
    var src = resolveTemplatePath(this.resolve, name)
    content = util.read(src)
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
      context[nameOf(file)] = JSON.parse(util.read(file))
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
    ? util.merge(adapter.context, context)
    : adapter.context

  var name = resolveTemplateName(src, this.resolve)

  try {
    adapter.currentDustTemplate = src
    if ( content ) {
      dust.loadSource(dust.compile(content, name))
    }
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
    var name = resolvePartialName(src, this.resolve)
    var compiled = dust.compile(content, name)
    done(null, compiled)
  }
  catch ( e ) {
    done(e)
  }
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

  function render( res, next, context ){
    adapter.render(template, null, context, function ( err, rendered ){
      if ( err ) next(err)
      else res.send(rendered)
    })
  }

  app.get(url, function ( req, res, next ){
    if ( typeof context == "function" ) {
      context(req, res, function setContext( err, context ){
        if ( err ) next(err)
        else render(res, next, context)
      })
    }
    else render(res, next)
  })
}