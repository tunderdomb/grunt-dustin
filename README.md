grunt-dustin
============

## Adapter API

Acquire the singleton:

```js
var dustin = require("grunt-dustin")
var adapter = dustin(options)
```

### Adapter options


#### resolve

##### Type: `String`
##### Example: `"test/"`

```html
{>"some/partial"/}
```

will resolve to this template: `test/some/partial.dust`.


#### helpers

##### Type: `String`
##### Example: `"test/data/*.json"`

Passed directly to `adapter.data()`.


#### data

##### Type: `String`
##### Example: `"test/helpers/node/*.js"`


#### setup

##### Type: `Function`
##### Arguments: `this(adapter instance), dust`

Called at the end of adapter creation.


#### cache

##### Type: `Boolean`

Dust caches templates by default. You can control that behaviour with this option.
It's useful when a watch task keeps templates in memory,
and you'd want to see the changes made (for instance reloading the browser).
Setting caching to false prevents this persistence.


#### preserveWhiteSpace

##### Type: `Boolean`

Dust removes white space by default. You can control that with this option.


### Adapter methods


#### preserveWhiteSpace(Boolean)

Switch between whitespace modes.

#### loadPartial(String)

Load a partial by name.


#### data(String)

Creates a context object from json files.
The contents of the files are accessible by their file names in the templates.
Each file will be a global variable you can reference.

Example:

`people.json`

```json
[
  {"name": "Pepper Potts", "kind": "human"},
  {"name": "Spider-Man", "kind": "hero"},
  {"name": "Tony Stark", "kind": "hero"},
  {"name": "Hulk", "kind": "Hulk"}
]
```

```html
{#people}
  {.name} ({.kind})
{/people}
```

```html
Pepper Potts (human)
Spider-Man (hero)
Tony Stark (hero)
Hulk (Hulk)
```


#### render(src{String}, content{String}, context{Object}, done{Function})

Render the content with the given context, call done when finished.
src is just a reference for the file name. It's only purpose is keeping track of errors.

callback arguments: (error{Error}, renderedTemplate{String})


#### compile(src{String}, content{String}, done{Function})

Compile the given template content.
The template will be registered according to the src argument, resolved to the
`resolve` option passed to the adapter.

callback arguments: (error{Error}, renderedTemplate{String})


#### addView(app{Express App}, url{String}, template{String}, context{Object} )

This is a convenient method for express users.
It registers a `get()` on the app for the given url.
Inside the callback, it attempts to load
and render the given template with the given context and respond with it.

--------


## Grunt task

### Render options

#### render

##### Type: `Boolean`

This tells the task to render templates.

#### preserveWhiteSpace

##### Type: `Boolean`

Same as adapter option.

#### data

##### Type: `String`
##### Example: `"test/data/*.json"`

Passed to the adapter as the data option.

#### helpers

##### Type: `String`
##### Example: `"test/helpers/*.js"`

Register helpers for the render context.

Example helper file:

```js
dust.helpers.hello = function ( chunk, context, bodies, params ){
  return chunk.write("hello ")
}
```

#### cache

##### Type: `Boolean`

Propagates to the adapter cache option.


### Compile options

#### compile

##### Type: `Boolean`

This tells the target to compile templates.

#### preserveWhiteSpace

##### Type: `Boolean`

Same as for rendering.

#### concat

##### Type: `Boolean`

This tells the target to concatenate files into the dest file.
See the Grunt task config example for details.

### Copy options

#### copy

##### Type: `String`
##### Example: `"test/out/js/"`

Copy client side libraries to this folder.
If this option is set, rendering and compiling is ignored.

#### resolve

##### Type: `String`
##### Example: `"js/"`

The client side script will prefix partial paths with this to load them.

This:

```html
{>"some/partial"/}
```

will resolve to template: `js/some/partial.js`.

#### helpers

##### Type: `String`
##### Example: `"test/helpers/*.js"`

If set, the client scripts will include these helpers.

#### dustinHelpers

##### Type: `Boolean`

Include dustin helpers to client side.
You can see what helpers are available on the client side in the module dir `lib/client/helpers`.

#### dustHelpers

##### Type: `Boolean`

Include the [dustjs helpers](https://github.com/linkedin/dustjs-helpers) to client side.

### Task config

```js
grunt.initConfig({
  dustin: {
    // set global values for path resolution
    options: {
      // this prefixes partial lookup to shorten referencing
      resolve: "test/",
      setup: function( adapter, dust ){
        // whatever you want to do with dust before anything happens,
        // do it here
      }
    },
    copyClientLibs: {
      options: {
        // if the client option is present, every other is ignored
        // and client side libraries are copied to this dir
        copy: "test/out/js/",
        // set path resolution to client template loading
        // templates will attempt to load from this dir
        // example: {>"elements/message"/}
        // will load from template/elements/message.js
        resolve: "template/",
        helpers: "test/helpers/client/*.js",
        dustinHelpers: true,
        dustHelpers: true
      }
    },
    render: {
      options: {
        // this target renders html files
        render: true,
        // Dust removes white space by default. Don't do that now.
        preserveWhiteSpace: true,
        // create a global context from these json files
        // file names will be global properties
        data: "test/data/*.json",
        // execute these js files and let them register helpers
        helpers: "test/helpers/node/*.js",
        // this keeps the cache clear
        cache: false
      },
      expand: true,
      cwd: "test/page",
      src: "*.dust",
      dest: "test/out/",
      ext: ".html"
    },
    compile: {
      options: {
        // this target compiles js files
        compile: true,
        // we don't care about white space in compiled templates
        preserveWhiteSpace: false
      },
      expand: true,
      cwd: "test/",
      src: "elements/*.dust",
      dest: "test/out/template/",
      ext: ".js"
    },
    compileAndConcat: {
      options: {
        preserveWhiteSpace: false,
        compile: true,
        // this one concats compiled files into one
        concat: true
      },
      files: {
        "test/out/template/elements.js": "test/elements/*.dust"
      }
    }
  }
})
```

## Licence

MIT