(function( dust, resolvePath ){
  dust.onLoad = function ( template, done ){
    var script = document.createElement("script")
    script.src = resolvePath+template+".js"
    script.async = false
    document.head.appendChild(script)
    var ok
    script.onload = function( e ){
      ok || done()
      ok = true
    }
    script.onerror = function( e ){
      ok || done()
      ok = true
    }
  }
}( dust || {}, "resolvePath" ))