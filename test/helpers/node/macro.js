module.exports = function ( adapter, dustin, dust ){
  dust.helpers.macro = function ( chunk, context, bodies, params ){
    var body = bodies.block
    context = context.push(params)
    chunk.write("hello ")
    return body ? body(chunk, context) : chunk
  }
}