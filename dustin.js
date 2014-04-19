var path = require("path")
var fs = require("fs")
var mkdirp = require("mkdirp")

/**
 * @return {Adapter}
 * */
function dustin( setup ){
  return new Adapter(setup)
}

module.exports = dustin

var dust = dustin.dust = require("dustjs-linkedin")

var origFormatter = dust.optimizers.format

dustin.preserveWhiteSpace = function ( preserve ){
  if ( preserve ) {
    dust.optimizers.format = origFormatter
  }
  else {
    dust.optimizers.format = function ( ctx, node ){ return node }
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
  onLoad = onLoad.replace(/"resolvePath"/, '"'+resolvePath+'"')
  scripts.forEach(function doCopy( clientScript ){
    var destPath = path.join(process.cwd(), dest, clientScript)
    var clientPath = path.join(__dirname, "node_modules/dustjs-linkedin/dist", clientScript)
    var script = dustin.read(clientPath)
    script += ";\n"+onLoad
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

dustin.loadPartial = function ( partials, partialName, src, cache ){
  var content = null
  partials.some(function ( partial ){
    if ( partial.name == partialName ) {
      if ( !cache || partial.content === null ) {
        content = dustin.read(partial.src)
        if ( cache && content != null ) {
          // make an actual object out of the template string
          // so it can be passed around by reference
          // because string primitives would be copied every time
          // let's hope it doesn't throw off engines
          // if they only do `typeof x != "string" -> Error..` at some point
          partial.content = new String(content)
        }
      }
      else {
        content = partial.content
      }
      return true
    }
    return false
  })
  if ( content == null ) {
    throw new Error("Partial '" + partialName + "' not found in '" + src + "'")
  }
  return content || ""
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
  this.cache = !!options.cache

  this.context = {}
  this.partials = []
  this.currentDustTemplate = null

  // By default Dust returns a "template not found" error
  // when a named template cannot be located in the cache.
  // Override onLoad to specify a fallback loading mechanism
  // (e.g., to load templates from the filesystem or a database).
  dust.onLoad = function ( name, cb ){
    cb(null, dustin.loadPartial(adapter.partials, name, adapter.currentDustTemplate, adapter.cache))
  }

  options.setup && options.setup(this, dust)
}

/**
 * @param locations{String[]} a list of partial file paths
 * @param [root]{String} partials root folder
 * */
Adapter.prototype.addPartials = function ( locations ){
  locations.forEach(function ( src ){
    this.partials.push({
      src: src,
      name: dustin.resolvePartialName(src, this.resolve),
      content: null
    })
  }, this)
}

Adapter.prototype.getPartialByName = function ( name ){
  var partial = null
  this.partials.some(function ( p ){
    if ( p.name === name ) {
      partial = p
      return true
    }
    return false
  })
  return partial
}
Adapter.prototype.getPartialBySrc = function ( src ){
  var partial = null
  this.partials.some(function ( p ){
    if ( p.src === src ) {
      partial = p
      return true
    }
    return false
  })
  return partial
}

Adapter.prototype.registerHelpers = function ( sources ){
  var adapter = this
  sources.forEach(function ( src ){
    try{
      require(src)(adapter, dustin, dust)
    }
    catch( e ){}
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
Adapter.prototype.render = function ( src, content, done ){
  try {
    var name = path.basename(src, path.extname(src))
    var adapter = this
    adapter.currentDustTemplate = src
    dust.loadSource(dust.compile(content, name))
    dust.render(name, adapter.context, function ( err, out ){
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
  }
}

/** ====================
 *  compile a template
 * ==================== */
Adapter.prototype.compile = function ( src, content, done ){
  try {
    var partial = this.getPartialBySrc(src)
      , name
    if ( partial ) {
      name = partial.name
    }
    else {
      name = dustin.nameOf(src)
    }
    var compiled = dust.compile(content, name)
    done(null, compiled)
  }
  catch ( e ) {
    done(e)
  }
}


