(function(){dust.register("elements/button",body_0);function body_0(chk,ctx){return chk.write("<button>").reference(ctx.get(["title"], false),ctx,"h").write("</button>");}return body_0;})();;
(function(){dust.register("elements/message",body_0);function body_0(chk,ctx){return chk.write("<div>hello ").reference(ctx.get(["name"], false),ctx,"h").write("!</div>");}return body_0;})();